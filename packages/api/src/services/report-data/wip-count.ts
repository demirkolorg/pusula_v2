/**
 * `wip-count` micro-report — liste başına aktif (open) kart sayısı.
 * Scope: B/W. WIP limit göstergesi (V1: limit yok, V2: lists.wipLimit).
 */
import { and, eq, inArray, isNull, sql } from '@pusula/db';
import { cards, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb } from './helpers';

export interface WipCountItem {
  listId: string;
  listName: string;
  openCount: number;
}

export interface WipCountData {
  items: WipCountItem[];
  totalOpen: number;
}

async function aggregateForLists(
  ctx: Parameters<NonNullable<ScopeAdapter<WipCountData>['board']>>[0],
  listIds: string[],
): Promise<WipCountData> {
  if (listIds.length === 0) return { items: [], totalOpen: 0 };
  const db = asDb(ctx);
  const rows = await db
    .select({
      listId: lists.id,
      listName: lists.title,
      openCount: sql<number>`COUNT(${cards.id})::int`,
    })
    .from(lists)
    .leftJoin(
      cards,
      and(eq(cards.listId, lists.id), eq(cards.completed, false), isNull(cards.archivedAt)),
    )
    .where(inArray(lists.id, listIds))
    .groupBy(lists.id, lists.title)
    .orderBy(sql`COUNT(${cards.id}) DESC`);

  const items = rows.map((r) => ({
    listId: r.listId,
    listName: r.listName,
    openCount: Number(r.openCount),
  }));
  return { items, totalOpen: items.reduce((s, r) => s + r.openCount, 0) };
}

export const wipCountAdapter: ScopeAdapter<WipCountData> = {
  async board(ctx, scope) {
    const accessibleListIds = await ctx.permissions.accessibleListsInBoard(scope.boardId);
    return aggregateForLists(ctx, accessibleListIds as string[]);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { items: [], totalOpen: 0 };
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: lists.id })
      .from(lists)
      .where(inArray(lists.boardId, accessibleBoardIds as string[]));
    return aggregateForLists(ctx, listRows.map((r) => r.id));
  },
};
