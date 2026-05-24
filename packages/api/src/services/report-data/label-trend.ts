/**
 * `label-trend` micro-report — etiket başına haftalık kart sayısı zaman
 * serisi. Scope: B/W. Top 10 etiket.
 */
import { and, between, eq, inArray, sql } from '@pusula/db';
import { cardLabels, cards, labels, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, rangeOf } from './helpers';

export interface LabelTrendSeries {
  labelId: string;
  labelName: string;
  color: string;
  buckets: Array<{ weekStart: string; count: number }>;
}

export interface LabelTrendData {
  series: LabelTrendSeries[];
}

async function aggregateForBoards(
  ctx: Parameters<NonNullable<ScopeAdapter<LabelTrendData>['board']>>[0],
  boardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<LabelTrendData>['board']>>[2],
): Promise<LabelTrendData> {
  if (boardIds.length === 0) return { series: [] };
  const range = rangeOf(ctx, filters);
  const db = asDb(ctx);
  // Top 10 label by total card count
  const topRows = await db
    .select({
      labelId: labels.id,
      labelName: labels.name,
      color: labels.color,
      count: sql<number>`COUNT(${cardLabels.cardId})::int`,
    })
    .from(labels)
    .innerJoin(cardLabels, eq(cardLabels.labelId, labels.id))
    .innerJoin(cards, eq(cards.id, cardLabels.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(
      and(
        inArray(lists.boardId, boardIds),
        between(cards.createdAt, range.from, range.to),
      ),
    )
    .groupBy(labels.id, labels.name, labels.color)
    .orderBy(sql`COUNT(${cardLabels.cardId}) DESC`)
    .limit(10);
  if (topRows.length === 0) return { series: [] };
  const topLabelIds = topRows.map((r) => r.labelId);

  // Haftalık bucket
  const bucketRows = await db
    .select({
      labelId: cardLabels.labelId,
      weekStart: sql<string>`date_trunc('week', ${cards.createdAt})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(cardLabels)
    .innerJoin(cards, eq(cards.id, cardLabels.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(
      and(
        inArray(lists.boardId, boardIds),
        inArray(cardLabels.labelId, topLabelIds),
        between(cards.createdAt, range.from, range.to),
      ),
    )
    .groupBy(cardLabels.labelId, sql`date_trunc('week', ${cards.createdAt})`);

  const byLabel = new Map<string, Array<{ weekStart: string; count: number }>>();
  for (const r of bucketRows) {
    const arr = byLabel.get(r.labelId) ?? [];
    const date = typeof r.weekStart === 'string' ? new Date(r.weekStart) : r.weekStart;
    arr.push({ weekStart: date.toISOString().slice(0, 10), count: Number(r.count) });
    byLabel.set(r.labelId, arr);
  }

  return {
    series: topRows.map((t) => ({
      labelId: t.labelId,
      labelName: t.labelName,
      color: t.color,
      buckets: (byLabel.get(t.labelId) ?? []).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    })),
  };
}

export const labelTrendAdapter: ScopeAdapter<LabelTrendData> = {
  async board(ctx, scope, filters) {
    return aggregateForBoards(ctx, [scope.boardId], filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    return aggregateForBoards(ctx, accessibleBoardIds as string[], filters);
  },
};
