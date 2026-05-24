/**
 * `label-cooccurrence` micro-report — etiket çiftleri matrisi (hangi 2
 * etiket aynı kartta). Scope: B/W. Top 20 çift.
 */
import { eq, inArray, sql } from '@pusula/db';
import { cardLabels, cards, labels, lists } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb } from './helpers';

export interface CooccurrencePair {
  labelAId: string;
  labelAName: string;
  labelAColor: string;
  labelBId: string;
  labelBName: string;
  labelBColor: string;
  count: number;
}

export interface LabelCooccurrenceData {
  pairs: CooccurrencePair[];
}

async function aggregateForBoards(
  ctx: Parameters<NonNullable<ScopeAdapter<LabelCooccurrenceData>['board']>>[0],
  boardIds: string[],
): Promise<LabelCooccurrenceData> {
  if (boardIds.length === 0) return { pairs: [] };
  const db = asDb(ctx);
  // Card → labelIds map
  const rows = await db
    .select({
      cardId: cardLabels.cardId,
      labelId: cardLabels.labelId,
      labelName: labels.name,
      color: labels.color,
    })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .innerJoin(cards, eq(cards.id, cardLabels.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(inArray(lists.boardId, boardIds));

  if (rows.length === 0) return { pairs: [] };
  const labelMeta = new Map<string, { name: string; color: string }>();
  const byCard = new Map<string, string[]>();
  for (const r of rows) {
    labelMeta.set(r.labelId, { name: r.labelName, color: r.color });
    const arr = byCard.get(r.cardId) ?? [];
    arr.push(r.labelId);
    byCard.set(r.cardId, arr);
  }
  // Pair count
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairCount = new Map<string, number>();
  for (const labelIds of byCard.values()) {
    for (let i = 0; i < labelIds.length; i++) {
      for (let j = i + 1; j < labelIds.length; j++) {
        const k = pairKey(labelIds[i]!, labelIds[j]!);
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
    }
  }
  const pairs: CooccurrencePair[] = Array.from(pairCount.entries())
    .map(([key, count]) => {
      const [aId, bId] = key.split('|') as [string, string];
      const a = labelMeta.get(aId)!;
      const b = labelMeta.get(bId)!;
      return {
        labelAId: aId,
        labelAName: a.name,
        labelAColor: a.color,
        labelBId: bId,
        labelBName: b.name,
        labelBColor: b.color,
        count,
      };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 20);
  return { pairs };
}

export const labelCooccurrenceAdapter: ScopeAdapter<LabelCooccurrenceData> = {
  async board(ctx, scope) {
    return aggregateForBoards(ctx, [scope.boardId]);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    return aggregateForBoards(ctx, accessibleBoardIds as string[]);
  },
};

void sql;
