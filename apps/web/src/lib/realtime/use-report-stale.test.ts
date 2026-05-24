/**
 * Faz 13N (DEM-270) — `affectsWatchedScope` saf fonksiyon testleri.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §7 (event payload
 * sözleşmesi + V1 scope match tablosu).
 *
 * Hook'un kendisi (socket subscribe/unsubscribe) ayrı test edilir;
 * burada saf eşleme mantığı.
 */
import { describe, expect, it } from 'vitest';
import {
  affectsWatchedScope,
  type ReportInvalidatedEvent,
  type WatchedReportScope,
} from './use-report-stale';

const EVENT_BASE: ReportInvalidatedEvent = {
  at: '2026-05-24T10:00:00.000Z',
  scopeKinds: ['workspace', 'board'],
  workspaceId: 'ws-1',
  eventType: 'card.moved',
};

describe('affectsWatchedScope', () => {
  describe('workspace scope', () => {
    const watched: WatchedReportScope = {
      kind: 'workspace',
      workspaceId: 'ws-1',
    };

    it('aynı workspace event\'i → true (her şey aggregate eder)', () => {
      expect(affectsWatchedScope(EVENT_BASE, watched)).toBe(true);
    });

    it('aynı workspace + alt board event\'i → true', () => {
      expect(
        affectsWatchedScope({ ...EVENT_BASE, boardId: 'b-1' }, watched),
      ).toBe(true);
    });

    it('aynı workspace + alt card event\'i → true', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, cardId: 'c-1', boardId: 'b-1' },
          watched,
        ),
      ).toBe(true);
    });

    it('farklı workspace event\'i → false', () => {
      expect(
        affectsWatchedScope({ ...EVENT_BASE, workspaceId: 'ws-other' }, watched),
      ).toBe(false);
    });
  });

  describe('board scope', () => {
    const watched: WatchedReportScope = {
      kind: 'board',
      boardId: 'b-1',
      workspaceId: 'ws-1',
    };

    it('aynı board event\'i → true', () => {
      expect(
        affectsWatchedScope({ ...EVENT_BASE, boardId: 'b-1' }, watched),
      ).toBe(true);
    });

    it('farklı board event\'i (aynı workspace) → false', () => {
      expect(
        affectsWatchedScope({ ...EVENT_BASE, boardId: 'b-other' }, watched),
      ).toBe(false);
    });

    it('event\'te boardId yok (workspace-level event) → false', () => {
      expect(affectsWatchedScope(EVENT_BASE, watched)).toBe(false);
    });

    it('farklı workspace board event\'i → false', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, workspaceId: 'ws-other', boardId: 'b-1' },
          watched,
        ),
      ).toBe(false);
    });
  });

  describe('list scope', () => {
    const watched: WatchedReportScope = {
      kind: 'list',
      listId: 'l-1',
      boardId: 'b-1',
      workspaceId: 'ws-1',
    };

    it('aynı list event\'i → true', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, listId: 'l-1', boardId: 'b-1' },
          watched,
        ),
      ).toBe(true);
    });

    it('farklı list (aynı board) event\'i → false', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, listId: 'l-other', boardId: 'b-1' },
          watched,
        ),
      ).toBe(false);
    });

    it('V1: card.* event listId taşımıyorsa list-scope stale tetiklenmez', () => {
      expect(
        affectsWatchedScope(
          // Card moved event'i — listId yok ama boardId var
          { ...EVENT_BASE, cardId: 'c-1', boardId: 'b-1' },
          watched,
        ),
      ).toBe(false);
    });
  });

  describe('card scope', () => {
    const watched: WatchedReportScope = {
      kind: 'card',
      cardId: 'c-1',
      boardId: 'b-1',
      workspaceId: 'ws-1',
    };

    it('aynı card event\'i → true', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, cardId: 'c-1', boardId: 'b-1' },
          watched,
        ),
      ).toBe(true);
    });

    it('farklı card event\'i → false', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, cardId: 'c-other', boardId: 'b-1' },
          watched,
        ),
      ).toBe(false);
    });

    it('event\'te cardId yok (list-level event) → false', () => {
      expect(
        affectsWatchedScope(
          { ...EVENT_BASE, listId: 'l-1', boardId: 'b-1' },
          watched,
        ),
      ).toBe(false);
    });

    it('farklı workspace card → false (workspace root match shart)', () => {
      expect(
        affectsWatchedScope(
          {
            ...EVENT_BASE,
            workspaceId: 'ws-other',
            cardId: 'c-1',
            boardId: 'b-1',
          },
          watched,
        ),
      ).toBe(false);
    });
  });
});
