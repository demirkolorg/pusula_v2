/**
 * `list-balance` micro-report — liste büyüklüğü standart sapma. Scope: B/W.
 */
import { and, eq, inArray, isNull, sql } from '@pusula/db';
import { cards, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb } from './helpers';

export interface ListBalanceItem {
  listId: string;
  listName: string;
  cardCount: number;
}

export interface ListBalanceData {
  items: ListBalanceItem[];
  average: number;
  standardDeviation: number;
  balanced: boolean; // stddev < average * 0.5 → dengeli
}

function calcStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

async function aggregateForBoards(
  ctx: Parameters<NonNullable<ScopeAdapter<ListBalanceData>['board']>>[0],
  boardIds: string[],
): Promise<ListBalanceData> {
  if (boardIds.length === 0) {
    return { items: [], average: 0, standardDeviation: 0, balanced: true };
  }
  const db = asDb(ctx);
  const rows = await db
    .select({
      listId: lists.id,
      listName: lists.title,
      cardCount: sql<number>`COUNT(${cards.id})::int`,
    })
    .from(lists)
    .leftJoin(
      cards,
      and(eq(cards.listId, lists.id), eq(cards.completed, false), isNull(cards.archivedAt)),
    )
    .where(inArray(lists.boardId, boardIds))
    .groupBy(lists.id, lists.title)
    .orderBy(sql`COUNT(${cards.id}) DESC`);

  const items = rows.map((r) => ({
    listId: r.listId,
    listName: r.listName,
    cardCount: Number(r.cardCount),
  }));
  const counts = items.map((i) => i.cardCount);
  const average = counts.length > 0 ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
  const standardDeviation = Math.round(calcStdDev(counts, average) * 10) / 10;
  const balanced = average === 0 ? true : standardDeviation < average * 0.5;
  return {
    items,
    average: Math.round(average * 10) / 10,
    standardDeviation,
    balanced,
  };
}

export const listBalanceAdapter: ScopeAdapter<ListBalanceData> = {
  async board(ctx, scope) {
    return aggregateForBoards(ctx, [scope.boardId]);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    return aggregateForBoards(ctx, accessibleBoardIds as string[]);
  },
};
