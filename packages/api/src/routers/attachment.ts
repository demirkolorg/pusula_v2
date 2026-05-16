/**
 * Attachment router.
 *
 * Two-phase commit (Faz 11B — DEM-148):
 *  1. `initiate({ cardId, fileName, mimeType, size, description? })` —
 *     inserts a *draft* `attachments` row (`committed_at IS NULL`) and returns
 *     a presigned PUT URL. **No** activity / realtime / notification side
 *     effects yet; the orphan sweeper (Faz 11C — DEM-149) drops drafts older
 *     than 1 hour.
 *  2. `commit({ attachmentId })` — stamps `committed_at = NOW()`, writes the
 *     `attachment.added` activity event, the `realtime_events` outbox row,
 *     bumps `boards.version`, and fans out notifications inside one
 *     transaction. Idempotent: a second commit on an already-committed row is
 *     a no-op (no double activity / notification).
 *
 * Read / edit / delete:
 *  - `list({ cardId })` — committed attachments only, DESC by `committed_at`,
 *    with uploader join + `isCover` flag.
 *  - `update({ attachmentId, description })` — uploader OR board admin; draft
 *    rows rejected; no activity / realtime / notification (low-noise edit).
 *  - `delete({ attachmentId })` — uploader OR board admin; transactional row
 *    delete + `attachment.removed` activity + realtime; the
 *    `cover_image_attachment_id` FK is `ON DELETE SET NULL` so cards keep
 *    pointing at "no cover" automatically. Post-commit
 *    `ctx.enqueueAttachmentCleanup` drops the storage object (Faz 11C).
 *
 * Legacy:
 *  - `getDownloadUrl({ attachmentId })` — DEM-110 viewer+ presigned GET (TTL
 *    10 min). Kept; the `createUpload` cover-image-only path was rolled into
 *    `initiate` (DEM-110 rows backfilled by migration `0027`).
 *
 * See `docs/architecture/03-backend.md` Faz 11 / `docs/architecture/09-depolama-ve-arama.md` §9.1.
 */
import { and, desc, eq, isNotNull, isNull } from '@pusula/db';
import type { Database } from '@pusula/db';
import { activityEvents, attachments, cards, users } from '@pusula/db';
import {
  attachmentCommitInput,
  attachmentDeleteInput,
  attachmentInitiateInput,
  attachmentKindFromMime,
  attachmentListInput,
  attachmentUpdateInput,
  canEditBoardContent,
  canManageBoard,
  getAttachmentDownloadUrlInput,
  type AttachmentKind,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { maybeEnqueueAttachmentCleanup } from '../lib/attachment-cleanup';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import type { ObjectStorage } from '../lib/object-storage';
import {
  bumpBoardVersionForRealtime,
  insertRealtimeEvent,
  maybeEnqueueRealtimePublish,
} from '../lib/realtime-publish';
import { deleteSearchDocument, upsertSearchDocument } from '../lib/search-indexer';
import { accessFromBoardRole } from '../middleware/board';
import { resolveBoardAccess } from '../middleware/board-access';
import { cardProcedure } from '../middleware/card';
import { protectedProcedure, router } from '../trpc';

/** Presigned PUT URL TTL, mirrored as `expiresAt` on the initiate response. */
const PRESIGN_PUT_TTL_MS = 10 * 60 * 1000;

// ───────────────────────────────────────────────────────────────────────────
// initiate per-user rate limit — Faz 11B (DEM-148 / security H2)
// ───────────────────────────────────────────────────────────────────────────
/**
 * `attachment.initiate` writes a DB row + mints a MinIO presigned signature
 * on every call; without a cap a board member could flood the DB with draft
 * rows. This is a deliberately narrow, in-memory per-user token bucket — the
 * generic `rateLimitProcedure` middleware is a separate piece of work.
 *
 * V1 limitation: in-memory state assumes a single API instance. A multi-
 * instance deploy must move this to Redis (Faz 8 hardening). The map is
 * bounded by the active-user count — a fresh window overwrites the stale
 * entry, so no cleanup job is needed.
 */
const INITIATE_RATE_LIMIT = { max: 20, windowMs: 60_000 };
/** Exported for test isolation only (`beforeEach(() => initiateRateState.clear())`). */
export const initiateRateState = new Map<string, { count: number; windowStart: number }>();
function checkInitiateRateLimit(userId: string): void {
  const now = Date.now();
  const entry = initiateRateState.get(userId);
  if (!entry || now - entry.windowStart >= INITIATE_RATE_LIMIT.windowMs) {
    initiateRateState.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= INITIATE_RATE_LIMIT.max) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Cok fazla yukleme istegi. Lutfen biraz bekleyin.',
    });
  }
  entry.count += 1;
}

