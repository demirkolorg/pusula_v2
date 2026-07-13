import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards } from './boards';
import { boardRoleEnum } from './enums';
import { primaryId } from './_common';

/**
 * Board-scoped API key — Public API + Bot Erişimi (Task 1). Each key is bound
 * 1:1 to a **bot user** (`users.is_bot = true`) that is a member of the target
 * board; the bot behaves like a service account on that single board. Plain
 * token is **never** persisted: only `token_hash` (SHA-256, unique) plus a
 * short `token_prefix` (`psk_` + first 8 chars) for masked UI display and the
 * prefix-lookup index. This mirrors the `share_links` token discipline
 * (`crypto.randomBytes(32)` → base64url), see
 * `packages/db/src/schema/share-links.ts`.
 *
 * Lifecycle: **create** (board admin; one transaction seeds bot user +
 * `workspace_members(guest)` + `board_members` + this row, plain key shown
 * once) → **revoke** (`revoked_at` set, bot membership rows removed; the bot
 * user row stays for activity/comment attribution) → **expiry**
 * (`expires_at` in the past → auth middleware rejects). `board_id` cascade
 * removes the key when its board is deleted; `bot_user_id` / `created_by`
 * reference `users` for FK integrity (bot users are never deleted).
 *
 * Kanonik referans:
 * `docs/superpowers/plans/2026-07-13-public-api-ve-bot-erisimi.md` "Veri modeli",
 * `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: primaryId(),
    /** User-facing name = bot display name. */
    name: text().notNull(),
    /** SHA-256 of the plaintext token. Plain never persisted. */
    tokenHash: text().notNull(),
    /** `psk_` + first 8 characters of the plaintext token — masked UI + lookup. */
    tokenPrefix: text().notNull(),
    /** 1:1 bot user (service account) this key authenticates as. */
    botUserId: text()
      .notNull()
      .references(() => users.id),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** Bot's board role. `admin` is rejected at the application layer (v1). */
    role: boardRoleEnum().notNull().default('member'),
    /** Human (board admin) who issued the key. */
    createdBy: text()
      .notNull()
      .references(() => users.id),
    /** null = never expires. */
    expiresAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('api_keys_token_hash_uq').on(t.tokenHash),
    /** Prefix-first auth lookup (constant-time hash equality decides the match). */
    index('api_keys_token_prefix_idx').on(t.tokenPrefix),
    /** Board settings list + revoke-on-board-delete cascade planning. */
    index('api_keys_board_idx').on(t.boardId),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
