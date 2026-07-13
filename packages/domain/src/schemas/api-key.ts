/**
 * Bot API key domain sözleşmeleri — Public API + Bot Erişimi (2026-07-13, Task 2).
 *
 * Eksen ayrımı:
 *  - Domain (bu dosya): rol Zod şeması (saf, I/O yok, framework-bağımsız).
 *  - Backend (`packages/api/src/lib/api-key-token.ts`): token üretimi/hash
 *    (`node:crypto` gerektirdiği için domain'e **konmaz**).
 *  - Key yönetimi (`packages/api/src/routers/board-api-keys.ts`, Task 7):
 *    persistans + `canManageBoard` enforcement.
 *
 * Önce-belge: `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
import { z } from 'zod';
import type { BoardRole } from '../constants';
import { idSchema } from './common';

/**
 * Bir bot key'ine verilebilecek roller — board rollerinin **katı alt kümesi**.
 * `admin` bilinçle dışarıda: pano yönetimi (ayar, üye, kalıcı silme) insan
 * sorumluluğunda kalır, saldırı yüzeyi küçülür. `satisfies` guard'ı bu dizinin
 * her zaman geçerli board rolleri içerdiğini derleme zamanında garanti eder
 * (constants'taki `BOARD_ROLES` ile drift olmaz).
 */
export const API_KEY_ROLES = ['member', 'viewer'] as const satisfies readonly BoardRole[];

/** Bot key rolü — `member` (varsayılan) veya `viewer`; `admin` reddedilir. */
export const apiKeyRoleSchema = z.enum(API_KEY_ROLES);

export type ApiKeyRole = z.infer<typeof apiKeyRoleSchema>;

/**
 * Bir pano başına aynı anda **aktif** (henüz iptal edilmemiş, `revoked_at IS NULL`)
 * API key üst sınırı (L4). Key üretimi bir bot kullanıcı + workspace/board üyeliği
 * satırı doğurduğundan sınırsız üretim üyelik tablolarını şişirir ve saldırı
 * yüzeyini büyütür; sınır `board.apiKeys.create` procedure'ünde enforce edilir
 * (iptal edilen key sınırdan düşer, yeniden yer açılır). Bkz.
 * `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
export const MAX_ACTIVE_API_KEYS_PER_BOARD = 20;

/** Bot görünen adı = key adı. `board_members`/aktivite render'ı bu adı gösterir. */
export const apiKeyNameSchema = z.string().trim().min(1).max(100);

/**
 * `board.apiKeys.create` input. `boardProcedure` ham input'tan `boardId` okur.
 *  - `role` verilmezse `member` (bot varsayılanı).
 *  - `expiresAt` opsiyonel: ISO datetime string veya `Date`; `z.coerce.date()`
 *    ikisini de `Date`'e çevirir. Verilmezse süresiz key. Verilirse **gelecekte**
 *    olmalı (L2 — key doğduğu anda süresi geçmiş olamaz; geçmiş tarih auth
 *    middleware'inde hemen reddedilir, sessizce ölü bir key üretmek yerine
 *    girdide erken reddedilir).
 */
export const createBoardApiKeyInput = z.object({
  boardId: idSchema,
  name: apiKeyNameSchema,
  role: apiKeyRoleSchema.default('member'),
  expiresAt: z.coerce
    .date()
    .refine((value) => value.getTime() > Date.now(), {
      message: 'Geçerlilik tarihi gelecekte bir tarih olmalı.',
    })
    .optional(),
});

/** `board.apiKeys.revoke` input — key'i iptal et (idempotent). */
export const revokeBoardApiKeyInput = z.object({
  boardId: idSchema,
  apiKeyId: idSchema,
});

/** `board.apiKeys.list` input — panonun key envanteri (yalnız board admin). */
export const listBoardApiKeysInput = z.object({
  boardId: idSchema,
});

export type CreateBoardApiKeyInput = z.infer<typeof createBoardApiKeyInput>;
export type RevokeBoardApiKeyInput = z.infer<typeof revokeBoardApiKeyInput>;
export type ListBoardApiKeysInput = z.infer<typeof listBoardApiKeysInput>;
