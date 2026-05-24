/**
 * `activity-breakdown` micro-report — olay tipi histogramı (top 10 + "Diğer").
 * Scope: C/L/B/W.
 */
import { and, desc, eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface ActivityBreakdownItem {
  type: string;
  count: number;
}

export interface ActivityBreakdownData {
  items: ActivityBreakdownItem[];
  otherCount: number;
  totalCount: number;
}

const TOP_N = 10;

function rowsToData(rows: Array<{ type: string; count: number }>): ActivityBreakdownData {
  const sorted = rows
    .map((r) => ({ type: r.type, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  return {
    items: top,
    otherCount: rest.reduce((s, r) => s + r.count, 0),
    totalCount: sorted.reduce((s, r) => s + r.count, 0),
  };
}

async function breakdownFor(
  ctx: Parameters<NonNullable<ScopeAdapter<ActivityBreakdownData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<ActivityBreakdownData>['board']>>[2],
  workspaceFilter?: string,
): Promise<ActivityBreakdownData> {
  const range = rangeOf(ctx, filters);
  if (!workspaceFilter && cardIds.length === 0) return rowsToData([]);

  const baseConditions = [...activityWhere(filters, range)];
  if (cardIds.length > 0) baseConditions.push(inArray(activityEvents.cardId, cardIds));
  if (workspaceFilter) baseConditions.push(eq(activityEvents.workspaceId, workspaceFilter));

  const rows = await asDb(ctx)
    .select({
      type: activityEvents.type,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(activityEvents)
    .where(and(...baseConditions))
    .groupBy(activityEvents.type)
    .orderBy(desc(sql<number>`COUNT(*)`));
  return rowsToData(rows);
}

export const activityBreakdownAdapter: ScopeAdapter<ActivityBreakdownData> = {
  async card(ctx, scope, filters) {
    return breakdownFor(ctx, [scope.cardId], filters);
  },
  async list(ctx, scope, filters) {
    const db = asDb(ctx);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId));
    return breakdownFor(ctx, cardRows.map((r) => r.id), filters);
  },
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return breakdownFor(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return rowsToData([]);
    return breakdownFor(ctx, [], filters, scope.workspaceId);
  },
};
