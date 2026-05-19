import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from '@pusula/api';
import { env } from './env';

/**
 * İstemciye verilen TÜM S3 URL'lerinin (presigned PUT/GET + kalıcı `publicUrl`)
 * baz origin'i — host'ları istemcinin erişebildiği bir origin'i göstermeli.
 * İki ortam:
 *
 *  - Üretim: `S3_PUBLIC_URL` (public MinIO subdomain). `S3_ENDPOINT` içeride
 *    `http://minio:9000` — tarayıcı/cihaz erişemez + HTTPS sayfada mixed-content.
 *  - Yerel geliştirme: `S3_PUBLIC_URL` boş; `S3_ENDPOINT` = `http://localhost:9100`.
 *    Dev makinesindeki tarayıcı `localhost`'a ulaşır ama mobil cihaz `localhost`'u
 *    KENDİSİ sanar. Çözüm: baz host'u, istemcinin API'ye eriştiği `Host`'tan türet
 *    (`apps/mobile/src/lib/api-url.ts`'in sunucu karşılığı) — `S3_ENDPOINT`'ten
 *    yalnız şema + port korunur, hostname istek host'undan gelir. SigV4 `host`'u
 *    imzaladığından (`X-Amz-SignedHeaders=host`) bu, presigned URL'lerde imzadan
 *    ÖNCE yapılmalı; presigned URL'i sonradan yeniden yazmak imzayı bozar.
 *
 * Bkz. `docs/architecture/09-depolama-ve-arama.md` §9.1.2 (DEM-215).
 */
function resolveClientBaseUrl(requestHost?: string): string {
  // Üretim: açık public origin — istekten ASLA türetilmez (üretimde `Host`
  // reverse-proxy'den gelir, güvenilmez).
  if (env.S3_PUBLIC_URL) return env.S3_PUBLIC_URL;
  // Dev + istek host'u yoksa eski davranış (`S3_ENDPOINT` — web/dev için doğru).
  if (!requestHost) return env.S3_ENDPOINT;
  try {
    const endpoint = new URL(env.S3_ENDPOINT);
    // `S3_ENDPOINT`'ten şema + port korunur; hostname istek host'undan gelir.
    endpoint.hostname = new URL(`http://${requestHost}`).hostname;
    return endpoint.toString().replace(/\/+$/, '');
  } catch {
    return env.S3_ENDPOINT;
  }
}

// S3Client yalnız presign için kullanılır — getSignedUrl saf crypto'dur, ağ
// çağrısı yapmaz. İstek host'u başına farklı endpoint çıkabildiğinden client'lar
// endpoint string'ine göre cache'lenir (dev'de host sayısı çok küçük).
const clientCache = new Map<string, S3Client>();
function s3ClientFor(endpoint: string): S3Client {
  const cached = clientCache.get(endpoint);
  if (cached) return cached;
  const client = new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  clientCache.set(endpoint, client);
  return client;
}

/** Path-style key encode — her `/`-segmenti ayrı escape edilir, `/`'ler ayraç kalır. */
function encodeStorageKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * İstek-kapsamlı `ObjectStorage`. `requestHost` = API'ye gelen isteğin `Host`
 * başlığı; yalnız yerel geliştirmede (`S3_PUBLIC_URL` boş) URL host'ları bundan
 * türetilir — üretimde her zaman `S3_PUBLIC_URL` kullanılır.
 *
 * `publicUrl` de (presigned URL'ler gibi) aynı baz host'u kullanır: mobil
 * cihazdan yüklenen avatarın kalıcı `users.image` URL'i `localhost` yerine
 * cihazın eriştiği LAN IP'sini taşır, böylece cihazda görüntülenebilir
 * (DEM-215 güncellemesi 2026-05-19). Üretimde her ikisi de sabit `S3_PUBLIC_URL`
 * aldığından kalıcı kayıt zaten sabittir; istekten türetme yalnız dev yolu.
 */
export function resolveObjectStorage(requestHost?: string): ObjectStorage {
  const baseUrl = resolveClientBaseUrl(requestHost);
  const s3 = s3ClientFor(baseUrl);
  const publicBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async createPresignedPutUrl(input) {
      const command = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      });
      // `content-length` MUST be in the signed headers — otherwise a caller
      // could request a presigned URL for `size: 1024` and then PUT a 5 GB
      // body, bypassing the 50 MiB Zod cap (Faz 11B — DEM-148 / security H1).
      // The browser sets `Content-Length` from the body automatically and
      // cannot override it, so a mismatched body is rejected by MinIO/S3.
      return {
        url: await getSignedUrl(s3, command, {
          expiresIn: 10 * 60,
          signableHeaders: new Set(['content-type', 'content-length']),
        }),
        headers: {
          'content-type': input.contentType,
          'content-length': String(input.contentLength),
        },
      };
    },

    async createPresignedGetUrl(input) {
      const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: input.key });
      // Varsayılan TTL 10 dk (tek-seferlik indirme / lightbox); `expiresIn`
      // verilirse onun kadar — kart kapak görseli URL'leri (DEM-227) 1 saat
      // ister, `board.get` client cache penceresinde URL ölmesin.
      return getSignedUrl(s3, command, { expiresIn: input.expiresIn ?? 10 * 60 });
    },

    publicUrl(key) {
      // Path-style URL (`forcePathStyle`): `{base}/{bucket}/{key}`.
      return `${publicBaseUrl}/${env.S3_BUCKET}/${encodeStorageKey(key)}`;
    },
  };
}
