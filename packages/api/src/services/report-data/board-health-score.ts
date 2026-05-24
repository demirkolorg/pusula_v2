/**
 * `board-health-score` micro-report — 4-5 alt metrik composite skor.
 * Scope: B/W.
 *
 * V1 formül:
 *   100 * (1
 *     - normalize(avg_age_days, 60) * 0.30
 *     - normalize(wip_overload, 50) * 0.30
 *     - normalize(stale_pct, 100) * 0.20
 *     - normalize(overdue_pct, 100) * 0.20
 *   )
 *
 * Negatif değerler 0'a clamp; 100'ün üstünde değer olmaz.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from '@pusula/db';
import { cards, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface BoardHealthScoreData {
  score: number; // 0-100
  components: {
    avgAgeDays: number;
    wipOverload: number;
    stalePercentage: number;
    overduePercentage: number;
  };
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<BoardHealthScoreData>['board']>>[0],
  cardIds: string[],
  listIds: string[],
): Promise<BoardHealthScoreData> {
  const empty: BoardHealthScoreData = {
    score: 100,
    components: { avgAgeDays: 0, wipOverload: 0, stalePercentage: 0, overduePercentage: 0 },
  };
  if (cardIds.length === 0) return empty;
  const db = asDb(ctx);
  const now = ctx.now();

  // Open kartların ortalama yaşı (gün)
  const openRows = await db
    .select({
      updatedAt: cards.updatedAt,
      completed: cards.completed,
      dueAt: cards.dueAt,
    })
    .from(cards)
    .where(and(inArray(cards.id, cardIds), isNull(cards.archivedAt)));
  const openCards = openRows.filter((r) => !r.completed);
  const totalCount = openRows.length;
  if (openCards.length === 0) return empty;
  const ageDays = openCards.map(
    (r) => (now.getTime() - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  const avgAgeDays = ageDays.reduce((s, v) => s + v, 0) / ageDays.length;
  const staleCount = ageDays.filter((d) => d > 30).length;
  const stalePercentage = (staleCount / openCards.length) * 100;
  const overdueRows = openCards.filter(
    (r) => r.dueAt && r.dueAt.getTime() < now.getTime(),
  );
  const overduePercentage = (overdueRows.length / openCards.length) * 100;

  // Liste başına ortalama kart sayısı (WIP göstergesi)
  let wipOverload = 0;
  if (listIds.length > 0) {
    const wipRows = await db
      .select({
        listId: cards.listId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(cards)
      .where(
        and(inArray(cards.listId, listIds), eq(cards.completed, false), isNull(cards.archivedAt)),
      )
      .groupBy(cards.listId);
    const counts = wipRows.map((r) => Number(r.count));
    if (counts.length > 0) {
      const maxList = Math.max(...counts);
      wipOverload = maxList; // V1: en yoğun listenin kart sayısı
    }
  }

  // Skor
  const norm = (v: number, max: number): number => Math.min(1, Math.max(0, v / max));
  const score = Math.max(
    0,
    Math.min(
      100,
      100 *
        (1 -
          norm(avgAgeDays, 60) * 0.3 -
          norm(wipOverload, 50) * 0.3 -
          norm(stalePercentage, 100) * 0.2 -
          norm(overduePercentage, 100) * 0.2),
    ),
  );

  return {
    score: Math.round(score),
    components: {
      avgAgeDays: Math.round(avgAgeDays * 10) / 10,
      wipOverload,
      stalePercentage: Math.round(stalePercentage * 10) / 10,
      overduePercentage: Math.round(overduePercentage * 10) / 10,
    },
  };
  void isNotNull;
  void totalCount;
}

export const boardHealthScoreAdapter: ScopeAdapter<BoardHealthScoreData> = {
  async board(ctx, scope) {
    const accessibleListIds = await ctx.permissions.accessibleListsInBoard(scope.boardId);
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds, accessibleListIds as string[]);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) {
      return aggregate(ctx, [], []);
    }
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: lists.id })
      .from(lists)
      .where(inArray(lists.boardId, accessibleBoardIds as string[]));
    if (listRows.length === 0) return aggregate(ctx, [], []);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id), listRows.map((r) => r.id));
  },
};
