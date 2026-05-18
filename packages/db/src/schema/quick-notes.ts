import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { primaryId, timestamps } from './_common';

/**
 * `quick_notes` (DEM-203) — personal "Hızlı Not" entity for the mobile central
 * "Ekle" flow. A quick note is private to its owner and lives outside the
 * workspace/board/list hierarchy: its only relation is `user_id`. CRUD on this
 * table produces no `activity_events` / `realtime_events` / `notification_outbox`
 * rows — only `quickNote.convertToCard`'s card-creation step does, and the note
 * itself is deleted silently in that same transaction.
 *
 * See `docs/architecture/04-veri-katmani.md` (DEM-203 kapsamı) and
 * `docs/architecture/03-backend.md` (`quickNote` router).
 */
export const quickNotes = pgTable(
  'quick_notes',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The note body — free text, never empty (enforced in the domain layer). */
    content: text().notNull(),
    ...timestamps,
  },
  (t) => [index('quick_notes_user_idx').on(t.userId)],
);

export type QuickNote = typeof quickNotes.$inferSelect;
export type NewQuickNote = typeof quickNotes.$inferInsert;
