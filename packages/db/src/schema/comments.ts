import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { boards } from './boards';
import { cards } from './cards';
import { shareLinks } from './share-links';
import { primaryId, timestamps } from './_common';

export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    cardId: text()
      .notNull()
      .references((): AnyPgColumn => cards.id, { onDelete: 'cascade' }),
    /**
     * Yorum yazarı. Kullanıcı hesabını silince `set null` (yorum tarihsellik
     * için kalır; UI "Silinmiş kullanıcı" olarak gösterir). Misafir yorumlarda
     * NULL — bu durumda `share_link_id` doldurulur. DB invariant: ikisi birden
     * NOT NULL olamaz (at most one); yeni `INSERT`'lerde Zod tam birini garantiler.
     * Faz 9A (DEM-127) — bkz. `docs/architecture/14-paylasim-linki-mimarisi.md`.
     */
    authorId: text().references(() => users.id, { onDelete: 'set null' }),
    /**
     * Misafir (anonim) yorumun kaynağı: hangi paylaşım linkinden geldi. Set
     * iken `author_id` NULL'dır. Link silinirse `set null` (yorum kalır,
     * "Misafir" etiketi UI'da korunur — `share_link_id` NULL + `author_id`
     * NULL durumu artık "Silinmiş kullanıcı" gibi resolve edilir).
     */
    shareLinkId: text().references(() => shareLinks.id, { onDelete: 'set null' }),
    body: text().notNull(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('comments_card_created_idx').on(t.cardId, t.createdAt),
    check(
      'comments_author_or_share_link_chk',
      sql`NOT (${t.authorId} IS NOT NULL AND ${t.shareLinkId} IS NOT NULL)`,
    ),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: primaryId(),
    cardId: text()
      .notNull()
      .references((): AnyPgColumn => cards.id, { onDelete: 'cascade' }),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    uploaderId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** S3/MinIO object key. */
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    size: bigint({ mode: 'number' }).notNull(),
    ...timestamps,
  },
  (t) => [index('attachments_card_idx').on(t.cardId)],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
