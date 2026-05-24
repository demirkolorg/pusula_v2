/**
 * `cycle-time` micro-report — kart oluşturma → tamamlama süresi (saat).
 * Scope: L/B/W. Histogram + persentil (P50/P75/P95).
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface CycleTimeData {
  totalSamples: number;
  p50Hours: number | null;
  p75Hours: number | null;
  p95Hours: number | null;
  averageHours: number | null;
  buckets: Array<{ label: string; count: number }>;
}

const HOUR_BUCKETS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '0-4h', min: 0, max: 4 },
  { label: '4-24h', min: 4, max: 24 },
  { label: '1-3d', min: 24, max: 72 },
  { label: '3-7d', min: 72, max: 168 },
  { label: '1-2w', min: 168, max: 336 },
  { label: '2w+', min: 336, max: Number.MAX_SAFE_INTEGER },
];

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<CycleTimeData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<CycleTimeData>['board']>>[2],
): Promise<CycleTimeData> {
  const empty: CycleTimeData = {
    totalSamples: 0,
    p50Hours: null,
    p75Hours: null,
    p95Hours: null,
    averageHours: null,
    buckets: HOUR_BUCKETS.map((b) => ({ label: b.label, count: 0 })),
  };
  if (cardIds.length === 0) return empty;
  const range = rangeOf(ctx, filters);
  const db = asDb(ctx);
  // Tamamlanan kartlar + completion event time'ları
  const completedRows = await db
    .select({
      cardId: activityEvents.cardId,
      completedAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.type, 'card.completed'),
        inArray(activityEvents.cardId, cardIds),
        ...activityWhere(filters, range),
      ),
    );
  if (completedRows.length === 0) return empty;

  // Kart oluşturulma zamanı join
  const completedIds = completedRows
    .map((r) => r.cardId)
    .filter((id): id is string => Boolean(id));
  const cardRows = await db
    .select({ id: cards.id, createdAt: cards.createdAt })
    .from(cards)
    .where(inArray(cards.id, completedIds));
  const createdMap = new Map<string, Date>();
  for (const c of cardRows) createdMap.set(c.id, c.createdAt);

  const hours: number[] = [];
  for (const r of completedRows) {
    if (!r.cardId) continue;
    const created = createdMap.get(r.cardId);
    if (!created) continue;
    const ms = r.completedAt.getTime() - created.getTime();
    if (ms < 0) continue;
    hours.push(ms / (60 * 60 * 1000));
  }
  if (hours.length === 0) return empty;
  hours.sort((a, b) => a - b);
  const buckets = HOUR_BUCKETS.map((b) => ({
    label: b.label,
    count: hours.filter((h) => h >= b.min && h < b.max).length,
  }));
  const avg = hours.reduce((s, h) => s + h, 0) / hours.length;
  return {
    totalSamples: hours.length,
    p50Hours: percentile(hours, 0.5),
    p75Hours: percentile(hours, 0.75),
    p95Hours: percentile(hours, 0.95),
    averageHours: avg,
    buckets,
  };
}

export const cycleTimeAdapter: ScopeAdapter<CycleTimeData> = {
  async list(ctx, scope, filters) {
    const db = asDb(ctx);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return aggregate(ctx, [], filters);
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) return aggregate(ctx, [], filters);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
};
