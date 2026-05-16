import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from '@pusula/api';
import { env } from './env';

// This client is used ONLY to presign URLs (createPresignedPut/GetUrl) — a
// pure crypto operation, no network call. Presigned URLs are handed to the
// BROWSER, so they must target the public, browser-reachable origin
// (`S3_PUBLIC_URL`), not the internal `S3_ENDPOINT` (`http://minio:9000` in
// prod — unreachable, and mixed-content on an HTTPS page). Falls back to
// `S3_ENDPOINT` for local dev where that is already host-mapped & reachable.
const s3 = new S3Client({
  endpoint: env.S3_PUBLIC_URL ?? env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const objectStorage: ObjectStorage = {
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
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
    });
    return getSignedUrl(s3, command, { expiresIn: 10 * 60 });
  },

  publicUrl(key) {
    // Path-style URL (the client uses `forcePathStyle`): `{base}/{bucket}/{key}`.
    // Each `/`-separated key segment is encoded individually so the slashes
    // stay as path separators while stray bytes in a segment are escaped.
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    // `S3_PUBLIC_URL` is the browser-facing origin; `S3_ENDPOINT` is the
    // server-internal one (an unreachable Docker hostname in prod). Fall back
    // to `S3_ENDPOINT` only for local dev, where it is already host-mapped.
    const base = (env.S3_PUBLIC_URL ?? env.S3_ENDPOINT).replace(/\/+$/, '');
    return `${base}/${env.S3_BUCKET}/${encodedKey}`;
  },
};
