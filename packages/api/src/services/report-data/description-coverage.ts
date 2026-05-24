/**
 * `description-coverage` micro-report — kartların description alanının
 * dolu olma yüzdesi (kalite metriği). Scope: L/B/W.
 *
 * Tiptap JSON empty check: `description` IS NULL veya `{}` (boş doc)
 * sayılmaz. V1 basit yaklaşım: null veya `'{}'` string'i.
 */
import { and, eq, inArray, isNotNull, ne, sql } from '@pusula/db';
import { cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard, cardStatusWhere } from './helpers';

export interface DescriptionCoverageData {
  total: number;
  withDescription: number;
  percentage: number | null;
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<DescriptionCoverageData>['board']>>[0],
  cardIds: string[],
  filters: Parameters<NonNullable<ScopeAdapter<DescriptionCoverageData>['board']>>[2],
): Promise<DescriptionCoverageData> {
  if (cardIds.length === 0) {
    return { total: 0, withDescription: 0, percentage: null };
  }
  const db = asDb(ctx);
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      withDesc: sql<number>`COUNT(*) FILTER (WHERE ${cards.description} IS NOT NULL AND ${cards.description}::text != '{}' AND ${cards.description}::text != 'null')::int`,
    })
    .from(cards)
    .where(and(inArray(cards.id, cardIds), ...cardStatusWhere(filters)));
  const total = Number(rows[0]?.total ?? 0);
  const withDescription = Number(rows[0]?.withDesc ?? 0);
  const percentage = total > 0 ? Math.round((withDescription / total) * 1000) / 10 : null;
  return { total, withDescription, percentage };
}

export const descriptionCoverageAdapter: ScopeAdapter<DescriptionCoverageData> = {
  async list(ctx, scope, filters) {
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
  async board(ctx, scope, filters) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds, filters);
  },
  async workspace(ctx, scope, filters) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) {
      return { total: 0, withDescription: 0, percentage: null };
    }
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) {
      return { total: 0, withDescription: 0, percentage: null };
    }
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id), filters);
  },
};

void isNotNull;
void ne;
