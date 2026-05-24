/**
 * `activity-heatmap` micro-report — gün-saat ısı matrisi. Scope: L/B/W.
 * `activity_events.created_at`'i (gün-of-week, saat) hücrelerine grupla.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface ActivityHeatmapCell {
  dayOfWeek: number; // 0..6 (Sun..Sat)
  hour: number; // 0..23
  count: number;
}

export interface ActivityHeatmapData {
  cells: ActivityHeatmapCell[];
  maxCount: number;
  totalCount: number;
}

function rowsToData(
  rows: Array<{ dow: number; hour: number; count: number }>,
): ActivityHeatmapData {
  const cells: ActivityHeatmapCell[] = rows.map((r) => ({
    dayOfWeek: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.count),
  }));
  const totalCount = cells.reduce((s, c) => s + c.count, 0);
  const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 0);
  return { cells, maxCount, totalCount };
}

async function heatmapFor(
  ctx: Parameters<NonNullable<ScopeAdapter<ActivityHeatmapData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<ActivityHeatmapData>['board']>>[2],
  workspaceFilter?: string,
): Promise<ActivityHeatmapData> {
  const range = rangeOf(ctx, filters);
  if (!workspaceFilter && cardIds.length === 0) return rowsToData([]);

  const baseConditions = [...activityWhere(filters, range)];
  if (cardIds.length > 0) baseConditions.push(inArray(activityEvents.cardId, cardIds));
  if (workspaceFilter) baseConditions.push(eq(activityEvents.workspaceId, workspaceFilter));

  const rows = await asDb(ctx)
    .select({
      dow: sql<number>`EXTRACT(DOW FROM ${activityEvents.createdAt})::int`,
      hour: sql<number>`EXTRACT(HOUR FROM ${activityEvents.createdAt})::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(activityEvents)
    .where(and(...baseConditions))
    .groupBy(
      sql`EXTRACT(DOW FROM ${activityEvents.createdAt})`,
      sql`EXTRACT(HOUR FROM ${activityEvents.createdAt})`,
    );
  return rowsToData(rows);
}

export const activityHeatmapAdapter: ScopeAdapter<ActivityHeatmapData> = {
  async list(ctx, scope, filters) {
    const db = asDb(ctx);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId));
    return heatmapFor(ctx, cardRows.map((r) => r.id), filters);
  },
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return heatmapFor(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return rowsToData([]);
    return heatmapFor(ctx, [], filters, scope.workspaceId);
  },
};
