/**
 * `member-presence` micro-report — üye başına son aktivite + 30g ortalama
 * günlük etkinlik + status (aktif/inaktif). Scope: B/W.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { activityEvents, users, workspaceMembers } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, rangeOf } from './helpers';

export type MemberPresenceStatus = 'active' | 'inactive' | 'never';

export interface MemberPresenceItem {
  userId: string;
  name: string | null;
  lastActivityAt: string | null;
  recentEventCount: number;
  status: MemberPresenceStatus;
}

export interface MemberPresenceData {
  items: MemberPresenceItem[];
}

const INACTIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<MemberPresenceData>['board']>>[0],
  workspaceId: string,
  filters: Parameters<NonNullable<ScopeAdapter<MemberPresenceData>['board']>>[2],
): Promise<MemberPresenceData> {
  const range = rangeOf(ctx, filters);
  const db = asDb(ctx);
  // Workspace member listesi
  const members = await db
    .select({ userId: workspaceMembers.userId, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  if (members.length === 0) return { items: [] };

  // Her üye için son aktivite + range'de event sayısı.
  const userIds = members.map((m) => m.userId);
  const stats = await db
    .select({
      actorId: activityEvents.actorId,
      last: sql<Date>`MAX(${activityEvents.createdAt})`,
      recent: sql<number>`COUNT(*) FILTER (WHERE ${activityEvents.createdAt} >= ${range.from}::timestamptz AND ${activityEvents.createdAt} <= ${range.to}::timestamptz)::int`,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        inArray(activityEvents.actorId, userIds),
      ),
    )
    .groupBy(activityEvents.actorId);

  const statsMap = new Map<string, { last: Date | null; recent: number }>();
  for (const s of stats) {
    if (!s.actorId) continue;
    statsMap.set(s.actorId, { last: s.last, recent: Number(s.recent) });
  }

  const now = ctx.now();
  return {
    items: members
      .map((m) => {
        const stat = statsMap.get(m.userId);
        const lastActivity = stat?.last ?? null;
        const status: MemberPresenceStatus = !lastActivity
          ? 'never'
          : now.getTime() - lastActivity.getTime() > INACTIVE_THRESHOLD_MS
            ? 'inactive'
            : 'active';
        return {
          userId: m.userId,
          name: m.name,
          lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
          recentEventCount: stat?.recent ?? 0,
          status,
        };
      })
      .sort((a, b) => b.recentEventCount - a.recentEventCount),
  };
}

export const memberPresenceAdapter: ScopeAdapter<MemberPresenceData> = {
  async board(ctx, scope, filters) {
    return aggregate(ctx, scope.workspaceId, filters);
  },
  async workspace(ctx, scope, filters) {
    return aggregate(ctx, scope.workspaceId, filters);
  },
};
