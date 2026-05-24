/**
 * `attachment-type-breakdown` micro-report — MIME tipine göre detaylı
 * sayım + ortalama boyut. Scope: L/B/W.
 */
import { eq, inArray, sql } from '@pusula/db';
import { attachments, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface AttachmentTypeRow {
  mimeType: string;
  count: number;
  totalBytes: number;
  averageBytes: number;
}

export interface AttachmentTypeBreakdownData {
  items: AttachmentTypeRow[];
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<AttachmentTypeBreakdownData>['board']>>[0],
  cardIds: string[],
): Promise<AttachmentTypeBreakdownData> {
  if (cardIds.length === 0) return { items: [] };
  const db = asDb(ctx);
  const rows = await db
    .select({
      mime: attachments.mimeType,
      count: sql<number>`COUNT(*)::int`,
      total: sql<number>`SUM(${attachments.size})::bigint`,
    })
    .from(attachments)
    .where(inArray(attachments.cardId, cardIds))
    .groupBy(attachments.mimeType)
    .orderBy(sql`COUNT(*) DESC`);
  return {
    items: rows.map((r) => {
      const count = Number(r.count);
      const total = Number(r.total);
      return {
        mimeType: r.mime,
        count,
        totalBytes: total,
        averageBytes: count > 0 ? Math.round(total / count) : 0,
      };
    }),
  };
}

export const attachmentTypeBreakdownAdapter: ScopeAdapter<AttachmentTypeBreakdownData> = {
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
