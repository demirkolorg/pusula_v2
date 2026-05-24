/**
 * `attachment-summary` micro-report — toplam ek sayısı + toplam boyut +
 * tip dağılımı (image/pdf/office/other). Scope: C/L/B/W.
 */
import { and, eq, inArray, sql } from '@pusula/db';
import { attachments, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export type AttachmentTypeBucket = 'image' | 'pdf' | 'office' | 'other';

export interface AttachmentSummaryData {
  totalCount: number;
  totalBytes: number;
  byType: Record<AttachmentTypeBucket, number>;
}

function classify(mime: string): AttachmentTypeBucket {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.includes('officedocument') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return 'office';
  }
  return 'other';
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<AttachmentSummaryData>['board']>>[0],
  cardIds: string[],
): Promise<AttachmentSummaryData> {
  const empty: AttachmentSummaryData = {
    totalCount: 0,
    totalBytes: 0,
    byType: { image: 0, pdf: 0, office: 0, other: 0 },
  };
  if (cardIds.length === 0) return empty;
  const db = asDb(ctx);
  const rows = await db
    .select({
      mime: attachments.mimeType,
      size: attachments.size,
    })
    .from(attachments)
    .where(and(inArray(attachments.cardId, cardIds)));
  const byType: Record<AttachmentTypeBucket, number> = {
    image: 0,
    pdf: 0,
    office: 0,
    other: 0,
  };
  let totalBytes = 0;
  for (const r of rows) {
    byType[classify(r.mime)] += 1;
    totalBytes += Number(r.size);
  }
  return { totalCount: rows.length, totalBytes, byType };
}

export const attachmentSummaryAdapter: ScopeAdapter<AttachmentSummaryData> = {
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
