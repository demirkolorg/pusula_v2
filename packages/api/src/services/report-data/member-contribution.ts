/**
 * `member-contribution` micro-report — `activity_events.actor_id` ile
 * üye bazlı katkı dağılımı (count + type breakdown). Scope: L/B/W.
 */
import { and, between, count, eq, inArray, isNotNull, sql, type Database } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface MemberContributionData {
  total: number;
  contributors: Array<{
    userId: string;
    count: number;
  }>;
}

async function aggregateByActor(
  db: Database,
  cardIds: string[],
  range: { from: Date; to: Date },
): Promise<MemberContributionData> {
  if (cardIds.length === 0) return { total: 0, contributors: [] };
  const rows = await db
    .select({
      actorId: activityEvents.actorId,
      count: count(),
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.cardId, cardIds),
        between(activityEvents.createdAt, range.from, range.to),
        isNotNull(activityEvents.actorId),
      ),
    )
    .groupBy(activityEvents.actorId)
    .orderBy(sql`count(*) desc`);
  const contributors = rows.flatMap((r) =>
    r.actorId === null ? [] : [{ userId: r.actorId, count: Number(r.count) }],
  );
  return {
    total: contributors.reduce((acc, c) => acc + c.count, 0),
    contributors,
  };
}

export const memberContributionAdapter: ScopeAdapter<MemberContributionData> = {
  async list(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return aggregateByActor(
      db,
      cardRows.map((r) => r.id),
      range,
    );
  },
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregateByActor(asDb(ctx), cardIds, rangeOf(ctx, filters));
  },
  async workspace(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const db = asDb(ctx);
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { total: 0, contributors: [] };
    const rows = await db
      .select({
        actorId: activityEvents.actorId,
        count: count(),
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, scope.workspaceId),
          inArray(activityEvents.boardId, accessibleBoardIds as string[]),
          between(activityEvents.createdAt, range.from, range.to),
          isNotNull(activityEvents.actorId),
        ),
      )
      .groupBy(activityEvents.actorId)
      .orderBy(sql`count(*) desc`);
    const contributors = rows.flatMap((r) =>
      r.actorId === null ? [] : [{ userId: r.actorId, count: Number(r.count) }],
    );
    return {
      total: contributors.reduce((acc, c) => acc + c.count, 0),
      contributors,
    };
  },
};
