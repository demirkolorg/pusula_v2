/**
 * `label-distribution` micro-report — etiket bazlı kart sayım dağılımı.
 * Scope: L/B/W.
 */
import { count, eq, inArray, sql, type Database } from '@pusula/db';
import { cardLabels, cards, labels } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardIdsInWorkspace } from './helpers';

export interface LabelDistributionData {
  total: number;
  labels: Array<{
    labelId: string;
    name: string;
    color: string;
    count: number;
  }>;
}

async function distributeOver(
  db: Database,
  cardIds: string[],
): Promise<LabelDistributionData> {
  if (cardIds.length === 0) return { total: 0, labels: [] };
  const rows = await db
    .select({
      labelId: cardLabels.labelId,
      name: labels.name,
      color: labels.color,
      count: count(),
    })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(inArray(cardLabels.cardId, cardIds))
    .groupBy(cardLabels.labelId, labels.name, labels.color)
    .orderBy(sql`count(*) desc`);
  const items = rows.map((r) => ({
    labelId: r.labelId,
    name: r.name,
    color: r.color,
    count: Number(r.count),
  }));
  return {
    total: items.reduce((acc, l) => acc + l.count, 0),
    labels: items,
  };
}

export const labelDistributionAdapter: ScopeAdapter<LabelDistributionData> = {
  async list(ctx, scope) {
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return distributeOver(
      db,
      cardRows.map((r) => r.id),
    );
  },
  async board(ctx, scope) {
    return distributeOver(asDb(ctx), await cardIdsInBoard(ctx, scope.boardId));
  },
  async workspace(ctx, scope) {
    return distributeOver(asDb(ctx), await cardIdsInWorkspace(ctx, scope.workspaceId));
  },
};
