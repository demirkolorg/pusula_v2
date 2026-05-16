/**
 * Notifications router — Faz 6A (DEM-90) + Faz 10B (DEM-136). UI-facing tRPC
 * procedures the notification centre (Faz 6D) and the bildirim ayar ekranı
 * (Faz 10C-E) drive:
 *
 *  - `list`           — cursor-paginated feed for the bell drawer.
 *  - `unreadCount`    — badge number.
 *  - `markRead`       — single-row read marker (idempotent).
 *  - `markAllRead`    — bulk read marker (idempotent).
 *  - `preferences.list`   — Faz 10B: all scope rows for the caller.
 *  - `preferences.get`    — Faz 10B: read a single scope row.
 *  - `preferences.upsert` — Faz 10B: insert-or-update (`ON CONFLICT (scope)`).
 *  - `preferences.delete` — Faz 10B: drop a scope row (global default is
 *    protected — the rule engine needs it).
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
 * `preferences.*` uses scope-access permission checks: workspace/board/card
 * membership is verified server-side before a row may be read/written. The
 * partial unique index `notification_preferences_scope_uq` (migration
 * `0021_dem136_notification_prefs_unique`) is the ON CONFLICT target —
 * without it `upsert` would race-write duplicate rows for the same scope.
 *
 * See `docs/architecture/03-backend.md` "Faz 6 — Notification & push
 * procedure'leri", `docs/architecture/06-bildirim-altyapisi.md` Notification
 * preferences API, and `docs/architecture/08-web-ve-mobil.md` §8.1.11.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, lt, or, sql } from '@pusula/db';
import {
  boardMembers,
  boards,
  cardMembers,
  cards,
  notificationPreferences,
  notifications,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  canManageNotificationPreference,
  effectiveBoardRole,
  notificationPreferenceDeleteInput,
  notificationPreferenceGetInput,
  notificationPreferenceUpsertInput,
  snoozeInput,
  unsnoozeInput,
  type SnoozeDuration,
} from '@pusula/domain';
import { z } from 'zod';
import type { Queryable } from '../middleware/board-access';
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

// ───────────────────────────────────────────────────────────────────────────
// Faz 10B (DEM-136) — preferences nested router.
//
// Declared above `notificationsRouter` because the latter references it on
// `preferences: preferencesRouter`; a `const` declaration sits in the TDZ
// until the line executes, so reversing this order would `ReferenceError` at
// module load.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Scope-access resolver for `notification_preferences` (Faz 10B). Throws
 * `TRPCError` (`NOT_FOUND` for missing rows, `FORBIDDEN` when membership
 * is insufficient). Returns nothing on success — the caller has already
 * validated the scope shape via Zod and may proceed to read/write the row.
 *
 * Why one resolver instead of inline checks per procedure: get/upsert/delete
 * all need the same gate (global is free, otherwise the user must reach the
 * scope), and changing the rule means changing all three.
 */
async function assertScopeAccess(
  db: Queryable,
  userId: string,
  scope: { workspaceId?: string; boardId?: string; cardId?: string },
): Promise<void> {
  const isGlobal = !scope.workspaceId && !scope.boardId && !scope.cardId;
  if (isGlobal) return;

  let hasAccess = false;

  if (scope.workspaceId) {
    const [m] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, scope.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    hasAccess = m !== undefined;
  } else if (scope.boardId) {
    const [b] = await db
      .select({ workspaceId: boards.workspaceId })
      .from(boards)
      .where(eq(boards.id, scope.boardId))
      .limit(1);
    if (!b) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
    }
    const [wm] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, b.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    const [bm] = await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, scope.boardId), eq(boardMembers.userId, userId)))
      .limit(1);
    const role = effectiveBoardRole({
      workspaceRole: wm?.role ?? null,
      boardRole: bm?.role ?? null,
    });
    hasAccess = role !== null;
  } else if (scope.cardId) {
    const [c] = await db
      .select({ boardId: cards.boardId })
      .from(cards)
      .where(eq(cards.id, scope.cardId))
      .limit(1);
    if (!c) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Kart bulunamadı.' });
    }
    // Resolve board access first — board membership covers most users.
    const [b] = await db
      .select({ workspaceId: boards.workspaceId })
      .from(boards)
      .where(eq(boards.id, c.boardId))
      .limit(1);
    if (b) {
      const [wm] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, b.workspaceId),
            eq(workspaceMembers.userId, userId),
          ),
        )
        .limit(1);
      const [bm] = await db
        .select({ role: boardMembers.role })
        .from(boardMembers)
        .where(and(eq(boardMembers.boardId, c.boardId), eq(boardMembers.userId, userId)))
        .limit(1);
      const role = effectiveBoardRole({
        workspaceRole: wm?.role ?? null,
        boardRole: bm?.role ?? null,
      });
      hasAccess = role !== null;
    }
    // Card watcher/assignee is an additional path — if the row exists the
    // user can reach this card even without explicit board role.
    if (!hasAccess) {
      const [cm] = await db
        .select({ role: cardMembers.role })
        .from(cardMembers)
        .where(and(eq(cardMembers.cardId, scope.cardId), eq(cardMembers.userId, userId)))
        .limit(1);
      hasAccess = cm !== undefined;
    }
  }

  if (!canManageNotificationPreference(scope, hasAccess)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bu bildirim tercihi kapsamına erişiminiz yok.',
    });
  }
}

