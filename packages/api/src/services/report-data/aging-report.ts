/**
 * `aging-report` micro-report — kart başına son hareketten beri geçen
 * gün. Scope: L/B/W. Histogram (0-7g / 8-14g / 15-30g / 31-60g / 60+g) +
 * en yaşlı 20 kart.
 */
import { and, eq, inArray, isNull, sql } from '@pusula/db';
import { cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface AgingBucket {
  label: '0-7' | '8-14' | '15-30' | '31-60' | '60+';
  count: number;
}

export interface AgingItem {
  cardId: string;
  title: string;
  lastActivityAt: string;
  ageDays: number;
}

export interface AgingReportData {
  buckets: AgingBucket[];
  oldest: AgingItem[];
  totalCards: number;
}

const BUCKETS: ReadonlyArray<{ label: AgingBucket['label']; min: number; max: number }> = [
  { label: '0-7', min: 0, max: 7 },
  { label: '8-14', min: 8, max: 14 },
  { label: '15-30', min: 15, max: 30 },
  { label: '31-60', min: 31, max: 60 },
  { label: '60+', min: 61, max: Number.MAX_SAFE_INTEGER },
];

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<AgingReportData>['board']>>[0],
  cardIds: string[],
): Promise<AgingReportData> {
  if (cardIds.length === 0) {
    return { buckets: BUCKETS.map((b) => ({ label: b.label, count: 0 })), oldest: [], totalCards: 0 };
  }
  const db = asDb(ctx);
  const now = ctx.now();
  // Son hareket = MAX(updatedAt, createdAt). activity_events join'i complexity;
  // V1 cards.updatedAt referans (Drizzle timestamps).
  const rows = await db
    .select({
      id: cards.id,
      title: cards.title,
      updatedAt: cards.updatedAt,
    })
    .from(cards)
    .where(and(inArray(cards.id, cardIds), eq(cards.completed, false), isNull(cards.archivedAt)));

  const ageDaysFor = (updatedAt: Date): number =>
    Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

  const items: AgingItem[] = rows
    .map((r) => ({
      cardId: r.id,
      title: r.title,
      lastActivityAt: r.updatedAt.toISOString(),
      ageDays: ageDaysFor(r.updatedAt),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const buckets: AgingBucket[] = BUCKETS.map((b) => ({
    label: b.label,
    count: items.filter((i) => i.ageDays >= b.min && i.ageDays <= b.max).length,
  }));
  return { buckets, oldest: items.slice(0, 20), totalCards: items.length };
}

export const agingReportAdapter: ScopeAdapter<AgingReportData> = {
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

void sql;
