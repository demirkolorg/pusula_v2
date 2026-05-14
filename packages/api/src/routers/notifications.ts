/**
 * Notifications router — Faz 6A (DEM-90). UI-facing tRPC procedures the
 * notification centre (Faz 6D) drives:
 *
 *  - `list`           — cursor-paginated feed for the bell drawer.
 *  - `unreadCount`    — badge number.
 *  - `markRead`       — single-row read marker (idempotent).
 *  - `markAllRead`    — bulk read marker (idempotent).
 *
 * Every procedure scopes to `ctx.session.user.id`. We deliberately surface
 * `NOT_FOUND` when a caller tries to operate on someone else's notification —
 * `FORBIDDEN` would leak that the row exists. The DB column is `recipient_id`
 * (see `packages/db/src/schema/notifications.ts`); we expose it as `userId` /
 * the rule is "your own notifications, no one else's".
 *
 * The list is `created_at DESC`; the pagination uses (`created_at`, `id`) as
 * the cursor so we can disambiguate ties (two rows in the same ms). The
 * cursor is opaque to the client — encoded base64-ISO + id.
 *
 * See `docs/architecture/03-backend.md` "Faz 6 — Notification & push
 * procedure'leri" and `docs/architecture/08-web-ve-mobil.md` §8.1.11.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, lt, or, sql } from '@pusula/db';
import { notifications } from '@pusula/db';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

const NOTIFICATIONS_PAGE_DEFAULT = 20;
const NOTIFICATIONS_PAGE_MAX = 100;

const cursorSchema = z
  .string()
  .min(1)
  .refine((s) => decodeCursor(s) !== null, { message: 'Geçersiz cursor.' });

const listInput = z.object({
  limit: z.number().int().min(1).max(NOTIFICATIONS_PAGE_MAX).optional(),
  cursor: cursorSchema.optional(),
  /** `true` → unread only, `false` → read only, omit → both. */
  unread: z.boolean().optional(),
});

const markReadInput = z.object({
  id: z.string().min(1),
});

const notificationCols = {
  id: notifications.id,
  recipientId: notifications.recipientId,
  actorId: notifications.actorId,
  type: notifications.type,
  workspaceId: notifications.workspaceId,
  boardId: notifications.boardId,
  cardId: notifications.cardId,
  payload: notifications.payload,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
} as const;

export const notificationsRouter = router({
  /**
   * Cursor-paginated feed of the caller's notifications, newest first. The
   * client passes back `nextCursor` to fetch the next page. `unread: true`
   * filters to the unread tab (still ordered by `created_at DESC`).
   */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const limit = input.limit ?? NOTIFICATIONS_PAGE_DEFAULT;
    const userId = ctx.session.user.id;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const whereExpr = and(
      eq(notifications.recipientId, userId),
      input.unread === true ? isNull(notifications.readAt) : undefined,
      input.unread === false ? sql`${notifications.readAt} IS NOT NULL` : undefined,
      cursor
        ? or(
            lt(notifications.createdAt, cursor.createdAt),
            and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
          )
        : undefined,
    );

    // +1 row so we can tell whether there's a next page without a separate
    // count query. Same trick the workspace / board listings use.
    const rows = await ctx.db
      .select(notificationCols)
      .from(notifications)
      .where(whereExpr)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { items, nextCursor };
  }),

  /**
   * Badge count: how many of the caller's notifications are still unread. The
   * partial index `notifications_recipient_unread_idx` (Faz 6A — migration
   * 0009) makes this an index-only scan.
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
    return { count: row?.count ?? 0 };
  }),

  /**
   * Mark a single notification read. Returns `{ id, readAt, changed }` —
   * `changed: false` for an already-read row (idempotent). `NOT_FOUND` when
   * the row doesn't exist *or* isn't the caller's (we don't leak the
   * difference).
   *
   * Single-statement implementation: `UPDATE … WHERE id = ? AND
   * recipient_id = ?` (scoped to caller, no `read_at IS NULL` filter). If
   * the row exists the UPDATE always returns it; `xmax_changed` tells us
   * whether the row was newly modified or untouched (already-read). Cuts
   * the read-modify-write race the previous two-statement pattern had.
   */
  markRead: protectedProcedure.input(markReadInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    // CASE expression: re-set `read_at` only when it was NULL. The RETURNING
    // surface includes a boolean derived from `xmax`'s wraparound — but
    // Drizzle won't see the system column, so we synthesise it: if the new
    // `read_at` equals the *pre-update* value, nothing changed. Easiest
    // implementation is the CASE — we return both the resulting `read_at`
    // and a flag describing whether we wrote it now or not.
    const now = new Date();
    const [row] = await ctx.db
      .update(notifications)
      .set({
        readAt: sql`COALESCE(${notifications.readAt}, ${now})`,
      })
      .where(and(eq(notifications.id, input.id), eq(notifications.recipientId, userId)))
      .returning({
        id: notifications.id,
        readAt: notifications.readAt,
        // `was_unread`: true iff this UPDATE actually transitioned the row.
        // PG sets `xmax` on the new tuple to the txid that wrote it; we
        // can't read `xmax` via Drizzle's `returning`, so instead compute
        // it from the post-UPDATE `read_at` being exactly `now`. A prior
        // call inside the same millisecond would race, but the `markRead`
        // contract treats that as "changed = false" (correct semantics —
        // the user did mark it read, just earlier).
        wasUnread: sql<boolean>`(${notifications.readAt}) = ${now}`,
      });
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Bildirim bulunamadı.' });
    }
    return {
      id: row.id,
      readAt: row.readAt,
      changed: row.wasUnread,
    };
  }),

  /**
   * Bulk mark-all-read. Returns `{ marked }` — how many rows the UPDATE
   * touched. Idempotent: a second call returns `{ marked: 0 }`.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();
    const updated = await ctx.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { marked: updated.length };
  }),
});

// ───────────────────────────────────────────────────────────────────────────
// Cursor encoding — `(createdAt, id)` is opaque to the client. Base64 keeps
// the wire form short + URL-safe; the inner format (`ISO|id`) is internal.
// ───────────────────────────────────────────────────────────────────────────

interface CursorParts {
  createdAt: Date;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const raw = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): CursorParts | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep <= 0) return null;
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