/**
 * Walk an error chain looking for a node-postgres `DatabaseError`-shaped
 * object — the canonical 'code' + 'constraint' fields we use to recognise
 * the `23505 / notification_preferences_scope_uq` collision in `upsert`.
 *
 * Drizzle wraps the pg driver error in its own surface and stashes the
 * original on `cause`; older drivers throw the pg error directly. We walk
 * two levels deep, which covers both shapes without coupling us to a
 * specific Drizzle version.
 */
/**
 * Faz 10F (DEM-140) — normalize a Postgres `time` round-trip string. The
 * driver returns `HH:MM:SS` (with seconds) even when we wrote `HH:MM`; the
 * UI's `<input type="time">` only accepts `HH:MM`. We chop the seconds on
 * egress so the cached form value matches what the user typed.
 */
function normalizeHHMM(value: string | null): string | null {
  if (value == null) return null;
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function extractPgError(err: unknown): { code?: string; constraint?: string } | null {
  for (let cur: unknown = err, depth = 0; cur && depth < 3; depth++) {
    if (typeof cur === 'object') {
      const obj = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (typeof obj.code === 'string') {
        return {
          code: obj.code,
          constraint: typeof obj.constraint === 'string' ? obj.constraint : undefined,
        };
      }
      cur = obj.cause;
    } else {
      break;
    }
  }
  return null;
}

const preferencesRouter = router({
  /**
   * All preference rows for the caller, including the global-default row
   * when one has been written. Returns scope labels (workspace name / board
   * title / card title) so the UI can render the override tree without a
   * follow-up fetch. Rows are ordered global → workspace → board → card so
   * the list reads top-down by precedence.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        id: notificationPreferences.id,
        workspaceId: notificationPreferences.workspaceId,
        boardId: notificationPreferences.boardId,
        cardId: notificationPreferences.cardId,
        muteLevel: notificationPreferences.muteLevel,
        mentionOnly: notificationPreferences.mentionOnly,
        pushEnabled: notificationPreferences.pushEnabled,
        emailEnabled: notificationPreferences.emailEnabled,
        // Faz 10F (DEM-140) — quiet-hours columns travel on the global
        // scope row; other scopes return them as NULL.
        quietFrom: notificationPreferences.quietFrom,
        quietTo: notificationPreferences.quietTo,
        quietTimezone: notificationPreferences.quietTimezone,
        // Faz 10H (DEM-142) — snooze. Aktif snooze listesi (`AccountTabs`
        // Section 7) bu kolonu okuyup `> NOW()` filtreler; süresi dolmuş
        // satır UI'da gösterilmez (silinmez de — audit).
        muteUntil: notificationPreferences.muteUntil,
        // Faz 10G (DEM-141) — e-posta digest modu. Global satırda anlamlı;
        // override satırlarında DB default'u (`'instant'`) döner.
        emailMode: notificationPreferences.emailMode,
        updatedAt: notificationPreferences.updatedAt,
        workspaceName: workspaces.name,
        boardTitle: boards.title,
        cardTitle: cards.title,
      })
      .from(notificationPreferences)
      .leftJoin(workspaces, eq(workspaces.id, notificationPreferences.workspaceId))
      .leftJoin(boards, eq(boards.id, notificationPreferences.boardId))
      .leftJoin(cards, eq(cards.id, notificationPreferences.cardId))
      .where(eq(notificationPreferences.userId, userId))
      // Hierarchy order: global → workspace → board → card. A naive
      // `(workspaceId ASC NULLS FIRST, boardId ASC NULLS FIRST, …)` puts
      // global *and* the deeper scopes (which all have `workspace_id NULL`)
      // ahead of the workspace row — wrong. A CASE that maps each row to
      // its hierarchy tier is the simplest way to express the intent.
      .orderBy(
        sql`CASE
          WHEN ${notificationPreferences.workspaceId} IS NULL
            AND ${notificationPreferences.boardId} IS NULL
            AND ${notificationPreferences.cardId} IS NULL THEN 0
          WHEN ${notificationPreferences.workspaceId} IS NOT NULL THEN 1
          WHEN ${notificationPreferences.boardId} IS NOT NULL THEN 2
          WHEN ${notificationPreferences.cardId} IS NOT NULL THEN 3
          ELSE 4
        END`,
        sql`COALESCE(${notificationPreferences.workspaceId}, '')`,
        sql`COALESCE(${notificationPreferences.boardId}, '')`,
        sql`COALESCE(${notificationPreferences.cardId}, '')`,
      );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      boardId: r.boardId,
      cardId: r.cardId,
      muteLevel: r.muteLevel,
      mentionOnly: r.mentionOnly,
      pushEnabled: r.pushEnabled,
      emailEnabled: r.emailEnabled,
      // Faz 10F (DEM-140) — Postgres `time` round-trips as `HH:MM:SS`; UI
      // expects `HH:MM`. Normalize on egress so the form value the user
      // sees matches what they typed.
      quietFrom: normalizeHHMM(r.quietFrom),
      quietTo: normalizeHHMM(r.quietTo),
      quietTimezone: r.quietTimezone,
      muteUntil: r.muteUntil,
      emailMode: r.emailMode,
      updatedAt: r.updatedAt,
      // `scopeLabel` is the human-readable handle the UI shows next to the
      // row. Falls back to a literal "Genel" for the global default and to
      // the raw id for joined rows whose target was deleted between writes
      // (FK cascades cover the common case but a NOT-NULL constraint plus
      // late join means a defensive coalesce is cheap).
      scopeLabel: r.cardId
        ? (r.cardTitle ?? r.cardId)
        : r.boardId
          ? (r.boardTitle ?? r.boardId)
          : r.workspaceId
            ? (r.workspaceName ?? r.workspaceId)
            : 'Genel',
    }));
  }),

  /**
   * Read a single preference row by scope. `null` when no row exists for
   * that scope (the rule engine then falls back through the hierarchy).
   *
   * Permission: the caller must have access to the scope dimension; global
   * scope is always allowed for own row.
   */
  get: protectedProcedure.input(notificationPreferenceGetInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    await assertScopeAccess(ctx.db, userId, input);

    const whereExpr = and(
      eq(notificationPreferences.userId, userId),
      input.workspaceId
        ? eq(notificationPreferences.workspaceId, input.workspaceId)
        : isNull(notificationPreferences.workspaceId),
      input.boardId
        ? eq(notificationPreferences.boardId, input.boardId)
        : isNull(notificationPreferences.boardId),
      input.cardId
        ? eq(notificationPreferences.cardId, input.cardId)
        : isNull(notificationPreferences.cardId),
    );

    const [row] = await ctx.db
      .select({
        muteLevel: notificationPreferences.muteLevel,
        mentionOnly: notificationPreferences.mentionOnly,
        pushEnabled: notificationPreferences.pushEnabled,
        emailEnabled: notificationPreferences.emailEnabled,
        // Faz 10F (DEM-140) — quiet-hours columns. Always null on non-global
        // scopes (validated on upsert), but we read them unconditionally so
        // the UI can detect a stale workspace-scope row carrying values
        // written before the validation existed.
        quietFrom: notificationPreferences.quietFrom,
        quietTo: notificationPreferences.quietTo,
        quietTimezone: notificationPreferences.quietTimezone,
        // Faz 10H (DEM-142) — snooze. Card detail dropdown'ı bu satırı
        // okuyup aktif snooze ikon/label'ını çizer.
        muteUntil: notificationPreferences.muteUntil,
        // Faz 10G (DEM-141) — e-posta digest modu. UI Section 6 bu alanı
        // global tercih satırından okur.
        emailMode: notificationPreferences.emailMode,
      })
      .from(notificationPreferences)
      .where(whereExpr)
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      // Faz 10F (DEM-140) — same `HH:MM:SS` → `HH:MM` normalization as `list`.
      quietFrom: normalizeHHMM(row.quietFrom),
      quietTo: normalizeHHMM(row.quietTo),
    };
  }),

  /**
   * Insert-or-update a preference row for the (caller, scope) pair.
   *
   * Implementation: optimistic INSERT via Drizzle (so the `$defaultFn`
   * generates the row id) → on the unique-constraint violation
   * (`notification_preferences_scope_uq`, migration `0021`), fall through
   * to UPDATE. Drizzle's `onConflictDoUpdate` only accepts column
   * references as conflict target; our index uses `COALESCE(..., '')`
   * expressions (the only way to make `(NULL, NULL, NULL)` rows compare
   * equal under UNIQUE), so the raw ON CONFLICT path won't reuse Drizzle's
   * column-ref helper. The two-step catch keeps the id generator + the
   * type-safe schema while still respecting the expression-based index.
   *
   * Concurrency: under contention the loser of the race catches `23505`
   * and retries as UPDATE; the UPDATE always finds the row written by the
   * winner (no further retry needed).
   */
  upsert: protectedProcedure
    .input(notificationPreferenceUpsertInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const scope = {
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        cardId: input.cardId,
      };
      await assertScopeAccess(ctx.db, userId, scope);

      const returningCols = {
        id: notificationPreferences.id,
        workspaceId: notificationPreferences.workspaceId,
        boardId: notificationPreferences.boardId,
        cardId: notificationPreferences.cardId,
        muteLevel: notificationPreferences.muteLevel,
        mentionOnly: notificationPreferences.mentionOnly,
        pushEnabled: notificationPreferences.pushEnabled,
        emailEnabled: notificationPreferences.emailEnabled,
        quietFrom: notificationPreferences.quietFrom,
        quietTo: notificationPreferences.quietTo,
        quietTimezone: notificationPreferences.quietTimezone,
        // Faz 10H (DEM-142) — snooze ayrı endpoint'lerle yönetilir; upsert
        // bu kolona dokunmaz ama satırın güncel değerini geri döndürür ki
        // UI önceki snooze durumunu kaybetmesin.
        muteUntil: notificationPreferences.muteUntil,
        // Faz 10G (DEM-141) — e-posta digest modu. Yalnız global scope
        // satırında kullanıcı için anlamlı (Zod superRefine enforce eder);
        // override satırlarında DB default'u (`'instant'`) korunur.
        emailMode: notificationPreferences.emailMode,
        updatedAt: notificationPreferences.updatedAt,
      };

      // Faz 10F (DEM-140) — domain superRefine has already enforced
      // all-or-nothing and "global scope only" on the triplet; coerce to
      // explicit nulls here so we feed Drizzle a stable shape (and let the
      // DB CHECK constraint catch any future bypass).
      const quietFrom = input.quietFrom ?? null;
      const quietTo = input.quietTo ?? null;
      const quietTimezone = input.quietTimezone ?? null;
      // Faz 10G (DEM-141) — `emailMode` opsiyoneldir; eksikse DB default'u
      // (`'instant'`) korunsun. UPDATE dalında ise undefined → değişmez
      // (Drizzle `set` undefined alanları atlar).
      const emailMode = input.emailMode;

      try {
        const [inserted] = await ctx.db
          .insert(notificationPreferences)
          .values({
            userId,
            workspaceId: input.workspaceId ?? null,
            boardId: input.boardId ?? null,
            cardId: input.cardId ?? null,
            muteLevel: input.muteLevel,
            mentionOnly: input.mentionOnly,
            pushEnabled: input.pushEnabled,
            emailEnabled: input.emailEnabled,
            quietFrom,
            quietTo,
            quietTimezone,
            // Faz 10G (DEM-141) — `emailMode` opsiyonel input. Eksikse DB
            // default'u (`'instant'`) korunsun: alanı set etmeyiz, kolonun
            // default value'su devreye girer.
            ...(emailMode !== undefined ? { emailMode } : {}),
          })
          .returning(returningCols);
        if (!inserted) {
          throw new Error('notification_preferences insert returned no row');
        }
        // Faz 10F (DEM-140) — normalize `HH:MM:SS` from `time` round-trip.
        return {
          ...inserted,
          quietFrom: normalizeHHMM(inserted.quietFrom),
          quietTo: normalizeHHMM(inserted.quietTo),
        };
      } catch (err) {
        // Postgres 23505 = unique_violation. Drizzle wraps pg's error via
        // `cause`; we walk one level deep to read the code + constraint
        // name without an `instanceof` check that would brittle-couple us
        // to the pg driver version.
        const pgErr = extractPgError(err);
        if (
          pgErr?.code === '23505' &&
          pgErr.constraint === 'notification_preferences_scope_uq'
        ) {
          const [updated] = await ctx.db
            .update(notificationPreferences)
            .set({
              muteLevel: input.muteLevel,
              mentionOnly: input.mentionOnly,
              pushEnabled: input.pushEnabled,
              emailEnabled: input.emailEnabled,
              quietFrom,
              quietTo,
              quietTimezone,
              // Faz 10G (DEM-141) — `emailMode` opsiyonel; eksikse mevcut
              // satır değeri korunur (alanı `set`'ten çıkarıyoruz).
              ...(emailMode !== undefined ? { emailMode } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(notificationPreferences.userId, userId),
                input.workspaceId
                  ? eq(notificationPreferences.workspaceId, input.workspaceId)
                  : isNull(notificationPreferences.workspaceId),
                input.boardId
                  ? eq(notificationPreferences.boardId, input.boardId)
                  : isNull(notificationPreferences.boardId),
                input.cardId
                  ? eq(notificationPreferences.cardId, input.cardId)
                  : isNull(notificationPreferences.cardId),
              ),
            )
            .returning(returningCols);
          if (!updated) {
            // The unique conflict said the row exists; the UPDATE says it
            // doesn't — the only way that gap can open is if the row was
            // deleted between the two statements (no current procedure
            // does that). Surface as a soft error rather than crashing.
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Tercih satırı yarışma sırasında silindi; lütfen tekrar deneyin.',
            });
          }
          return {
            ...updated,
            quietFrom: normalizeHHMM(updated.quietFrom),
            quietTo: normalizeHHMM(updated.quietTo),
          };
        }
        throw err;
      }
    }),

  /**
   * Drop a preference row. The global-default scope (all-NULL columns) is
   * protected because the rule engine reads it as the fallback when no
   * narrower row matches; deleting it would silently flip the user back to
   * the hard-coded defaults and break the doc's "rule engine reads the
   * narrowest scope" invariant. Use `upsert` to reset to defaults instead.
   */
  delete: protectedProcedure
    .input(notificationPreferenceDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isGlobal = !input.workspaceId && !input.boardId && !input.cardId;
      if (isGlobal) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            "Genel bildirim tercihi silinemez; varsayılana dönmek için 'upsert' kullanın.",
        });
      }
      await assertScopeAccess(ctx.db, userId, input);

      const deleted = await ctx.db
        .delete(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            input.workspaceId
              ? eq(notificationPreferences.workspaceId, input.workspaceId)
              : isNull(notificationPreferences.workspaceId),
            input.boardId
              ? eq(notificationPreferences.boardId, input.boardId)
              : isNull(notificationPreferences.boardId),
            input.cardId
              ? eq(notificationPreferences.cardId, input.cardId)
              : isNull(notificationPreferences.cardId),
          ),
        )
        .returning({ id: notificationPreferences.id });

      if (deleted.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Bu kapsam için tercih satırı bulunamadı.',
        });
      }
      return { deleted: true as const };
    }),

  /**
   * Faz 10H (DEM-142) — Snooze: kart bazında geçici sustur.
   *
   * Kullanıcı kart detay dropdown'ından bir kartı belirli bir süre
   * (1 saat / 4 saat / 1 gün / 1 hafta / belirli tarih) susturur. Server-side
   * `mute_until = now + duration` hesaplar ve kart-scope tercih satırını
   * upsert eder (kart için zaten tercih satırı varsa o satırın `mute_until`
   * alanı güncellenir; yoksa yeni satır eklenir, `mute_level='none'` default
   * kalır — snooze ayrı bir mekanizma, mute-level'dan bağımsız).
   *
   * Rule engine `pickChannels` `mute_until > NOW()` görünce bildirimleri
   * baskılar (mute-bypass tipler hâlâ geçer). Süresi dolunca otomatik açılır.
   *
   * `until_date` seçimi maks 1 yıl ilerisi olabilir; geçmiş tarih reject
   * (`BAD_REQUEST`). Üst sınır kullanıcının yanlışlıkla "sonsuz" snooze
   * yapmasını önler — uzun süre için zaten `mute_level='all'` upsert var.
   */
  snooze: protectedProcedure.input(snoozeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const scope = { cardId: input.cardId };
    await assertScopeAccess(ctx.db, userId, scope);

    const muteUntil = computeSnoozeUntil(input.duration, input.untilDate);

    const returningCols = {
      id: notificationPreferences.id,
      cardId: notificationPreferences.cardId,
      muteUntil: notificationPreferences.muteUntil,
      updatedAt: notificationPreferences.updatedAt,
    };

    // Aynı upsert pattern'ı (DEM-136 üzerinde): INSERT → 23505 yakalanırsa
    // UPDATE'e düş. Card-scope satırı zaten varsa (kullanıcı daha önce mute
    // ayarlamış olabilir) yalnız `mute_until` güncellenir; diğer alanlar
    // korunur.
    try {
      const [inserted] = await ctx.db
        .insert(notificationPreferences)
        .values({
          userId,
          workspaceId: null,
          boardId: null,
          cardId: input.cardId,
          // Defaults: snooze kart-scope satırını ilk kez yaratıyorsa
          // diğer tercihler default kalır (rule engine narrowest-scope-wins
          // ama bu satırın `muteLevel='none'` olması mute-only davranışını
          // değiştirmez; snooze ayrı kontrol).
          muteLevel: 'none',
          mentionOnly: false,
          pushEnabled: true,
          emailEnabled: true,
          muteUntil,
        })
        .returning(returningCols);
      if (!inserted) throw new Error('snooze insert returned no row');
      return { muteUntil: inserted.muteUntil };
    } catch (err) {
      const pgErr = extractPgError(err);
      if (
        pgErr?.code === '23505' &&
        pgErr.constraint === 'notification_preferences_scope_uq'
      ) {
        const [updated] = await ctx.db
          .update(notificationPreferences)
          .set({ muteUntil, updatedAt: new Date() })
          .where(
            and(
              eq(notificationPreferences.userId, userId),
              isNull(notificationPreferences.workspaceId),
              isNull(notificationPreferences.boardId),
              eq(notificationPreferences.cardId, input.cardId),
            ),
          )
          .returning(returningCols);
        if (!updated) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Tercih satırı yarışma sırasında silindi; lütfen tekrar deneyin.',
          });
        }
        return { muteUntil: updated.muteUntil };
      }
      throw err;
    }
  }),

  /**
   * Faz 10H (DEM-142) — Snooze'u iptal et.
   *
   * Kart-scope tercih satırı varsa `mute_until = NULL` set edilir; yoksa
   * no-op (`unsnoozed: false`). Tercih satırının diğer alanlarına
   * dokunulmaz — sadece snooze sıfırlanır. UI hem kart detayından hem
   * "Aktif susturmalar" listesinden çağırır.
   */
  unsnooze: protectedProcedure.input(unsnoozeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    await assertScopeAccess(ctx.db, userId, { cardId: input.cardId });

    const updated = await ctx.db
      .update(notificationPreferences)
      .set({ muteUntil: null, updatedAt: new Date() })
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          isNull(notificationPreferences.workspaceId),
          isNull(notificationPreferences.boardId),
          eq(notificationPreferences.cardId, input.cardId),
        ),
      )
      .returning({ id: notificationPreferences.id });

    return { unsnoozed: updated.length > 0 };
  }),
});

