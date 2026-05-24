/**
 * Faz 13E — Outbox event → rapor cache invalidation pattern derivation
 * (DEM-261). Saf fonksiyon — `realtime_events` / `notification_outbox`
 * processor'larından gelen event meta'sından hangi scope ailelerinin
 * cache'inin silinmesi gerektiğini hesaplar.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.7 (invalidation
 * mantığı) + §9.12 (stale rozeti).
 */
import { reportInvalidationPattern } from './report-cache';

/**
 * Outbox event → cache invalidator için minimal payload. `realtime_events`
 * veya `notification_outbox` satırından bu alanlar çıkarılır.
 */
export interface InvalidationEventContext {
  /** Event tipi (`card.moved`, `card.completed`, `comment.created`, ...). */
  eventType: string;
  workspaceId: string;
  /** Olay board-bağlamlı ise. */
  boardId?: string | null;
  /** Olay list-bağlamlı ise (genelde card.move payload'undan listId). */
  listId?: string | null;
  /** Olay card-bağlamlı ise. */
  cardId?: string | null;
  /**
   * Card cross-board move'da kaynak board (`fromBoardId`). Belirtilmişse
   * o board'un cache'i de invalidate edilir.
   */
  fromBoardId?: string | null;
  /** Card cross-list move'da kaynak list (`fromListId`). */
  fromListId?: string | null;
}

export interface InvalidationOutcome {
  patterns: ReadonlyArray<string>;
  /**
   * `report.invalidated` socket event'i için (13N) — UI'a "şu scope
   * kind'larındaki açık raporlar stale" der.
   */
  scopeKinds: ReadonlyArray<'card' | 'list' | 'board' | 'workspace'>;
}

/**
 * Etkilenen pattern listesini hesapla. Stratejide rule:
 *   - Workspace pattern HER ZAMAN (workspace-scope raporlar tüm event'lerden
 *     etkilenir — aggregation altı).
 *   - boardId varsa board pattern.
 *   - listId varsa list pattern (+ varsa fromListId).
 *   - cardId varsa card pattern.
 *   - fromBoardId varsa kaynak board pattern (cross-board move).
 *
 * Aynı pattern'i iki kez yazmamak için `Set` ile tekleyip array döner.
 * Sıra deterministik (Set insertion order korunur).
 */
export function collectInvalidationPatterns(
  ctx: InvalidationEventContext,
): InvalidationOutcome {
  const patternSet = new Set<string>();
  const kindSet = new Set<'card' | 'list' | 'board' | 'workspace'>();

  // Workspace pattern — her zaman.
  patternSet.add(
    reportInvalidationPattern({ scopeKind: 'workspace', scopeId: ctx.workspaceId }),
  );
  kindSet.add('workspace');

  if (ctx.boardId) {
    patternSet.add(reportInvalidationPattern({ scopeKind: 'board', scopeId: ctx.boardId }));
    kindSet.add('board');
  }
  if (ctx.fromBoardId && ctx.fromBoardId !== ctx.boardId) {
    patternSet.add(
      reportInvalidationPattern({ scopeKind: 'board', scopeId: ctx.fromBoardId }),
    );
    kindSet.add('board');
  }

  if (ctx.listId) {
    patternSet.add(reportInvalidationPattern({ scopeKind: 'list', scopeId: ctx.listId }));
    kindSet.add('list');
  }
  if (ctx.fromListId && ctx.fromListId !== ctx.listId) {
    patternSet.add(
      reportInvalidationPattern({ scopeKind: 'list', scopeId: ctx.fromListId }),
    );
    kindSet.add('list');
  }

  if (ctx.cardId) {
    patternSet.add(reportInvalidationPattern({ scopeKind: 'card', scopeId: ctx.cardId }));
    kindSet.add('card');
  }

  return {
    patterns: Array.from(patternSet),
    scopeKinds: Array.from(kindSet),
  };
}

/**
 * `report.invalidated` socket event payload — `apps/api` socket bridge
 * `workspace:{id}` room'una basar. 13N web hook bunu dinler.
 */
export interface ReportInvalidatedSocketEvent {
  /** Event yayın anı (ISO). */
  at: string;
  /** Hangi scope kind'lar etkilendi (UI açık raporu match eder). */
  scopeKinds: ReadonlyArray<'card' | 'list' | 'board' | 'workspace'>;
  /** Olayı tetikleyen entity id'leri — UI daraltma için. */
  workspaceId: string;
  boardId?: string;
  listId?: string;
  cardId?: string;
  /** Event tipi audit'i (örn. `card.moved`). */
  eventType: string;
}

export const REPORT_INVALIDATED_SOCKET_EVENT = 'report.invalidated' as const;

/** Socket bridge için Redis pub/sub channel'ı (Faz 5 publish channel'ı paralel). */
export const REPORT_INVALIDATED_CHANNEL = 'pusula:report:invalidated' as const;

/** Wire-format mesajı (Redis channel'a JSON serialize edilir). */
export interface ReportInvalidatedMessage {
  event: ReportInvalidatedSocketEvent;
  /** Hangi workspace room'una basılacak. */
  room: { kind: 'workspace'; id: string };
}
