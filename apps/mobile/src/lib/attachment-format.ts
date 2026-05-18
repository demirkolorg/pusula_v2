/**
 * Kart eki — saf biçimleme + doğrulama yardımcıları (Faz 7J).
 *
 * Çerçeve-bağımsız: yalnız `@pusula/domain` sabitlerini kullanır, RN/Expo
 * modülü import etmez — `attachment-format.test.ts` ile birim test edilir
 * (`search-target.ts` deseni). Yükleme akışı ve UI bileşenleri bu modülü
 * tüketir.
 */
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  type AttachmentKind,
  type AttachmentMimeType,
} from '@pusula/domain';
import type { IconName } from '@/components/icon';

/**
 * Verilen MIME tipi Faz 11 allowlist'inde mi (backend `attachment.initiate`
 * Zod `z.enum(ATTACHMENT_MIME_TYPES)` ile aynı küme — 8 tip).
 */
export function isAllowedAttachmentMime(
  mime: string | null | undefined,
): mime is AttachmentMimeType {
  return mime != null && (ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime);
}

/** Dosya uzantısı → allowlisted MIME eşlemesi (picker `mimeType` vermezse yedek). */
const EXTENSION_MIME: Readonly<Record<string, AttachmentMimeType>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Dosya adının uzantısından allowlisted MIME türetir; bulunamazsa `null`. */
export function mimeFromFileName(
  fileName: string | null | undefined,
): AttachmentMimeType | null {
  if (!fileName) return null;
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return null;
  return EXTENSION_MIME[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Etkin MIME tipini çözer: picker'ın verdiği `mimeType` allowlist'teyse onu,
 * değilse dosya adından türetilen yedek MIME'ı döndürür — ikisi de yoksa `null`.
 * Kamera/galeri/dosya seçici platformlara göre `mimeType`'ı boş bırakabilir.
 */
export function resolveAttachmentMime(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): AttachmentMimeType | null {
  return isAllowedAttachmentMime(mimeType) ? mimeType : mimeFromFileName(fileName);
}

/** {@link validatePickedFile} sonucu — başarıda çözülen MIME, başarısızlıkta sebep. */
export type PickedFileValidation =
  | { ok: true; mimeType: AttachmentMimeType }
  | { ok: false; reason: 'mime' | 'size' | 'empty' };

/**
 * Seçilen dosyayı yükleme öncesi doğrular — backend allowlist (8 MIME) + 50 MiB
 * sınırıyla aynı kural. UI kullanıcıya erken/net hata gösterir; geçersiz dosya
 * için `attachment.initiate` hiç çağrılmaz (presigned URL israfı yok).
 */
export function validatePickedFile(input: {
  mimeType: string | null | undefined;
  fileName: string | null | undefined;
  size: number | null | undefined;
}): PickedFileValidation {
  const mime = resolveAttachmentMime(input.mimeType, input.fileName);
  if (mime == null) return { ok: false, reason: 'mime' };
  if (input.size == null || !Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, reason: 'empty' };
  }
  if (input.size > ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, mimeType: mime };
}

/** İnsan-okur dosya boyutu — Türkçe ondalık ayıracı (virgül), 1024 tabanı. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Bayt tam sayı kalır; KB ve üstü tek ondalık basamak gösterir.
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/** Ek "kind" değerine göre tile sol ikonu (`@expo/vector-icons` Feather adı). */
export function attachmentIconName(kind: AttachmentKind | null): IconName {
  switch (kind) {
    case 'image':
      return 'image';
    case 'pdf':
    case 'office':
      return 'file-text';
    default:
      return 'file';
  }
}

/**
 * İndirilen dosyayı önbelleğe yazarken kullanılacak güvenli dosya adı —
 * yol ayıracı / kontrol karakterleri sadeleştirilir, ad boş kalmaz.
 */
export function safeCacheFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safe.length > 0 ? safe : 'ek-dosyasi';
}

/**
 * MinIO'ya doğrudan PUT sırasında ilerleme yüzdesi (0–100 tamsayı) — Faz 7P.
 * `expo-file-system` `createUploadTask` progress callback'i `totalBytesSent`
 * ve `totalBytesExpectedToSend` verir; bu saf helper onları kullanıcıya
 * gösterilen yüzdeye çevirir. Beklenen boyut bilinmiyorsa (≤0 ya da geçersiz)
 * `0` döner — belirsiz durumda çağıran taraf spinner gösterir.
 */
export function uploadPercent(sent: number, expected: number): number {
  if (!Number.isFinite(sent) || !Number.isFinite(expected) || expected <= 0) return 0;
  const ratio = sent / expected;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
}
