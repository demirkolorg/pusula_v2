/**
 * `recent-changes` micro-report — son 7g top N event mini timeline.
 * Scope: C/L/B/W. activity-timeline'a benzer ama kısa (max 10) + son 7g.
 */
import { and, desc, eq, gte, inArray } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface RecentChange {
  id: string;
  type: string;
  actorId: string | null;
  createdAt: string;
  cardId: string | null;
}

export interface RecentChangesData {
  events: RecentChange[];
}

const MAX_EVENTS = 10;
const WINDOW_DAYS = 7;

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<RecentChangesData>['board']>>[0],
  cardIds: string[],
  workspaceFilter?: string,
): Promise<RecentChangesData> {
  if (!workspaceFilter && cardIds.length === 0) return { events: [] };
  const since = new Date(ctx.now().getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const baseConditions = [gte(activityEvents.createdAt, since)];
  if (cardIds.length > 0) baseConditions.push(inArray(activityEvents.cardId, cardIds));
  if (workspaceFilter) baseConditions.push(eq(activityEvents.workspaceId, workspaceFilter));
  const rows = await asDb(ctx)
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
      cardId: activityEvents.cardId,
    })
    .from(activityEvents)
    .where(and(...baseConditions))
    .orderBy(desc(activityEvents.createdAt))
    .limit(MAX_EVENTS);
  return {
    events: rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorId: r.actorId,
      createdAt: r.createdAt.toISOString(),
      cardId: r.cardId,
    })),
  };
}

export const recentChangesAdapter: ScopeAdapter<RecentChangesData> = {
  async card(ctx, scope) {
    return aggregate(ctx, [scope.cardId]);
  },
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId));
    return aggregate(ctx, cardRows.map((r) => r.id));
  },
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { events: [] };
    return aggregate(ctx, [], scope.workspaceId);
  },
};
