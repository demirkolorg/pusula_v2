/**
 * `comment-volume` micro-report — günlük yorum sayısı zaman serisi.
 * Scope: C/L/B/W.
 */
import { and, between, eq, inArray, sql } from '@pusula/db';
import { cards, comments } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface CommentVolumeData {
  totalCount: number;
  buckets: Array<{ date: string; count: number }>;
}

function buildBuckets(
  rows: Array<{ day: Date | string; count: number }>,
  from: Date,
  to: Date,
): CommentVolumeData['buckets'] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const date = typeof r.day === 'string' ? new Date(r.day) : r.day;
    map.set(date.toISOString().slice(0, 10), Number(r.count));
  }
  const buckets: CommentVolumeData['buckets'] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= endDay.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    buckets.push({ date: `${key}T00:00:00.000Z`, count: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<CommentVolumeData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<CommentVolumeData>['board']>>[2],
): Promise<CommentVolumeData> {
  const range = rangeOf(ctx, filters);
  if (cardIds.length === 0) {
    return { totalCount: 0, buckets: buildBuckets([], range.from, range.to) };
  }
  const rows = await asDb(ctx)
    .select({
      day: sql<string>`date_trunc('day', ${comments.createdAt})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(comments)
    .where(
      and(
        inArray(comments.cardId, cardIds),
        between(comments.createdAt, range.from, range.to),
      ),
    )
    .groupBy(sql`date_trunc('day', ${comments.createdAt})`);
  const buckets = buildBuckets(rows, range.from, range.to);
  return {
    totalCount: buckets.reduce((s, b) => s + b.count, 0),
    buckets,
  };
}

export const commentVolumeAdapter: ScopeAdapter<CommentVolumeData> = {
  async card(ctx, scope, filters) {
    return aggregate(ctx, [scope.cardId], filters);
  },
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