function requireObjectStorage(ctx: { objectStorage?: ObjectStorage }): ObjectStorage {
  if (!ctx.objectStorage) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Dosya depolama servisi yapilandirilmamis.',
    });
  }
  return ctx.objectStorage;
}

/**
 * Best-effort filename sanitiser for the storage-key segment. The original
 * `file_name` is kept on the row verbatim (UI download uses it); only the
 * S3/MinIO key fragment is normalised to printable ASCII so a CDN doesn't
 * choke on stray bytes.
 */
function safeStorageFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safe.length > 0 ? safe : 'attachment';
}

/** Shape of an `attachments` row enriched with the uploader join. */
interface AttachmentListRow {
  id: string;
  cardId: string;
  boardId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  description: string | null;
  uploaderId: string;
  uploaderName: string | null;
  uploaderImage: string | null;
  createdAt: Date;
  committedAt: Date | null;
}

interface AttachmentResponse {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind | null;
  description: string | null;
  uploader: { id: string; name: string | null; image: string | null };
  createdAt: Date;
  committedAt: Date | null;
  isCover: boolean;
}

function toAttachmentResponse(row: AttachmentListRow, isCover: boolean): AttachmentResponse {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    kind: attachmentKindFromMime(row.mimeType),
    description: row.description,
    uploader: { id: row.uploaderId, name: row.uploaderName, image: row.uploaderImage },
    createdAt: row.createdAt,
    committedAt: row.committedAt,
    isCover,
  };
}

