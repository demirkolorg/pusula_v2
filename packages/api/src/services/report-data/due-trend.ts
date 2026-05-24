/**
 * `due-trend` micro-report — gelecek 30 gün için günlük vade sayısı.
 * Scope: B/W. Yığılma noktalarını tespit eder.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from '@pusula/db';
import { cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface DueTrendBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DueTrendData {
  totalUpcoming: number;
  buckets: DueTrendBucket[];
}

const DAYS_AHEAD = 30;

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<DueTrendData>['board']>>[0],
  cardIds: string[],
): Promise<DueTrendData> {
  if (cardIds.length === 0) return { totalUpcoming: 0, buckets: emptyBuckets(ctx.now()) };
  const db = asDb(ctx);
  const now = ctx.now();
  const cutoff = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${cards.dueAt})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(cards)
    .where(
      and(
        inArray(cards.id, cardIds),
        eq(cards.completed, false),
        isNull(cards.archivedAt),
        isNotNull(cards.dueAt),
        sql`${cards.dueAt} >= ${now}::timestamptz`,
        sql`${cards.dueAt} <= ${cutoff}::timestamptz`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${cards.dueAt})`);

  const map = new Map<string, number>();
  for (const r of rows) {
    const date = typeof r.day === 'string' ? new Date(r.day) : r.day;
    map.set(date.toISOString().slice(0, 10), Number(r.count));
  }
  const buckets = emptyBuckets(now).map((b) => ({
    ...b,
    count: map.get(b.date) ?? 0,
  }));
  return {
    totalUpcoming: buckets.reduce((s, b) => s + b.count, 0),
    buckets,
  };
}

function emptyBuckets(now: Date): DueTrendBucket[] {
  const buckets: DueTrendBucket[] = [];
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    buckets.push({ date: cursor.toISOString().slice(0, 10), count: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

export const dueTrendAdapter: ScopeAdapter<DueTrendData> = {
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return aggregate(ctx, []);
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) return aggregate(ctx, []);
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id));
  },
};
