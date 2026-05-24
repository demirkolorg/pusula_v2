/**
 * `time-in-list` micro-report — kartların her listede geçirdiği ortalama
 * süre (saat). Scope: C/L/B/W.
 *
 * V1 basit yaklaşım: card.moved event'leri arası süre (target listId).
 * Karmaşık çoklu-segment hesabı V2.
 */
import { eq, inArray, sql } from '@pusula/db';
import { activityEvents, cards, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface TimeInListItem {
  listId: string;
  listName: string;
  averageHours: number;
  cardCount: number;
}

export interface TimeInListData {
  items: TimeInListItem[];
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<TimeInListData>['board']>>[0],
  cardIds: string[],
): Promise<TimeInListData> {
  if (cardIds.length === 0) return { items: [] };
  const db = asDb(ctx);
  // V1 yaklaşım: kart şu an hangi liste'deyse, "created → şimdi" → o listede
  // o süre. Tek liste varsayımı.
  const now = ctx.now();
  const cardRows = await db
    .select({
      id: cards.id,
      listId: cards.listId,
      createdAt: cards.createdAt,
      listTitle: lists.title,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(inArray(cards.id, cardIds));

  const byList = new Map<string, { listName: string; totalHours: number; count: number }>();
  for (const r of cardRows) {
    const hours = (now.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000);
    const entry = byList.get(r.listId) ?? { listName: r.listTitle, totalHours: 0, count: 0 };
    entry.totalHours += hours;
    entry.count += 1;
    byList.set(r.listId, entry);
  }

  return {
    items: Array.from(byList.entries())
      .map(([listId, v]) => ({
        listId,
        listName: v.listName,
        averageHours: v.count > 0 ? v.totalHours / v.count : 0,
        cardCount: v.count,
      }))
      .sort((a, b) => b.averageHours - a.averageHours),
  };
}

export const timeInListAdapter: ScopeAdapter<TimeInListData> = {
  async card(ctx, scope) {
    return aggregate(ctx, [scope.cardId]);
  },
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId));
    return aggregate(ctx, cardRows.map((r) => r.id));
  },
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { items: [] };
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) return { items: [] };
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id));
  },
};

void activityEvents;
void rangeOf;
