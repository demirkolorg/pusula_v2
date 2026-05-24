/**
 * `checklist-progress` micro-report — checklist item tamamlanma oranı.
 * Scope: C/L/B/W.
 */
import { and, count, eq, inArray, type Database } from '@pusula/db';
import { cards, checklistItems, checklists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardIdsInWorkspace } from './helpers';

export interface ChecklistProgressData {
  total: number;
  completed: number;
  /** 0–100 yüzde; total=0 ise null. */
  percentage: number | null;
}

async function progressForCards(
  db: Database,
  cardIds: string[],
): Promise<ChecklistProgressData> {
  if (cardIds.length === 0) return { total: 0, completed: 0, percentage: null };
  // checklist_items → checklists → cards (cardId ∈ cardIds)
  const checklistRows = await db
    .select({ id: checklists.id })
    .from(checklists)
    .where(inArray(checklists.cardId, cardIds));
  if (checklistRows.length === 0) return { total: 0, completed: 0, percentage: null };
  const checklistIds = checklistRows.map((r) => r.id);

  const [[totalRow], [completedRow]] = await Promise.all([
    db
      .select({ count: count() })
      .from(checklistItems)
      .where(inArray(checklistItems.checklistId, checklistIds)),
    db
      .select({ count: count() })
      .from(checklistItems)
      .where(
        and(
          inArray(checklistItems.checklistId, checklistIds),
          eq(checklistItems.completed, true),
        ),
      ),
  ]);
  const total = Number(totalRow?.count ?? 0);
  const completed = Number(completedRow?.count ?? 0);
  return {
    total,
    completed,
    percentage: total === 0 ? null : Math.round((completed / total) * 100),
  };
}

export const checklistProgressAdapter: ScopeAdapter<ChecklistProgressData> = {
  async card(ctx, scope) {
    return progressForCards(asDb(ctx), [scope.cardId]);
  },
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return progressForCards(
      db,
      cardRows.map((r) => r.id),
    );
  },
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return progressForCards(asDb(ctx), cardIds);
  },
  async workspace(ctx, scope) {
    const cardIds = await cardIdsInWorkspace(ctx, scope.workspaceId);
    return progressForCards(asDb(ctx), cardIds);
  },
};
