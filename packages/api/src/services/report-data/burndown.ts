/**
 * `burndown` micro-report — klasik sprint burndown (açık iş trendi zaman
 * içinde). Scope: B/W. Range başlangıcında open kart sayısı baseline;
 * her gün için "o güne kadar tamamlanan" çıkarılır → kalan açık eğrisi.
 * `ideal` çizgi: baseline → 0 (range sonunda) düz interpolasyon.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §16.5.
 */
import { and, eq, inArray, lte, sql } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface BurndownData {
  totalCards: number;
  buckets: BurndownPoint[];
}

async function buildBurndown(
  ctx: Parameters<NonNullable<ScopeAdapter<BurndownData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<BurndownData>['board']>>[2],
): Promise<BurndownData> {
  const range = rangeOf(ctx, filters);
  if (cardIds.length === 0) return { totalCards: 0, buckets: [] };

  const db = asDb(ctx);
  // Baseline: range.from anına kadar açık olan kart sayısı (created <= from
  // AND completed_at IS NULL OR completed_at > from).
  // V1 basitleştirme: cardIds set'i + her birinin status (completed/open).
  const cardRows = await db
    .select({ id: cards.id, createdAt: cards.createdAt, completed: cards.completed })
    .from(cards)
    .where(inArray(cards.id, cardIds));

  // Range için günlük completed event'leri (zaten aktivite).
  const completedEvents = await db
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

  const completedMap = new Map<string, number>();
  for (const r of completedEvents) {
    const date = typeof r.day === 'string' ? new Date(r.day) : r.day;
    completedMap.set(date.toISOString().slice(0, 10), Number(r.count));
  }

  // Baseline: from itibarıyla açık (created < from && (!completed_at ||
  // completed_at > from)). V1 yaklaşım: range içinde olan toplam kart sayısı.
  const totalCards = cardRows.length;
  const baseline = totalCards;

  // Günlük döngü
  const buckets: BurndownPoint[] = [];
  const cursor = new Date(range.from);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(range.to);
  endDay.setUTCHours(0, 0, 0, 0);
  const totalDays = Math.max(
    1,
    Math.round((endDay.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000)),
  );
  let remaining = baseline;
  let dayIndex = 0;
  while (cursor.getTime() <= endDay.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    const completed = completedMap.get(key) ?? 0;
    remaining = Math.max(0, remaining - completed);
    const ideal = Math.max(0, baseline - (baseline * dayIndex) / totalDays);
    buckets.push({
      date: `${key}T00:00:00.000Z`,
      remaining,
      ideal: Math.round(ideal * 10) / 10,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    dayIndex += 1;
  }

  return { totalCards, buckets };
}

export const burndownAdapter: ScopeAdapter<BurndownData> = {
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return buildBurndown(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) {
      return { totalCards: 0, buckets: [] };
    }
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) {
      return { totalCards: 0, buckets: [] };
    }
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.listId, listRows.map((r) => r.id)));
    return buildBurndown(ctx, cardRows.map((r) => r.id), filters);
  },
};

void lte; // helper imported for future "as of" baseline calc; suppress unused.
