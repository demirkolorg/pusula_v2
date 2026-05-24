/**
 * `completion-rate` micro-report — günlük tamamlanan kart sayısı zaman
 * serisi. Scope: L/B/W. `activity_events.type = 'card.completed'`
 * event'lerini günlük gruplar.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §16.5;
 * docs/domain/09-raporlama-kurallari.md §9.6.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface CompletionRateBucket {
  /** Gün başlangıcı ISO (`YYYY-MM-DDT00:00:00Z`). */
  date: string;
  count: number;
}

export interface CompletionRateData {
  totalCompleted: number;
  averagePerDay: number;
  buckets: CompletionRateBucket[];
}

function rowsToData(
  rows: Array<{ day: Date | string; count: number }>,
  from: Date,
  to: Date,
): CompletionRateData {
  // Gün-by-gün dolu seri — eksik günlere 0 koy (chart sıçramasın).
  const map = new Map<string, number>();
  for (const r of rows) {
    const date = typeof r.day === 'string' ? new Date(r.day) : r.day;
    const key = date.toISOString().slice(0, 10);
    map.set(key, Number(r.count));
  }
  const buckets: CompletionRateBucket[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= endDay.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    buckets.push({ date: `${key}T00:00:00.000Z`, count: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const totalCompleted = buckets.reduce((sum, b) => sum + b.count, 0);
  const averagePerDay = buckets.length > 0 ? totalCompleted / buckets.length : 0;
  return { totalCompleted, averagePerDay, buckets };
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<CompletionRateData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<CompletionRateData>['board']>>[2],
): Promise<CompletionRateData> {
  const range = rangeOf(ctx, filters);
  if (cardIds.length === 0) {
    return rowsToData([], range.from, range.to);
  }
  const rows = await asDb(ctx)
    .select({
      day: sql<string>`date_trunc('day', ${activityEvents.createdAt})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.type, 'card.completed'),
        inArray(activityEvents.cardId, cardIds),
        ...activityWhere(filters, range),
      ),
    )
    .groupBy(sql`date_trunc('day', ${activityEvents.createdAt})`);
  return rowsToData(rows, range.from, range.to);
}

export const completionRateAdapter: ScopeAdapter<CompletionRateData> = {
  async list(ctx, scope, filters) {
    const db = asDb(ctx);
    const listCards = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return aggregate(ctx, listCards.map((r) => r.id), filters);
  },

  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds, filters);
  },

  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    const range = rangeOf(ctx, filters);
    if (accessibleBoardIds.length === 0) {
      return rowsToData([], range.from, range.to);
    }
    const rows = await asDb(ctx)
      .select({
        day: sql<string>`date_trunc('day', ${activityEvents.createdAt})`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.type, 'card.completed'),
          eq(activityEvents.workspaceId, scope.workspaceId),
          inArray(activityEvents.boardId, accessibleBoardIds as string[]),
          ...activityWhere(filters, range),
        ),
      )
      .groupBy(sql`date_trunc('day', ${activityEvents.createdAt})`);
    return rowsToData(rows, range.from, range.to);
  },
};
