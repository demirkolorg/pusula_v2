/**
 * `kpi-card` micro-report — tek metrik (current + previous comparison
 * için aynı query iki kez). Scope: C/L/B/W.
 *
 * V1'de tek metrik: "activity count" (preset'in micro-report
 * config'inde override yoksa default). Comparison etkin ise envelope
 * orchestrator previous range için yine bu adapter'ı çağırır.
 */
import { and, between, count, eq, inArray } from '@pusula/db';
import { activityEvents, cards } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { activityWhere, asDb, cardIdsInBoard, rangeOf } from './helpers';

export interface KpiCardData {
  metric: string;
  value: number;
  /**
   * UI tarafı `KpiCardViewData` `labelKey` (zorunlu) bekliyor — yoksa
   * `MicroReportShell` başlığı boş kalır, `KpiCard` etiketi i18n lookup'ı
   * '' döner. Adapter default olarak metric'e karşılık gelen domain
   * key'ini gönderir (`reports.metrics.activityCount`); ilerleyen preset
   * config'lerinde override edilebilir.
   */
  labelKey: string;
}

const METRIC = 'activityCount';
const LABEL_KEY = `reports.metrics.${METRIC}`;

function payload(value: number): KpiCardData {
  return { metric: METRIC, value, labelKey: LABEL_KEY };
}

export const kpiCardAdapter: ScopeAdapter<KpiCardData> = {
  async card(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const [row] = await asDb(ctx)
      .select({ count: count() })
      .from(activityEvents)
      .where(and(eq(activityEvents.cardId, scope.cardId), ...activityWhere(filters, range)));
    return payload(Number(row?.count ?? 0));
  },

  async list(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const db = asDb(ctx);
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.listId, scope.listId));
    if (cardRows.length === 0) return payload(0);
    const [row] = await db
      .select({ count: count() })
      .from(activityEvents)
      .where(
        and(
          inArray(
            activityEvents.cardId,
            cardRows.map((r) => r.id),
          ),
          ...activityWhere(filters, range),
        ),
      );
    return payload(Number(row?.count ?? 0));
  },

  async board(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    if (cardIds.length === 0) return payload(0);
    const [row] = await asDb(ctx)
      .select({ count: count() })
      .from(activityEvents)
      .where(and(inArray(activityEvents.cardId, cardIds), ...activityWhere(filters, range)));
    return payload(Number(row?.count ?? 0));
  },

  async workspace(ctx, scope, filters) {
    const range = rangeOf(ctx, filters);
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return payload(0);
    const [row] = await asDb(ctx)
      .select({ count: count() })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, scope.workspaceId),
          inArray(activityEvents.boardId, accessibleBoardIds as string[]),
          between(activityEvents.createdAt, range.from, range.to),
        ),
      );
    return payload(Number(row?.count ?? 0));
  },
};
