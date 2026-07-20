/**
 * Board router — Phase 2A (DEM-34): board CRUD only. `list.*` / `card.*` land in
 * DEM-35 / DEM-36; `move`/reorder + drag-drop in Phase 3; optimistic UI in
 * Phase 4; realtime publishing in Phase 5; notification outbox in Phase 6.
 *
 * Authorization is server-side: `workspaceProcedure` / `boardProcedure` resolve
 * the caller's membership; the procedure body checks the finer role with
 * `@pusula/domain/permissions`. Each mutation's transaction contains only the
 * domain change + the `activity_events` insert (Phase 2 scope). See
 * `docs/domain/02-yetkilendirme-kurallari.md` (Board / List / Card procedure
 * haritası) and `docs/architecture/03-backend.md`.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, max, or, sql } from '@pusula/db';
import {
  activityEvents,
  attachments,
  boardFavorites,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  labels,
  lists,
  notifications,
  shareLinks,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  activityEventTypeSchema,
  archiveBoardInput,
  canManageBoard,
  canViewBoard,
  createBoardInput,
  effectiveBoardRole,
  idSchema,
  moveBoardToWorkspaceInput,
  setBoardFavoriteInput,
  updateBoardInput,
  type BoardRole,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { removeCardMembershipsOnBoardExcept } from '../lib/card-members-cleanup';
import { COVER_IMAGE_URL_TTL_SECONDS, toCoverImage } from '../lib/object-storage';
import {
  dispatchNotificationsForActivity,
  maybeEnqueueNotificationPublish,
} from '../lib/notification-outbox';
import { insertRealtimeEvent, maybeEnqueueRealtimePublish } from '../lib/realtime-publish';
import { syncSearchDocumentsForScope, upsertSearchDocument } from '../lib/search-indexer';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import { workspaceProcedure } from '../middleware/workspace';
import { router } from '../trpc';
import { boardAccessRequestsRouter } from './board-access-requests';
import { boardApiKeysRouter } from './board-api-keys';
import { boardInvitationsRouter } from './board-invitations';
import { boardMembersRouter } from './board-members';

/** Columns of a full board row returned to clients (sans internal-only fields — there are none yet). */
const boardCols = {
  id: boards.id,
  workspaceId: boards.workspaceId,
  title: boards.title,
  icon: boards.icon,
  background: boards.background,
  version: boards.version,
  archivedAt: boards.archivedAt,
  createdAt: boards.createdAt,
  updatedAt: boards.updatedAt,
} as const;

const BOARD_ACTIVITY_PAGE_DEFAULT = 20;
const BOARD_ACTIVITY_PAGE_MAX = 100;

type ActivityCursorParts = {
  createdAt: Date;
  id: string;
};

function encodeActivityCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeActivityCursor(cursor: string): ActivityCursorParts | null {
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

const boardActivityCursorSchema = z
  .string()
  .min(1)
  .refine((value) => decodeActivityCursor(value) !== null, { message: 'Geçersiz cursor.' });

const listBoardActivityInput = z.object({
  boardId: idSchema,
  limit: z.number().int().min(1).max(BOARD_ACTIVITY_PAGE_MAX).optional(),
  cursor: boardActivityCursorSchema.optional(),
  type: activityEventTypeSchema.optional(),
});

export const boardRouter = router({
  /**
   * Boards in the workspace, with the caller's effective role on each.
   * A workspace `guest` sees only boards they're an explicit `board_members`
   * row of; `member+` sees every board (with an inherited or explicit role).
   * Archived boards are returned too (read-only, but still visible).
   *
   * DEM-192 (Anasayfa Variant A) — each row is additively enriched with the
   * lightweight metadata the home screen renders: `updatedAt`, open/done card
   * counts (active cards only), the board's members (`{ userId, name, image,
   * role }` — never e-mail), whether the caller has favorited the board, and
   * the timestamp of the most recent activity. The four aggregates each depend
   * only on the resolved `boardIds`, so they run in parallel (`Promise.all`)
   * and are skipped entirely when the workspace has no visible boards.
   */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const callerId = ctx.session.user.id;
    const listCols = {
      id: boards.id,
      title: boards.title,
      icon: boards.icon,
      background: boards.background,
      version: boards.version,
      archivedAt: boards.archivedAt,
      createdAt: boards.createdAt,
      updatedAt: boards.updatedAt,
      boardRole: boardMembers.role,
    } as const;
    const rows =
      ctx.workspace.role === 'guest'
        ? await ctx.db
            .select(listCols)
            .from(boards)
            .innerJoin(
              boardMembers,
              and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, callerId)),
            )
            .where(eq(boards.workspaceId, ctx.workspace.id))
            .orderBy(asc(boards.createdAt))
        : await ctx.db
            .select(listCols)
            .from(boards)
            .leftJoin(
              boardMembers,
              and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, callerId)),
            )
            .where(eq(boards.workspaceId, ctx.workspace.id))
            .orderBy(asc(boards.createdAt));

    // --- Per-board aggregates, all keyed by the resolved board ids -----------
    type CardCountRow = { boardId: string; openCount: number; doneCount: number };
    type BoardMemberRow = {
      boardId: string;
      userId: string;
      name: string | null;
      image: string | null;
      role: BoardRole;
    };
    type LastActivityRow = { boardId: string | null; lastActivityAt: Date | null };
    const boardIds = rows.map((row) => row.id);
    const [cardCountRows, memberRows, favoriteRows, activityRows]: [
      CardCountRow[],
      BoardMemberRow[],
      { boardId: string }[],
      LastActivityRow[],
    ] =
      boardIds.length === 0
        ? [[], [], [], []]
        : await Promise.all([
            ctx.db
              .select({
                boardId: cards.boardId,
                openCount: sql<number>`(count(*) filter (where not ${cards.completed}))::int`,
                doneCount: sql<number>`(count(*) filter (where ${cards.completed}))::int`,
              })
              .from(cards)
              .where(and(inArray(cards.boardId, boardIds), isNull(cards.archivedAt)))
              .groupBy(cards.boardId),
            ctx.db
              .select({
                boardId: boardMembers.boardId,
                userId: boardMembers.userId,
                name: users.name,
                image: users.image,
                role: boardMembers.role,
              })
              .from(boardMembers)
              .innerJoin(users, eq(users.id, boardMembers.userId))
              .where(inArray(boardMembers.boardId, boardIds))
              .orderBy(asc(users.name)),
            ctx.db
              .select({ boardId: boardFavorites.boardId })
              .from(boardFavorites)
              .where(
                and(
                  eq(boardFavorites.userId, callerId),
                  inArray(boardFavorites.boardId, boardIds),
                ),
              ),
            ctx.db
              .select({
                boardId: activityEvents.boardId,
                lastActivityAt: max(activityEvents.createdAt),
              })
              .from(activityEvents)
              .where(inArray(activityEvents.boardId, boardIds))
              .groupBy(activityEvents.boardId),
          ]);

    const cardCountByBoard = new Map<string, { openCount: number; doneCount: number }>();
    for (const row of cardCountRows) {
      cardCountByBoard.set(row.boardId, { openCount: row.openCount, doneCount: row.doneCount });
    }

    const membersByBoard = new Map<
      string,
      { userId: string; name: string | null; image: string | null; role: BoardRole }[]
    >();
    for (const row of memberRows) {
      const entry = { userId: row.userId, name: row.name, image: row.image, role: row.role };
      const bucket = membersByBoard.get(row.boardId);
      if (bucket) bucket.push(entry);
      else membersByBoard.set(row.boardId, [entry]);
    }

    const favoritedBoardIds = new Set(favoriteRows.map((row) => row.boardId));

    const lastActivityByBoard = new Map<string, Date | null>();
    for (const row of activityRows) {
      if (row.boardId) lastActivityByBoard.set(row.boardId, row.lastActivityAt);
    }

    return rows.map((row) => {
      const cardCount = cardCountByBoard.get(row.id);
      return {
        id: row.id,
        title: row.title,
        icon: row.icon,
        background: row.background,
        version: row.version,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // For a guest these rows come from an inner join, so `boardRole` is always
        // non-null and `effectiveBoardRole` returns it verbatim; for member+ it may
        // be null and is inherited from the workspace role.
        role: effectiveBoardRole({
          workspaceRole: ctx.workspace.role,
          boardRole: row.boardRole ?? null,
        }) as BoardRole,
        openCount: cardCount?.openCount ?? 0,
        doneCount: cardCount?.doneCount ?? 0,
        members: membersByBoard.get(row.id) ?? [],
        favorited: favoritedBoardIds.has(row.id),
        lastActivityAt: lastActivityByBoard.get(row.id) ?? null,
      };
    });
  }),

  /**
   * Create a board in the workspace. Workspace `member+` only (a `guest` cannot
   * create boards). The creator becomes a board `admin` member. Writes a
   * `board.created` activity event in the same transaction.
   *
   * Faz 5B (DEM-84) — intentionally NOT in scope: `board.create` has no realtime
   * outbox write because the board didn't exist a millisecond ago and no client
   * is subscribed to its `board:{newBoardId}` room yet. Workspace-level "board
   * listesi güncellendi" sync would need a `workspace:{id}` room — planned for
   * Faz 6+. See `docs/architecture/06-bildirim-altyapisi.md` "Realtime event
   * yayın katmanı" mutation kapsamı listesi.
   */
  create: workspaceProcedure.input(createBoardInput).mutation(async ({ ctx, input }) => {
    if (ctx.workspace.role === 'guest') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Board oluşturma yetkiniz yok.' });
    }

    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [board] = await tx
        .insert(boards)
        .values({ workspaceId: ctx.workspace.id, title: input.title, icon: input.icon })
        .returning(boardCols);
      if (!board) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx
        .insert(boardMembers)
        .values({ boardId: board.id, userId: ctx.session.user.id, role: 'admin' });

      const boardCreatedPayload = {
        // Phase 4A (DEM-78): the optional `clientMutationId` is carried through
        // every collaborative activity payload. `undefined` keys are stripped
        // by jsonb serialisation, so omission leaves no on-disk trace —
        // Phase 5 dedupe reads `payload->>'clientMutationId'` on present rows.
        title: board.title,
        icon: board.icon,
        clientMutationId: ctx.clientMutationId,
      };
      const [boardCreatedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.workspace.id,
          boardId: board.id,
          actorId: ctx.session.user.id,
          type: 'board.created',
          payload: boardCreatedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!boardCreatedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Bildirim kapsamı genişletme (Faz 2) — board oluşturma board audience'a
      // `board_created` bildirimi üretir. Oluşturan (actor) tek board üyesi +
      // self-skip; alıcılar workspace'in diğer non-guest üyeleri (board'u
      // görür). Yeni board'a kimse atanmamışsa (tek kişilik workspace) hiç
      // satır üretilmez.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: boardCreatedActivity.id,
        type: 'board.created',
        workspaceId: ctx.workspace.id,
        boardId: board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: boardCreatedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = boardCreatedActivity.id;

      await upsertSearchDocument(tx, { entityType: 'board', entityId: board.id });

      return { ...board, role: 'admin' satisfies BoardRole };
    });
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Board shell + its lists + active cards, for the board screen (Phase 2D will
   * consume this shape). `boardProcedure` already guarantees `viewer+`. Lists
   * include archived ones (read-only, still rendered); cards are active only
   * (`archived_at IS NULL`). Cards are fetched in one query keyed by `boardId`
   * and grouped client-side. Both lists and cards are returned in `position`
   * order. Each card carries its attached `labels` (`{ labelId, name, color }[]`,
   * `card_labels ⋈ labels`, fetched in a single query for the whole board and
   * grouped here) so the board screen can render label chips + a label filter
   * without an extra round-trip per card (Phase 2.5E — DEM-54).
   *
   * Phase 2.7B (DEM-63 — board screen polish) additively enriches each card with
   * lightweight metadata for the card chip badges: `checklistTotal` /
   * `checklistDone` (aggregated over the card's checklists' items),
   * `commentCount` (non-deleted comments) and `members` (`card_members ⋈ users` —
   * `{ userId, name, image, role }`, never e-mail). Each is one batched query over
   * the board's card ids (`GROUP BY` / `WHERE card_id IN (...)`) — no per-card
   * round-trip. On an empty board these queries are skipped. See
   * `docs/architecture/03-backend.md` / `docs/architecture/05-board-mekanigi.md`.
   *
   * Phase 2.7 (DEM-66/DEM-67): each card also carries
   * `completed`/`completedAt`/`completedBy`/`coverColor` straight from the `cards`
   * row (no extra query).
   */
  get: boardProcedure.query(async ({ ctx }) => {
    if (!canViewBoard(accessFromBoardRole(ctx.board.role))) {
      // Unreachable in practice — `boardProcedure` already enforces viewer+ — but
      // makes the authorization explicit.
      throw new TRPCError({ code: 'FORBIDDEN', message: "Bu board'a erişiminiz yok." });
    }

    const [board] = await ctx.db
      .select(boardCols)
      .from(boards)
      .where(eq(boards.id, ctx.board.id))
      .limit(1);
    if (!board) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
    }

    const boardLists = await ctx.db
      .select({
        id: lists.id,
        title: lists.title,
        color: lists.color,
        icon: lists.icon,
        iconColor: lists.iconColor,
        position: lists.position,
        archivedAt: lists.archivedAt,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .where(eq(lists.boardId, ctx.board.id))
      .orderBy(asc(lists.position));

    const boardCards = await ctx.db
      .select({
        id: cards.id,
        listId: cards.listId,
        boardId: cards.boardId,
        title: cards.title,
        description: cards.description,
        position: cards.position,
        dueAt: cards.dueAt,
        completed: cards.completed,
        completedAt: cards.completedAt,
        completedBy: cards.completedBy,
        coverColor: cards.coverColor,
        coverImageAttachmentId: cards.coverImageAttachmentId,
        archivedAt: cards.archivedAt,
        createdAt: cards.createdAt,
        updatedAt: cards.updatedAt,
      })
      .from(cards)
      .where(and(eq(cards.boardId, ctx.board.id), isNull(cards.archivedAt)))
      .orderBy(asc(cards.position));

    // --- Per-card aggregates, all keyed by the board's card ids ---------------
    //
    // The four queries below each depend only on `cardIds` (not on each other),
    // so they run in parallel (`Promise.all`). On an empty board they're skipped
    // entirely. Card labels (`card_labels ⋈ labels`), checklist progress
    // (`GROUP BY checklists.card_id`), non-deleted comment counts, and card
    // members (`card_members ⋈ users` — name + image + role only, never e-mail).
    type CardLabelRow = { cardId: string; labelId: string; name: string; color: string };
    type ChecklistAggRow = { cardId: string; total: number; done: number };
    type CommentAggRow = { cardId: string; count: number };
    // Faz 11B (DEM-148) — committed attachment count per card (`committed_at
    // IS NOT NULL`). Drafts are excluded. One GROUP BY query — no N+1.
    type AttachmentAggRow = { cardId: string; count: number };
    type CardMemberRow = {
      cardId: string;
      userId: string;
      name: string | null;
      image: string | null;
      role: 'assignee' | 'watcher';
    };
    type CoverAttachmentRow = {
      id: string;
      fileName: string;
      mimeType: string;
      size: number;
      storageKey: string;
    };
    const cardIds = boardCards.map((c) => c.id);
    const coverAttachmentIds = boardCards
      .map((c) => c.coverImageAttachmentId)
      .filter((id): id is string => Boolean(id));
    const [
      labelRows,
      checklistRows,
      commentRows,
      attachmentRows,
      memberRows,
      coverRows,
    ]: [
      CardLabelRow[],
      ChecklistAggRow[],
      CommentAggRow[],
      AttachmentAggRow[],
      CardMemberRow[],
      CoverAttachmentRow[],
    ] =
      cardIds.length === 0
        ? [[], [], [], [], [], []]
        : await Promise.all([
            ctx.db
              .select({
                cardId: cardLabels.cardId,
                labelId: cardLabels.labelId,
                name: labels.name,
                color: labels.color,
              })
              .from(cardLabels)
              .innerJoin(labels, eq(labels.id, cardLabels.labelId))
              .where(inArray(cardLabels.cardId, cardIds))
              .orderBy(asc(labels.name), asc(labels.color)),
            ctx.db
              .select({
                cardId: checklists.cardId,
                total: sql<number>`(count(${checklistItems.id}))::int`,
                done: sql<number>`(count(${checklistItems.id}) filter (where ${checklistItems.completed}))::int`,
              })
              .from(checklists)
              .leftJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
              // Arşivli checklist'ler kart rozeti sayımına girmez (invariant 23).
              .where(and(inArray(checklists.cardId, cardIds), isNull(checklists.archivedAt)))
              .groupBy(checklists.cardId),
            ctx.db
              .select({ cardId: comments.cardId, count: sql<number>`(count(*))::int` })
              .from(comments)
              .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt)))
              .groupBy(comments.cardId),
            // Faz 11B (DEM-148) — committed attachment count per card. Filter
            // by `committed_at IS NOT NULL` so draft (orphan) rows don't
            // inflate badge counts. The partial index
            // `attachments_card_committed_idx` covers this exactly.
            ctx.db
              .select({ cardId: attachments.cardId, count: sql<number>`(count(*))::int` })
              .from(attachments)
              .where(
                and(inArray(attachments.cardId, cardIds), isNotNull(attachments.committedAt)),
              )
              .groupBy(attachments.cardId),
            ctx.db
              .select({
                cardId: cardMembers.cardId,
                userId: cardMembers.userId,
                name: users.name,
                image: users.image,
                role: cardMembers.role,
              })
              .from(cardMembers)
              .innerJoin(users, eq(users.id, cardMembers.userId))
              .where(inArray(cardMembers.cardId, cardIds))
              .orderBy(asc(cardMembers.role), asc(users.name)),
            coverAttachmentIds.length === 0
              ? Promise.resolve([])
              : ctx.db
                  .select({
                    id: attachments.id,
                    fileName: attachments.fileName,
                    mimeType: attachments.mimeType,
                    size: attachments.size,
                    storageKey: attachments.storageKey,
                  })
                  .from(attachments)
                  .where(inArray(attachments.id, coverAttachmentIds)),
          ]);

    const labelsByCard = new Map<string, { labelId: string; name: string; color: string }[]>();
    for (const row of labelRows) {
      const bucket = labelsByCard.get(row.cardId);
      const entry = { labelId: row.labelId, name: row.name, color: row.color };
      if (bucket) bucket.push(entry);
      else labelsByCard.set(row.cardId, [entry]);
    }

    const checklistByCard = new Map<string, { total: number; done: number }>();
    for (const row of checklistRows) {
      checklistByCard.set(row.cardId, { total: row.total, done: row.done });
    }

    const commentCountByCard = new Map<string, number>();
    for (const row of commentRows) commentCountByCard.set(row.cardId, row.count);

    // Faz 11B (DEM-148) — `attachmentCount` is the committed-only count.
    const attachmentCountByCard = new Map<string, number>();
    for (const row of attachmentRows) attachmentCountByCard.set(row.cardId, row.count);

    const membersByCard = new Map<
      string,
      { userId: string; name: string | null; image: string | null; role: 'assignee' | 'watcher' }[]
    >();
    for (const row of memberRows) {
      const entry = { userId: row.userId, name: row.name, image: row.image, role: row.role };
      const bucket = membersByCard.get(row.cardId);
      if (bucket) bucket.push(entry);
      else membersByCard.set(row.cardId, [entry]);
    }

    const coverImageByAttachmentId = new Map(
      coverRows.map((row) => [row.id, toCoverImage(row)] as const),
    );

    // DEM-227 — kapak görseli presigned GET URL'leri server-side üretilir, böylece
    // board ekranı kapak başına ayrı `attachment.getDownloadUrl` query'si açmaz
    // ("waterfall" kaldırıldı). TTL 1 saat: `board.get` client `staleTime`'ı
    // (5 dk) içinde URL ölmesin. Presigning saf crypto'dur (ağ yok) — N kapak
    // için sıralı/paralel fark etmez. `objectStorage` yapılandırılmamışsa veya
    // bir presign başarısız olursa o kapak için `coverImageUrl = null` (graceful
    // degradation — kapak şeridi gösterilmez, board yanıtı düşmez).
    const coverImageUrlByAttachmentId = new Map<string, string>();
    if (ctx.objectStorage && coverRows.length > 0) {
      const objectStorage = ctx.objectStorage;
      const signed = await Promise.all(
        coverRows.map(async (row) => {
          try {
            const url = await objectStorage.createPresignedGetUrl({
              key: row.storageKey,
              expiresIn: COVER_IMAGE_URL_TTL_SECONDS,
            });
            return [row.id, url] as const;
          } catch {
            return null;
          }
        }),
      );
      for (const entry of signed) {
        if (entry) coverImageUrlByAttachmentId.set(entry[0], entry[1]);
      }
    }

    return {
      board: { ...board, role: ctx.board.role },
      lists: boardLists,
      cards: boardCards.map((card) => {
        const checklist = checklistByCard.get(card.id);
        return {
          ...card,
          labels: labelsByCard.get(card.id) ?? [],
          checklistTotal: checklist?.total ?? 0,
          checklistDone: checklist?.done ?? 0,
          commentCount: commentCountByCard.get(card.id) ?? 0,
          attachmentCount: attachmentCountByCard.get(card.id) ?? 0,
          members: membersByCard.get(card.id) ?? [],
          coverImage: card.coverImageAttachmentId
            ? (coverImageByAttachmentId.get(card.coverImageAttachmentId) ?? null)
            : null,
          // DEM-227 — server-side üretilmiş presigned GET URL (TTL 1 saat) ya da
          // `null` (kapak yok / presign başarısız / objectStorage yok).
          coverImageUrl: card.coverImageAttachmentId
            ? (coverImageUrlByAttachmentId.get(card.coverImageAttachmentId) ?? null)
            : null,
        };
      }),
    };
  }),

  /** Board activity feed — `board.activity.list`. */
  activity: router({
    /**
     * Cursor-paginated board-scoped activity history, newest first. Board
     * `viewer+` is enforced by `boardProcedure`; the feed intentionally stays
     * outside `board.get` so the board payload remains compact.
     */
    list: boardProcedure.input(listBoardActivityInput).query(async ({ ctx, input }) => {
      const limit = input.limit ?? BOARD_ACTIVITY_PAGE_DEFAULT;
      const cursor = input.cursor ? decodeActivityCursor(input.cursor) : null;

      const rows = await ctx.db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          actorId: activityEvents.actorId,
          actorName: users.name,
          actorImage: users.image,
          payload: activityEvents.payload,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .leftJoin(users, eq(users.id, activityEvents.actorId))
        .where(
          and(
            eq(activityEvents.boardId, ctx.board.id),
            input.type ? eq(activityEvents.type, input.type) : undefined,
            cursor
              ? or(
                  lt(activityEvents.createdAt, cursor.createdAt),
                  and(
                    eq(activityEvents.createdAt, cursor.createdAt),
                    lt(activityEvents.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: hasMore && last ? encodeActivityCursor(last.createdAt, last.id) : null,
      };
    }),
  }),

  /**
   * Update board settings. Board `admin` only. An archived board is read-only.
   * Idempotent: unchanged requested fields return `{ ..., changed: false }`
   * without bumping `version` or writing activity/realtime.
   */
  update: boardProcedure.input(updateBoardInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Board ayarlarını değiştirme yetkiniz yok.',
      });
    }
    const wantsTitle = input.title !== undefined;
    const wantsBackground = input.background !== undefined;
    const wantsIcon = input.icon !== undefined;
    if (!wantsTitle && !wantsBackground && !wantsIcon) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin.' });
    }

    let realtimeEventId: string | undefined;
    // Bildirim kapsamı genişletme (Faz 2) — başlık + arka plan aynı update
    // çağrısında değişebilir; her biri kendi activity'sini ve bildirimini
    // üretir, ikisi de ayrı publish job'una kuyruğa atılır.
    const notificationEventIds: string[] = [];
    const result = await ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select(boardCols)
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (current.archivedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
      }
      const titleChanged = wantsTitle && current.title !== input.title;
      const backgroundChanged = wantsBackground && current.background !== input.background;
      const iconChanged = wantsIcon && current.icon !== input.icon;
      if (!titleChanged && !backgroundChanged && !iconChanged) {
        return { ...current, role: ctx.board.role, changed: false as const };
      }

      const patch: { title?: string; background?: string | null; icon?: string } = {};
      const updates: {
        title?: string;
        background?: string | null;
        icon?: string;
        version: ReturnType<typeof sql>;
      } = { version: sql`${boards.version} + 1` };
      if (titleChanged) {
        const nextTitle = input.title as string;
        updates.title = nextTitle;
        patch.title = nextTitle;
      }
      if (backgroundChanged) {
        const nextBackground = input.background as string | null;
        updates.background = nextBackground;
        patch.background = nextBackground;
      }
      if (iconChanged) {
        const nextIcon = input.icon as string;
        updates.icon = nextIcon;
        patch.icon = nextIcon;
      }

      const [updated] = await tx
        .update(boards)
        .set(updates)
        .where(eq(boards.id, ctx.board.id))
        .returning(boardCols);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      if (titleChanged) {
        const nextTitle = input.title as string;
        const boardRenamedPayload = {
          fromTitle: current.title,
          toTitle: nextTitle,
          clientMutationId: ctx.clientMutationId,
        };
        const [boardRenamedActivity] = await tx
          .insert(activityEvents)
          .values({
            workspaceId: ctx.board.workspaceId,
            boardId: ctx.board.id,
            actorId: ctx.session.user.id,
            type: 'board.renamed',
            payload: boardRenamedPayload,
          })
          .returning({ id: activityEvents.id });
        if (!boardRenamedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Bildirim kapsamı genişletme (Faz 2) — yeniden adlandırma board
        // audience'a `board_renamed` bildirimi üretir.
        const dispatched = await dispatchNotificationsForActivity(tx, {
          id: boardRenamedActivity.id,
          type: 'board.renamed',
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          cardId: null,
          actorId: ctx.session.user.id,
          payload: boardRenamedPayload,
        });
        if (dispatched.inserted > 0) notificationEventIds.push(boardRenamedActivity.id);
      }

      if (backgroundChanged) {
        const nextBackground = input.background as string | null;
        const backgroundType =
          nextBackground === null ? 'board.background_cleared' : 'board.background_changed';
        const boardBackgroundPayload =
          nextBackground === null
            ? { from: current.background, clientMutationId: ctx.clientMutationId }
            : {
                from: current.background,
                to: nextBackground,
                clientMutationId: ctx.clientMutationId,
              };
        const [boardBackgroundActivity] = await tx
          .insert(activityEvents)
          .values({
            workspaceId: ctx.board.workspaceId,
            boardId: ctx.board.id,
            actorId: ctx.session.user.id,
            type: backgroundType,
            payload: boardBackgroundPayload,
          })
          .returning({ id: activityEvents.id });
        if (!boardBackgroundActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Bildirim kapsamı genişletme (Faz 2) — yalnız arka plan *değişimi*
        // (`board.background_changed`) board audience'a `board_background_changed`
        // bildirimi üretir; temizleme (`board.background_cleared`) kapsam dışı —
        // `mapEventToNotificationType` onun için null döner, dispatch 0 satır
        // yazar, enqueue edilmez.
        const dispatched = await dispatchNotificationsForActivity(tx, {
          id: boardBackgroundActivity.id,
          type: backgroundType,
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          cardId: null,
          actorId: ctx.session.user.id,
          payload: boardBackgroundPayload,
        });
        if (dispatched.inserted > 0) notificationEventIds.push(boardBackgroundActivity.id);
      }
      if (iconChanged) {
        const nextIcon = input.icon as string;
        await tx.insert(activityEvents).values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.updated',
          payload: {
            fromIcon: current.icon,
            toIcon: nextIcon,
            clientMutationId: ctx.clientMutationId,
          },
        });
      }

      const realtimeData: {
        boardId: string;
        patch: { title?: string; background?: string | null; icon?: string };
        fromTitle?: string;
        toTitle?: string;
        fromBackground?: string | null;
        toBackground?: string | null;
        fromIcon?: string;
        toIcon?: string;
      } = { boardId: ctx.board.id, patch };
      if (titleChanged) {
        realtimeData.fromTitle = current.title;
        realtimeData.toTitle = updated.title;
      }
      if (backgroundChanged) {
        realtimeData.fromBackground = current.background;
        realtimeData.toBackground = updated.background;
      }
      if (iconChanged) {
        realtimeData.fromIcon = current.icon;
        realtimeData.toIcon = updated.icon;
      }

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.updated',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: updated.version,
        data: realtimeData,
      });

      if (titleChanged) {
        await upsertSearchDocument(tx, { entityType: 'board', entityId: ctx.board.id });
      }

      return { ...updated, role: ctx.board.role, changed: true as const };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    for (const eventId of notificationEventIds) maybeEnqueueNotificationPublish(ctx, eventId);
    return result;
  }),

  /**
   * Archive (or restore) a board. Board `admin` only. `archived: true` sets
   * `archived_at = now()`; `false` clears it. Idempotent: a no-op flip returns
   * `{ id, archivedAt, changed: false }` without writing activity. An archived
   * board is read-only for everything else (see `update`, and later list/card
   * procedures). Bumps `version` on a real change.
   */
  archive: boardProcedure.input(archiveBoardInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yalnızca board admini arşivleyebilir.' });
    }

    let realtimeEventId: string | undefined;
    let notificationEventId: string | undefined;
    const result = await ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ archivedAt: boards.archivedAt, version: boards.version })
        .from(boards)
        .where(eq(boards.id, ctx.board.id))
        .limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }

      const isArchived = current.archivedAt !== null;
      if (isArchived === input.archived) {
        return {
          id: ctx.board.id,
          archivedAt: current.archivedAt,
          version: current.version,
          changed: false as const,
        };
      }

      const nextArchivedAt = input.archived ? new Date() : null;
      const [updated] = await tx
        .update(boards)
        .set({ archivedAt: nextArchivedAt, version: sql`${boards.version} + 1` })
        .where(eq(boards.id, ctx.board.id))
        .returning({ id: boards.id, archivedAt: boards.archivedAt, version: boards.version });
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const boardArchivedPayload = {
        archived: input.archived,
        clientMutationId: ctx.clientMutationId,
      };
      const [boardArchivedActivity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: ctx.board.workspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.archived',
          payload: boardArchivedPayload,
        })
        .returning({ id: activityEvents.id });
      if (!boardArchivedActivity) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Bildirim kapsamı genişletme (Faz 2) — arşivleme/geri alma board
      // audience'a `board_archived` bildirimi üretir (`payload.archived` yönü).
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: boardArchivedActivity.id,
        type: 'board.archived',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        cardId: null,
        actorId: ctx.session.user.id,
        payload: boardArchivedPayload,
      });
      if (dispatched.inserted > 0) notificationEventId = boardArchivedActivity.id;

      realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'board.archived',
        workspaceId: ctx.board.workspaceId,
        boardId: ctx.board.id,
        actorId: ctx.session.user.id,
        clientMutationId: ctx.clientMutationId,
        seq: updated.version,
        data: { boardId: ctx.board.id, archived: input.archived },
      });

      await syncSearchDocumentsForScope(tx, { boardId: ctx.board.id });

      return {
        id: updated.id,
        archivedAt: updated.archivedAt,
        version: updated.version,
        changed: true as const,
      };
    });
    maybeEnqueueRealtimePublish(ctx, realtimeEventId);
    maybeEnqueueNotificationPublish(ctx, notificationEventId);
    return result;
  }),

  /**
   * Panoyu tüm içeriğiyle başka workspace'e taşır (2026-07-13). Board `admin`
   * **ve** hedef workspace `member+` (`guest` hariç — `board.create` simetrisi)
   * ister. Yalnız `boards.workspace_id` değişir; board-scope child satırlar
   * (`lists`/`cards`/`labels`/`checklists`/`comments`/`attachments`/üyeler/
   * davetler) `board_id` üzerinden bağlı olduğu için kendiliğinden gelir.
   *
   * Aynı transaction'da:
   *  - hedef workspace'te üyeliği olmayan explicit board üyeleri workspace
   *    `guest` yapılır (board davet kabulü / erişim talebi onayı emsali —
   *    invariant 13; kişi başına `workspace.member_added` activity);
   *  - denormalize `workspace_id` alanları hedefe taşınır: `activity_events`
   *    (pano geçmişi panoyla gider), `notifications` (kolon + payload —
   *    eski bildirim deep-link'leri kırılmasın), `share_links` (board'un
   *    kartlarına ait) ve `search_documents` (scope re-sync). `audit_log`
   *    tarihsel kayıt olarak taşınmaz; `notification_outbox` scope kolonu
   *    taşımaz (scope payload'da — pending penceresini canonical redirect
   *    telafi eder).
   *
   * Activity: tek `board.moved_workspace` (hedef workspace'e). **Bildirim
   * üretmez** (v1 — `mapEventToNotificationType` null döner). Realtime
   * `board.movedToWorkspace` board odasına yayınlanır; `boards.version` artar.
   * İdempotent: hedef = mevcut workspace → `changed: false`, yazma yok.
   * Kurallar: `docs/domain/02-yetkilendirme-kurallari.md` CRUD haritası.
   */
  moveToWorkspace: boardProcedure
    .input(moveBoardToWorkspaceInput)
    .mutation(async ({ ctx, input }) => {
      if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Panoyu taşıma yetkiniz yok.' });
      }

      let realtimeEventId: string | undefined;
      const result = await ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select(boardCols)
          .from(boards)
          .where(eq(boards.id, ctx.board.id))
          .limit(1);
        if (!current) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
        }
        if (current.archivedAt) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arşivli board taşınamaz.' });
        }
        if (current.workspaceId === input.toWorkspaceId) {
          return { ...current, role: ctx.board.role, changed: false as const };
        }

        const [target] = await tx
          .select({ id: workspaces.id, name: workspaces.name, archivedAt: workspaces.archivedAt })
          .from(workspaces)
          .where(eq(workspaces.id, input.toWorkspaceId))
          .limit(1);
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Hedef workspace bulunamadı.' });
        }
        if (target.archivedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: "Arşivli workspace'e pano taşınamaz.",
          });
        }

        const [targetMembership] = await tx
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.toWorkspaceId),
              eq(workspaceMembers.userId, ctx.session.user.id),
            ),
          )
          .limit(1);
        if (!targetMembership || targetMembership.role === 'guest') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: "Hedef çalışma alanında pano taşıma yetkiniz yok.",
          });
        }

        const [source] = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, current.workspaceId))
          .limit(1);

        const [updated] = await tx
          .update(boards)
          .set({ workspaceId: input.toWorkspaceId, version: sql`${boards.version} + 1` })
          .where(eq(boards.id, ctx.board.id))
          .returning(boardCols);
        if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        // Hedef workspace'te üyeliği olmayan explicit board üyelerini `guest`
        // yap — board rolleri değişmediği için erişimleri kesintisiz sürer.
        const explicitMembers = await tx
          .select({ userId: boardMembers.userId })
          .from(boardMembers)
          .where(eq(boardMembers.boardId, ctx.board.id));
        const targetMembers = await tx
          .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.workspaceId, input.toWorkspaceId));
        const targetMemberIds = new Set(targetMembers.map((m) => m.userId));
        const missingMemberIds = explicitMembers
          .map((m) => m.userId)
          .filter((userId) => !targetMemberIds.has(userId));
        if (missingMemberIds.length > 0) {
          const insertedGuests = await tx
            .insert(workspaceMembers)
            .values(
              missingMemberIds.map((userId) => ({
                workspaceId: input.toWorkspaceId,
                userId,
                role: 'guest' as const,
              })),
            )
            .onConflictDoNothing()
            .returning({ userId: workspaceMembers.userId });
          if (insertedGuests.length > 0) {
            await tx.insert(activityEvents).values(
              insertedGuests.map(({ userId }) => ({
                workspaceId: input.toWorkspaceId,
                actorId: ctx.session.user.id,
                type: 'workspace.member_added' as const,
                payload: { userId, role: 'guest', viaBoardMove: ctx.board.id },
              })),
            );
          }
        }

        // Invariant 24 (2026-07-20) — hedef workspace'te panoya erişimi
        // kalmayanların (explicit koltuk yok + hedefte non-guest ws üyeliği
        // yok) bu panodaki kart üyelikleri düşer. Explicit üyeler yukarıda
        // otomatik `guest` yapıldığı için erişimlerini korur ve sette zaten
        // vardır.
        const accessibleAfterMove = new Set<string>(explicitMembers.map((m) => m.userId));
        for (const m of targetMembers) {
          if (m.role !== 'guest') accessibleAfterMove.add(m.userId);
        }
        await removeCardMembershipsOnBoardExcept(tx, ctx.board.id, accessibleAfterMove);

        // Denormalize `workspace_id` alanlarını hedefe taşı. Board'un geçmiş
        // activity satırları panoyla gider; bildirim satırlarının hem kolonu
        // (FK cascade doğruluğu — kaynak workspace silinirse pano bildirimleri
        // kaybolmasın) hem payload'daki `workspaceId` (web/mobil deep-link
        // buradan kurulur) güncellenir; share link'ler workspace-scope
        // envanter/audit görünümü için taşınır. `notification_outbox` scope
        // kolonu taşımaz (scope payload'dadır; pending satır penceresi küçük —
        // bayat deep-link'i board ekranının canonical redirect'i telafi eder).
        // `audit_log` bilinçli olarak taşınmaz.
        await tx
          .update(activityEvents)
          .set({ workspaceId: input.toWorkspaceId })
          .where(eq(activityEvents.boardId, ctx.board.id));
        // Bildirim satırları: tarihsel kayıtlarda `board_id` kolonu NULL'dur
        // (in-app fan-out 2026-07-20'ye dek scope kolonlarını doldurmuyordu) —
        // eşleşme bu yüzden kolondan DEĞİL `payload->>'boardId'`dan yapılır;
        // kolonlar burada geriye dönük de doldurulur (board mevcut — FK güvenli).
        await tx
          .update(notifications)
          .set({
            workspaceId: input.toWorkspaceId,
            boardId: ctx.board.id,
            payload: sql`CASE WHEN ${notifications.payload} ? 'workspaceId' THEN jsonb_set(${notifications.payload}, '{workspaceId}', to_jsonb(${input.toWorkspaceId}::text)) ELSE ${notifications.payload} END`,
          })
          .where(sql`${notifications.payload}->>'boardId' = ${ctx.board.id}`);
        await tx
          .update(shareLinks)
          .set({ workspaceId: input.toWorkspaceId })
          .where(
            inArray(
              shareLinks.cardId,
              tx.select({ id: cards.id }).from(cards).where(eq(cards.boardId, ctx.board.id)),
            ),
          );

        const movedPayload = {
          fromWorkspaceId: current.workspaceId,
          toWorkspaceId: input.toWorkspaceId,
          ...(source ? { fromWorkspaceName: source.name } : {}),
          toWorkspaceName: target.name,
          clientMutationId: ctx.clientMutationId,
        };
        await tx.insert(activityEvents).values({
          workspaceId: input.toWorkspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          type: 'board.moved_workspace',
          payload: movedPayload,
        });

        realtimeEventId = await insertRealtimeEvent(tx, {
          type: 'board.movedToWorkspace',
          workspaceId: input.toWorkspaceId,
          boardId: ctx.board.id,
          actorId: ctx.session.user.id,
          clientMutationId: ctx.clientMutationId,
          seq: updated.version,
          data: {
            boardId: ctx.board.id,
            fromWorkspaceId: current.workspaceId,
            toWorkspaceId: input.toWorkspaceId,
          },
        });

        await syncSearchDocumentsForScope(tx, { boardId: ctx.board.id });

        return { ...updated, role: ctx.board.role, changed: true as const };
      });
      maybeEnqueueRealtimePublish(ctx, realtimeEventId);
      return result;
    }),

  /**
   * DEM-192 — toggle the calling user's favorite state for a board. Favorites
   * are per-user (`board_favorites` junction table), so board *view* permission
   * is enough — `boardProcedure` already guarantees `viewer+`, and a viewer or
   * guest may favorite their own boards. This is intentionally a single
   * statement: no transaction, no `activity_events` / realtime event, and no
   * `version` bump (a favorite is private state, not a collaborative mutation).
   * Idempotent both ways — `onConflictDoNothing` on insert (the composite PK
   * makes a duplicate favorite a no-op) and a `delete` that no-ops when absent.
   */
  setFavorite: boardProcedure.input(setBoardFavoriteInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (input.favorited) {
      await ctx.db
        .insert(boardFavorites)
        .values({ boardId: ctx.board.id, userId })
        .onConflictDoNothing();
    } else {
      await ctx.db
        .delete(boardFavorites)
        .where(and(eq(boardFavorites.boardId, ctx.board.id), eq(boardFavorites.userId, userId)));
    }
    return { boardId: ctx.board.id, favorited: input.favorited };
  }),

  // Phase 2.5C (DEM-52) — board member management + token-based board invitations.
  members: boardMembersRouter,
  invitations: boardInvitationsRouter,
  accessRequests: boardAccessRequestsRouter,
  // Public API + Bot Erişimi (Task 7) — board-scoped API key / bot yönetimi.
  apiKeys: boardApiKeysRouter,
});
