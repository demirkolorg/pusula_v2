import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaces } from './workspaces';
import { cards } from './cards';
import { primaryId } from './_common';

/**
 * Kart paylaşım linki — Faz 9 (DEM-124 epic, DEM-127 alt). Token plain hiçbir
 * yerde saklanmaz; sadece `token_hash` (SHA-256) tutulur. Public lookup
 * `WHERE token_hash = sha256($token)` ile sabit zamanlı eşitlik üzerinden
 * yapılır (token sabit uzunluk). Mevcut `cards`/`workspaces` cascade ile
 * temizler; oluşturan/iptal eden kullanıcı silinince `created_by_id`/
 * `revoked_by_id` `set null` olur (link tarihsellik için kalır, ama
 * `users.id` cascade ile bağlı yorumların yazarı silinmediği için pratikte
 * çoğu kez kalır).
 *
 * Yönetim API'si (`share.create` / `share.revoke` / `share.list`):
 * `packages/api/src/routers/share.ts` (9B). Misafir public endpoint:
 * `apps/api/src/routes/share.ts` (9C). Bkz.
 * `docs/architecture/14-paylasim-linki-mimarisi.md` "Veri modeli" ve
 * `docs/domain/08-paylasim-linki-kurallari.md` "Link davranışı".
 */
export const shareLinks = pgTable(
  'share_links',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    /** SHA-256 of the plaintext token (base64url, 32 byte). Plain never persisted. */
    tokenHash: text().notNull(),
    /** First 8 characters of the plaintext token — UI maskeli görüntü için. */
    tokenPrefix: text().notNull(),
    createdById: text().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedById: text().references(() => users.id, { onDelete: 'set null' }),
    lastAccessedAt: timestamp({ withTimezone: true }),
    accessCount: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('share_links_token_hash_uq').on(t.tokenHash),
    /** Kart başına aktif link listesi (`share.list`). */
    index('share_links_card_active_idx').on(t.cardId, t.revokedAt),
    /** Workspace ayar ekranı (post-MVP) ve audit. */
    index('share_links_workspace_idx').on(t.workspaceId, t.createdAt),
  ],
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
