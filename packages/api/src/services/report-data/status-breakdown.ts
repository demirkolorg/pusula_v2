/**
 * `status-breakdown` micro-report — kart durum dağılımı
 * (açık/tamamlanan/arşivli sayım). Scope: L/B/W.
 */
import { and, count, eq, inArray, isNotNull, isNull, type Database } from '@pusula/db';
import { cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardIdsInWorkspace } from './helpers';

export interface StatusBreakdownData {
  open: number;
  completed: number;
  archived: number;
  total: number;
}

async function countByScope(
  db: Database,
  cardIds: string[],
): Promise<StatusBreakdownData> {
  if (cardIds.length === 0) return { open: 0, completed: 0, archived: 0, total: 0 };
  const [[openRow], [completedRow], [archivedRow]] = await Promise.all([
    db
      .select({ count: count() })
      .from(cards)
      .where(
        and(inArray(cards.id, cardIds), eq(cards.completed, false), isNull(cards.archivedAt)),
      ),
    db
      .select({ count: count() })
      .from(cards)
      .where(
        and(inArray(cards.id, cardIds), eq(cards.completed, true), isNull(cards.archivedAt)),
      ),
    db
      .select({ count: count() })
      .from(cards)
      .where(and(inArray(cards.id, cardIds), isNotNull(cards.archivedAt))),
  ]);
  const open = Number(openRow?.count ?? 0);
  const completed = Number(completedRow?.count ?? 0);
  const archived = Number(archivedRow?.count ?? 0);
  return { open, completed, archived, total: open + completed + archived };
}

export const statusBreakdownAdapter: ScopeAdapter<StatusBreakdownData> = {
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return countByScope(
      db,
      cardRows.map((r) => r.id),
    );
  },
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return countByScope(asDb(ctx), cardIds);
  },
  async workspace(ctx, scope) {
    const cardIds = await cardIdsInWorkspace(ctx, scope.workspaceId);
    return countByScope(asDb(ctx), cardIds);
  },
};
