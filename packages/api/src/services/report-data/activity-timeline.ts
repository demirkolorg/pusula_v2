/**
 * `activity-timeline` micro-report — `activity_events` zaman skalası.
 * Scope: C/L/B/W. Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.5.
 */
import { and, desc, eq, inArray } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface ActivityTimelineData {
  totalCount: number;
  events: Array<{
    id: string;
    type: string;
    actorId: string | null;
    createdAt: string;
    cardId: string | null;
    boardId: string | null;
  }>;
}

const MAX_TIMELINE_ROWS = 200;

function rowsToData(
  rows: Array<{
    id: string;
    type: string;
    actorId: string | null;
    createdAt: Date;
    cardId: string | null;
    boardId: string | null;
  }>,
): ActivityTimelineData {
  return {
    totalCount: rows.length,
    events: rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorId: r.actorId,
      createdAt: r.createdAt.toISOString(),
      cardId: r.cardId,
      boardId: r.boardId,
    })),
  };
}

export const activityTimelineAdapter: ScopeAdapter<ActivityTimelineData> = {
  async card(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const rows = await asDb(ctx)
      .select({
        id: activityEvents.id,
        type: activityEvents.type,
        actorId: activityEvents.actorId,
        createdAt: activityEvents.createdAt,
        cardId: activityEvents.cardId,
        boardId: activityEvents.boardId,
      })
      .from(activityEvents)
      .where(and(eq(activityEvents.cardId, scope.cardId), ...activityWhere(filters, range)))
      .orderBy(desc(activityEvents.createdAt))
      .limit(MAX_TIMELINE_ROWS);
    return rowsToData(rows);
  },

  async list(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const db = asDb(ctx);
    const listCardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    if (listCardRows.length === 0) {
      return { totalCount: 0, events: [] };
    }
    const rows = await db
      .select({
        id: activityEvents.id,
        type: activityEvents.type,
        actorId: activityEvents.actorId,
        createdAt: activityEvents.createdAt,
        cardId: activityEvents.cardId,
        boardId: activityEvents.boardId,
      })
      .from(activityEvents)
      .where(
        and(
          inArray(
            activityEvents.cardId,
            listCardRows.map((r) => r.id),
          ),
          ...activityWhere(filters, range),
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(MAX_TIMELINE_ROWS);
    return rowsToData(rows);
  },

  async board(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    if (cardIds.length === 0) {
      return { totalCount: 0, events: [] };
    }
    const rows = await asDb(ctx)
      .select({
        id: activityEvents.id,
        type: activityEvents.type,
        actorId: activityEvents.actorId,
        createdAt: activityEvents.createdAt,
        cardId: activityEvents.cardId,
        boardId: activityEvents.boardId,
      })
      .from(activityEvents)
      .where(and(inArray(activityEvents.cardId, cardIds), ...activityWhere(filters, range)))
      .orderBy(desc(activityEvents.createdAt))
      .limit(MAX_TIMELINE_ROWS);
    return rowsToData(rows);
  },

  async workspace(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) {
      return { totalCount: 0, events: [] };
    }
    const rows = await asDb(ctx)
      .select({
        id: activityEvents.id,
        type: activityEvents.type,
        actorId: activityEvents.actorId,
        createdAt: activityEvents.createdAt,
        cardId: activityEvents.cardId,
        boardId: activityEvents.boardId,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, scope.workspaceId),
          inArray(activityEvents.boardId, accessibleBoardIds as string[]),
          ...activityWhere(filters, range),
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(MAX_TIMELINE_ROWS);
    return rowsToData(rows);
  },
};