export const attachmentRouter = router({
  // ─────────────────────────────────────────────────────────────────────
  // initiate — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Reserve an `attachments` row in *draft* state (`committed_at IS NULL`)
   * and return a presigned PUT URL. The client uploads directly to MinIO/S3
   * and then calls `commit` once the upload completes successfully. Drafts
   * older than 1 hour are reaped by the Faz 11C sweeper.
   *
   * Activity / realtime / notification side effects intentionally land in
   * `commit` — the upload may fail or be cancelled, in which case the row +
   * its object are silently swept and no audit trail / fan-out is needed.
   */
  initiate: cardProcedure.input(attachmentInitiateInput).mutation(async ({ ctx, input }) => {
    // Per-user rate limit (security H2) — runs before any DB / storage work.
    checkInitiateRateLimit(ctx.session.user.id);
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Dosya yukleme yetkiniz yok.' });
    }
    if (ctx.card.boardArchivedAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Arsivli board icin dosya yuklenemez.',
      });
    }

    const objectStorage = requireObjectStorage(ctx);
    const storageKey = `boards/${ctx.card.boardId}/cards/${ctx.card.id}/${crypto.randomUUID()}-${safeStorageFileName(
      input.fileName,
    )}`;

    const [row] = await ctx.db
      .insert(attachments)
      .values({
        cardId: ctx.card.id,
        boardId: ctx.card.boardId,
        uploaderId: ctx.session.user.id,
        storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        description: input.description ?? null,
        committedAt: null,
      })
      .returning({ id: attachments.id });
    if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const upload = await objectStorage.createPresignedPutUrl({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.size,
    });

    return {
      attachmentId: row.id,
      upload,
      expiresAt: new Date(Date.now() + PRESIGN_PUT_TTL_MS),
    };
  }),

  // ─────────────────────────────────────────────────────────────────────
  // commit — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Stamp `committed_at = NOW()` on a draft row and emit the full audit /
   * fan-out (activity event, realtime envelope, notification outbox). The
   * caller MUST be the uploader. Idempotent: a second commit on an already
   * committed row returns the existing summary without writing duplicates.
   */
  commit: protectedProcedure.input(attachmentCommitInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
    }
    if (existing.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sadece yukleyen kullanici onaylayabilir.' });
    }

    // Resolve board access (cardProcedure isn't on this procedure — we get
    // the cardId from the row, not the input).
    const board = await resolveBoardAccess(ctx.db, existing.boardId, ctx.session.user.id);
    if (!canEditBoardContent(accessFromBoardRole(board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Dosya yukleme yetkiniz yok.' });
    }
    if (board.archivedAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Arsivli board icin dosya yuklenemez.',
      });
    }

    // Idempotency: already committed → return the existing summary, no audit
    // writes. The `committedAt` snapshot is loaded inside the helper below
    // (after a fresh re-read), which also serves the race-winner branch.
    if (existing.committedAt !== null) {
      return await loadAttachmentResponse(ctx.db, existing.id);
    }

    let activityEventId: string | undefined;
    let realtimeEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      // Race-safe commit: only the first concurrent caller flips `committed_at`.
      const flipped = await tx
        .update(attachments)
        .set({ committedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(attachments.id, existing.id), isNull(attachments.committedAt)))
        .returning({
          id: attachments.id,
          committedAt: attachments.committedAt,
          fileName: attachments.fileName,
          mimeType: attachments.mimeType,
          size: attachments.size,
          description: attachments.description,
        });
      if (flipped.length === 0) {
        // Another caller raced us and committed first — return the existing
        // row's summary without writing duplicate audit rows.
        return { raced: true as const };
      }
      const row = flipped[0]!;

      const seq = await bumpBoardVersionForRealtime(tx, existing.boardId);

      const hasDescription = row.description !== null;
      const activityPayload: Record<string, unknown> = {
        attachmentId: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        hasDescription,
      };
      if (ctx.clientMutationId) activityPayload.clientMutationId = ctx.clientMutationId;
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          // workspaceId is on the board, not the attachment row — pull it
          // from the resolved board context.
          workspaceId: board.workspaceId,
          boardId: existing.boardId,
          cardId: existing.cardId,
          actorId: ctx.session.user.id,
          type: 'attachment.added',
          payload: activityPayload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      activityEventId = activity.id;

      // Uploader info for the realtime envelope.
      const [uploader] = await tx
        .select({ id: users.id, name: users.name, image: users.image })
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'attachment.added',
        workspaceId: board.workspaceId,
        boardId: existing.boardId,
        cardId: existing.cardId,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: {
          attachmentId: row.id,
          fileName: row.fileName,
          mimeType: row.mimeType,
          size: row.size,
          kind: attachmentKindFromMime(row.mimeType),
          hasDescription,
          uploader: {
            id: uploader?.id ?? ctx.session.user.id,
            name: uploader?.name ?? null,
            image: uploader?.image ?? null,
          },
        },
      });

      // Faz 6A — fan out notifications for the watcher pool. Actor self-skip
      // is handled inside the rule engine; the activity payload mirrors the
      // notification payload whitelist (`attachmentId` + `fileName`).
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'attachment.added',
        workspaceId: board.workspaceId,
        boardId: existing.boardId,
        cardId: existing.cardId,
        actorId: ctx.session.user.id,
        payload: activityPayload,
      });

      // Faz 6.5 search (DEM-163) — the attachment becomes searchable (file
      // name + description) only once it's committed; the draft INSERT in
      // `initiate` writes nothing to `search_documents`.
      await upsertSearchDocument(tx, { entityType: 'attachment', entityId: row.id });

      return { raced: false as const, dispatched: dispatched.inserted };
    });

    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    if (result.raced === false && result.dispatched > 0) {
      maybeEnqueueNotificationPublish(ctx, activityEventId);
    }

    return await loadAttachmentResponse(ctx.db, existing.id);
  }),

  // ─────────────────────────────────────────────────────────────────────
  // list — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Committed attachments for a card, newest first. Viewer+ board access
   * (already enforced by `cardProcedure`). Drafts are excluded — the orphan
   * sweeper reaps them.
   */
  list: cardProcedure.input(attachmentListInput).query(async ({ ctx }) => {
    const [rows, [cardRow]] = await Promise.all([
      ctx.db
        .select({
          id: attachments.id,
          cardId: attachments.cardId,
          boardId: attachments.boardId,
          storageKey: attachments.storageKey,
          fileName: attachments.fileName,
          mimeType: attachments.mimeType,
          size: attachments.size,
          description: attachments.description,
          uploaderId: attachments.uploaderId,
          uploaderName: users.name,
          uploaderImage: users.image,
          createdAt: attachments.createdAt,
          committedAt: attachments.committedAt,
        })
        .from(attachments)
        .leftJoin(users, eq(users.id, attachments.uploaderId))
        .where(and(eq(attachments.cardId, ctx.card.id), isNotNull(attachments.committedAt)))
        .orderBy(desc(attachments.committedAt)),
      ctx.db
        .select({ coverImageAttachmentId: cards.coverImageAttachmentId })
        .from(cards)
        .where(eq(cards.id, ctx.card.id))
        .limit(1),
    ]);
    const coverAttachmentId = cardRow?.coverImageAttachmentId ?? null;

    return rows.map((row) => toAttachmentResponse(row, row.id === coverAttachmentId));
  }),

  // ─────────────────────────────────────────────────────────────────────
  // update — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Edit the optional description on a committed attachment. Uploader OR
   * board admin only. No activity / realtime / notification (low-noise edit).
   * Draft rows are rejected (BAD_REQUEST).
   */
  update: protectedProcedure.input(attachmentUpdateInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
    }
    if (existing.committedAt === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Taslak ek guncellenemez.' });
    }

    const board = await resolveBoardAccess(ctx.db, existing.boardId, ctx.session.user.id);
    const access = accessFromBoardRole(board.role);
    const isUploader = existing.uploaderId === ctx.session.user.id;
    const isBoardAdmin = canManageBoard(access);
    // Permission gate: the uploader keeps full control of their own caption;
    // a board admin can also edit (cleanup of stale captions on members'
    // attachments). Viewers and non-uploader members are rejected — they
    // can still see the description through `list`.
    if (!(isUploader && canEditBoardContent(access)) && !isBoardAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Sadece yukleyen veya board admin guncelleyebilir.',
      });
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(attachments)
        .set({ description: input.description ?? null, updatedAt: new Date() })
        .where(eq(attachments.id, existing.id));
      // DEM-163 — the caption is part of the attachment search body, so the
      // index is refreshed in the same transaction as the row update.
      await upsertSearchDocument(tx, { entityType: 'attachment', entityId: existing.id });
    });

    return await loadAttachmentResponse(ctx.db, existing.id);
  }),

  // ─────────────────────────────────────────────────────────────────────
  // delete — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Delete an attachment row + its activity / realtime audit. Uploader OR
   * board admin only. The `cards.cover_image_attachment_id` FK is
   * `ON DELETE SET NULL` so a cover-linked attachment automatically clears
   * the cover. Post-commit, `ctx.enqueueAttachmentCleanup` (Faz 11C) drops
   * the storage object; the 60-min sweeper is the safety net.
   *
   * DEM-153 — `attachment.removed` artık `mapEventToNotificationType` ile
   * `attachment_removed` bildirim tipine route edilir; kart watcher'larına
   * in-app bildirim fan-out edilir (actor self-skip; 60 sn cooldown).
   */
  delete: protectedProcedure.input(attachmentDeleteInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
    }

    const board = await resolveBoardAccess(ctx.db, existing.boardId, ctx.session.user.id);
    const access = accessFromBoardRole(board.role);
    const isUploader = existing.uploaderId === ctx.session.user.id;
    const isBoardAdmin = canManageBoard(access);
    // Permission gate: uploader (must still be a board member) or board
    // admin. A viewer-grade uploader (e.g. demoted after upload) cannot
    // delete; the admin path covers that edge case.
    if (!(isUploader && canEditBoardContent(access)) && !isBoardAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Sadece yukleyen veya board admin silebilir.',
      });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    await ctx.db.transaction(async (tx) => {
      const seq = await bumpBoardVersionForRealtime(tx, existing.boardId);

      // Delete first — `cards.cover_image_attachment_id` FK is `ON DELETE
      // SET NULL`, so nothing else needs touching.
      await tx.delete(attachments).where(eq(attachments.id, existing.id));

      // DEM-163 — `search_documents` has no FK to `attachments` (entity_id is
      // plain text), so the search row must be removed explicitly.
      await deleteSearchDocument(tx, { entityType: 'attachment', entityId: existing.id });

      const payload: Record<string, unknown> = {
        attachmentId: existing.id,
        fileName: existing.fileName,
      };
      if (ctx.clientMutationId) payload.clientMutationId = ctx.clientMutationId;
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: board.workspaceId,
          boardId: existing.boardId,
          cardId: existing.cardId,
          actorId: ctx.session.user.id,
          type: 'attachment.removed',
          payload,
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // DEM-153 — dosya kaldırma kart watcher'larına in-app bildirim üretir.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'attachment.removed',
        workspaceId: board.workspaceId,
        boardId: existing.boardId,
        cardId: existing.cardId,
        actorId: ctx.session.user.id,
        payload,
      });
      if (dispatched.inserted > 0) notificationEventId = activity.id;

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'attachment.removed',
        workspaceId: board.workspaceId,
        boardId: existing.boardId,
        cardId: existing.cardId,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq,
        data: { attachmentId: existing.id },
      });
    });

    if (notificationEventId) maybeEnqueueNotificationPublish(ctx, notificationEventId);
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    maybeEnqueueAttachmentCleanup(ctx, {
      attachmentId: existing.id,
      storageKey: existing.storageKey,
    });

    return { id: existing.id, ok: true as const };
  }),

  // ─────────────────────────────────────────────────────────────────────
  // getDownloadUrl — DEM-110 legacy, kept after the createUpload rollup.
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Issue a presigned GET URL (TTL 10 min) for an attachment the caller can
   * see (viewer+ board access). Used by the card detail UI to preview /
   * download both legacy cover images and Faz 11 general attachments.
   *
   * Draft rows (`committed_at IS NULL`) are excluded — a presigned GET must
   * never be issued for an attachment that hasn't completed the two-phase
   * commit (the object may not exist yet, and the row is invisible to
   * `list`). Treated as NOT_FOUND so a draft id leaks no information.
   */
  getDownloadUrl: protectedProcedure
    .input(getAttachmentDownloadUrlInput)
    .query(async ({ ctx, input }) => {
      const [attachment] = await ctx.db
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, input.attachmentId), isNotNull(attachments.committedAt)))
        .limit(1);
      if (!attachment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
      }

      await resolveBoardAccess(ctx.db, attachment.boardId, ctx.session.user.id);
      const objectStorage = requireObjectStorage(ctx);
      const url = await objectStorage.createPresignedGetUrl({ key: attachment.storageKey });
      return { url };
    }),
});

/**
 * Re-read the row + uploader + cover linkage and shape the public response.
 * Used by `commit`/`update` after a write so the caller sees the persisted
 * state (including the freshly-stamped `committed_at`).
 */
async function loadAttachmentResponse(
  db: Database,
  attachmentId: string,
): Promise<AttachmentResponse> {
  const [row] = await db
    .select({
      id: attachments.id,
      cardId: attachments.cardId,
      boardId: attachments.boardId,
      storageKey: attachments.storageKey,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      size: attachments.size,
      description: attachments.description,
      uploaderId: attachments.uploaderId,
      uploaderName: users.name,
      uploaderImage: users.image,
      createdAt: attachments.createdAt,
      committedAt: attachments.committedAt,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.uploaderId))
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Dosya bulunamadi.' });
  }
  const [cardRow] = await db
    .select({ coverImageAttachmentId: cards.coverImageAttachmentId })
    .from(cards)
    .where(eq(cards.id, row.cardId))
    .limit(1);
  const isCover = (cardRow?.coverImageAttachmentId ?? null) === row.id;
  return toAttachmentResponse(row, isCover);
}

