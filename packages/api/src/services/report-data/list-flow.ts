/**
 * `list-flow` micro-report — Sankey benzeri kaynak→hedef liste akışı
 * (card.moved event'lerinden). Scope: B/W. V1: top 10 akış tablo.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface FlowEdge {
  fromListId: string | null;
  fromListName: string | null;
  toListId: string;
  toListName: string;
  count: number;
}

export interface ListFlowData {
  edges: FlowEdge[];
  totalMoves: number;
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<ListFlowData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<ListFlowData>['board']>>[2],
): Promise<ListFlowData> {
  if (cardIds.length === 0) return { edges: [], totalMoves: 0 };
  const range = rangeOf(ctx, filters);
  const db = asDb(ctx);
  // V1 yaklaşım: payload->>'fromListId' ve payload->>'toListId' (Pusula
  // realtime-event payload shape'i).
  const rows = await db
    .select({
      fromListId: sql<string | null>`${activityEvents.payload}->>'fromListId'`,
      toListId: sql<string | null>`${activityEvents.payload}->>'toListId'`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.type, 'card.moved'),
        inArray(activityEvents.cardId, cardIds),
        ...activityWhere(filters, range),
      ),
    )
    .groupBy(
      sql`${activityEvents.payload}->>'fromListId'`,
      sql`${activityEvents.payload}->>'toListId'`,
    )
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  if (rows.length === 0) return { edges: [], totalMoves: 0 };
  // List name lookup
  const allListIds = new Set<string>();
  for (const r of rows) {
    if (r.fromListId) allListIds.add(r.fromListId);
    if (r.toListId) allListIds.add(r.toListId);
  }
  const listRows = await db
    .select({ id: lists.id, name: lists.title })
    .from(lists)
    .where(inArray(lists.id, Array.from(allListIds)));
  const nameMap = new Map(listRows.map((l) => [l.id, l.name]));
  const edges: FlowEdge[] = rows
    .filter((r) => r.toListId)
    .map((r) => ({
      fromListId: r.fromListId,
      fromListName: r.fromListId ? nameMap.get(r.fromListId) ?? null : null,
      toListId: r.toListId!,
      toListName: nameMap.get(r.toListId!) ?? r.toListId!,
      count: Number(r.count),
    }));
  return { edges, totalMoves: edges.reduce((s, e) => s + e.count, 0) };
}

export const listFlowAdapter: ScopeAdapter<ListFlowData> = {
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { edges: [], totalMoves: 0 };
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: lists.id })
      .from(lists)
      .where(inArray(lists.boardId, accessibleBoardIds as string[]));
    if (listRows.length === 0) return { edges: [], totalMoves: 0 };
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
};
