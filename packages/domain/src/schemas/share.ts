/**
 * Kart paylaşım linki Zod sözleşmeleri ve süre helper'ı — Faz 9A (DEM-127).
 *
 * Eksen ayrımı:
 *  - Domain (bu dosya): Zod input/output şemaları + saf süre hesabı.
 *  - Backend (`packages/api/src/routers/share.ts`, 9B): token üretimi, DB
 *    persistans, permission enforcement (`cardProcedure`).
 *  - Public yüzey (`apps/api/src/routes/share.ts`, 9C): misafir GET/POST,
 *    rate limit, header'lar.
 *
 * Önce-belge:
 *  - `docs/domain/08-paylasim-linki-kurallari.md` — kim oluşturur, misafir
 *    görme/yorum kuralları, otomatik geçersiz olma durumları
 *  - `docs/architecture/14-paylasim-linki-mimarisi.md` — veri modeli, tRPC API
 *    yüzeyi (`share.create` / `share.revoke` / `share.list`), token üretimi
 */
import { z } from 'zod';
import { DEFAULT_SHARE_LINK_EXPIRY_DAYS, SHARE_LINK_EXPIRY_PRESETS } from '../constants';
import { idSchema, withClientMutationId } from './common';

/** Allowed expiry duration when creating a new share link. */
export const shareLinkExpiryPresetSchema = z.union(
  SHARE_LINK_EXPIRY_PRESETS.map((days) => z.literal(days)) as [
    z.ZodLiteral<7>,
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
  ],
);

/** `share.create` input. `cardProcedure` reads `cardId` from the raw input. */
export const shareLinkCreateInput = z.object({
  cardId: idSchema,
  expiresInDays: shareLinkExpiryPresetSchema.default(DEFAULT_SHARE_LINK_EXPIRY_DAYS),
  ...withClientMutationId,
});

/** `share.revoke` input. */
export const shareLinkRevokeInput = z.object({
  cardId: idSchema,
  shareLinkId: idSchema,
  ...withClientMutationId,
});

/** `share.list` input — board member+ (viewer dahil — okuma). */
export const shareLinkListInput = z.object({
  cardId: idSchema,
});

/**
 * `share.create` response. **The plaintext token is only returned here**; later
 * `share.list` calls only expose `tokenPrefix`. UI must show "Şimdi kopyala"
 * once and warn the user the token cannot be retrieved again.
 */
export const shareLinkResponseSchema = z.object({
  id: idSchema,
  token: z.string().min(43),
  url: z.string().url(),
  expiresAt: z.date(),
});

/** One row in `share.list` — token plain is NOT included. */
export const shareLinkSummarySchema = z.object({
  id: idSchema,
  tokenPrefix: z.string().min(1).max(16),
  createdById: idSchema,
  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable(),
  revokedById: idSchema.nullable(),
  accessCount: z.number().int().min(0),
  lastAccessedAt: z.date().nullable(),
});

export type ShareLinkCreateInput = z.infer<typeof shareLinkCreateInput>;
export type ShareLinkRevokeInput = z.infer<typeof shareLinkRevokeInput>;
export type ShareLinkListInput = z.infer<typeof shareLinkListInput>;
export type ShareLinkResponse = z.infer<typeof shareLinkResponseSchema>;
export type ShareLinkSummary = z.infer<typeof shareLinkSummarySchema>;

const MS_PER_DAY = 86_400_000;

/**
 * Saf expiry hesabı: `now + days * 1 gün` (milisaniye aritmetiği — DST'den
 * etkilenmez). UTC bazında çalışır; çağıran istediği `now`'ı geçebilir, ya da
 * varsayılan olarak `new Date()` kullanılır.
 */
export function computeExpiresAt(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * MS_PER_DAY);
}