/**
 * Faz 10H (DEM-142) — duration enum'undan timestamp hesabı. Server-side
 * `Date.now()` kullanır → client tarafının saatine güvenmez. `until_date`
 * için gelecek + 1 yıl üst sınır kontrolü burada yapılır (Zod sadece şekil
 * doğrular; gelecek-tarih iş kuralı bu fonksiyonda).
 */
function computeSnoozeUntil(duration: SnoozeDuration, untilDate: Date | undefined): Date {
  const now = Date.now();
  switch (duration) {
    case '1h':
      return new Date(now + 60 * 60 * 1000);
    case '4h':
      return new Date(now + 4 * 60 * 60 * 1000);
    case '1d':
      return new Date(now + 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case 'until_date': {
      if (!untilDate) {
        // Zod refine zaten yakalıyor; defansif guard.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "'until_date' süresi için 'untilDate' gerekli.",
        });
      }
      const ts = untilDate.getTime();
      if (Number.isNaN(ts) || ts <= now) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Snooze tarihi gelecekte olmalı.',
        });
      }
      const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
      if (ts > oneYearLater) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Snooze tarihi 1 yıldan uzak olamaz.',
        });
      }
      return untilDate;
    }
  }
}

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

  // Faz 10B (DEM-136) — see header doc-comment for the nested router shape.
  preferences: preferencesRouter,
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
