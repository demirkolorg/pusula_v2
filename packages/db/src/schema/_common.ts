import { nanoid } from 'nanoid';
import { text, timestamp } from 'drizzle-orm/pg-core';

/** Standard primary key: a short, URL-safe, app-generated id. */
export const primaryId = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => nanoid());

/** A nullable/non-null app-generated id column (for FKs we want client-supplied). */
export const idColumn = () => text().$defaultFn(() => nanoid());

/** `created_at` / `updated_at` (timestamptz), spread into a table definition. */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft-delete / archive marker (timestamptz, nullable). */
export const archivedAt = () => timestamp({ withTimezone: true });
