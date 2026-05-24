/**
 * `member-workload` micro-report — üye başına atanmış kart sayısı (açık/
 * tamamlanmış/geciken breakdown). Scope: L/B/W.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { cardMembers, cards, users } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardStatusWhere } from './helpers';

export interface MemberWorkloadItem {
  userId: string;
  name: string | null;
  open: number;
  completed: number;
  overdue: number;
  total: number;
}

export interface MemberWorkloadData {
  items: MemberWorkloadItem[];
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<MemberWorkloadData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<MemberWorkloadData>['board']>>[2],
): Promise<MemberWorkloadData> {
  if (cardIds.length === 0) return { items: [] };
  const db = asDb(ctx);
  const rows = await db
    .select({
      userId: cardMembers.userId,
      name: users.name,
      open: sql<number>`COUNT(*) FILTER (WHERE ${cards.completed} = false AND ${cards.archivedAt} IS NULL)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${cards.completed} = true)::int`,
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${cards.completed} = false AND ${cards.dueAt} IS NOT NULL AND ${cards.dueAt} < NOW())::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(cardMembers)
    .innerJoin(cards, eq(cardMembers.cardId, cards.id))
    .innerJoin(users, eq(cardMembers.userId, users.id))
    .where(and(inArray(cards.id, cardIds), ...cardStatusWhere(filters)))
    .groupBy(cardMembers.userId, users.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(50);
  return {
    items: rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      open: Number(r.open),
      completed: Number(r.completed),
      overdue: Number(r.overdue),
      total: Number(r.total),
    })),
  };
}

export const memberWorkloadAdapter: ScopeAdapter<MemberWorkloadData> = {
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
    if (accessibleBoardIds.length === 0) return { items: [] };
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) return { items: [] };
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
};
