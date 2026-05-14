/**
 * Realtime event dispatcher tests — Phase 5C (DEM-85).
 *
 * `dispatchRealtimeEvent` is the pure side of the realtime listener: given a
 * `QueryClient`, a board filter, and a `RealtimeEventEnvelope`, it routes the
 * envelope to the matching `board-cache` primitive and applies it through
 * `setQueriesData`. Unknown event types log a warning and skip (forward
 * compatibility — `apps/api` Faz 5B can publish new types before `apps/web`
 * learns to handle them).
 *
 * The 5B prompt has the matching server-side envelope shape; this suite pins
 * the client-side payload contract a step early so 5B can hit the same shape
 * when it implements producers. Spec: `08-web-ve-mobil.md` §8.1.10,
 * `05-board-mekanigi.md` §5.3.
 */
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import { dispatchRealtimeEvent } from './event-handlers';

// --- Fixture cache shape (mirrors `board.get` output) ---------------------

type FixCard = {
  id: string;
  listId: string;
  position: string;
  title: string;
  completedAt: Date | null;
};
type FixList = {
  id: string;
  position: string;
  title: string;
  archivedAt: string | null;
  color: string | null;
};
type FixBoard = { id: string; title: string; version: number; archivedAt: string | null };
type FixCache = { board: FixBoard; lists: FixList[]; cards: FixCard[] };

const boardKey = (boardId: string) => ['board.get', { boardId }] as const;
const cardKey = (cardId: string) => ['card.get', { cardId }] as const;

const fixture = (): FixCache => ({
  board: { id: 'b1', title: 'Pano', version: 7, archivedAt: null },
  lists: [
    { id: 'L1', position: 'l0', title: 'Yapılacak', archivedAt: null, color: null },
    { id: 'L2', position: 'l1', title: 'Bitti', archivedAt: null, color: null },
  ],
  cards: [
    { id: 'c1', listId: 'L1', position: 'a0', title: 'bir', completedAt: null },
    { id: 'c2', listId: 'L1', position: 'a1', title: 'iki', completedAt: null },
    { id: 'c3', listId: 'L2', position: 'b0', title: 'üç', completedAt: null },
  ],
});

const envelope = <TPayload>(
  type: string,
  payload: TPayload,
  overrides: Partial<RealtimeEventEnvelope<TPayload>> = {},
): RealtimeEventEnvelope<TPayload> => ({
  id: 'evt_test',
  type,
  workspaceId: 'ws_1',
  boardId: 'b1',
  actorUserId: 'user_b',
  seq: 8,
  payload,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const boardFilter = { queryKey: boardKey('b1') };

describe('dispatchRealtimeEvent — board cache reconciliation', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeClient();
    qc.setQueryData(boardKey('b1'), fixture());
  });

  afterEach(() => {
    qc.clear();
  });

  it('card.moved → re-parents the card and re-sorts', () => {
    dispatchRealtimeEvent(
      qc,
      { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) },
      envelope('card.moved', {
        cardId: 'c1',
        fromListId: 'L1',
        toListId: 'L2',
        position: 'b0V',
      }),
    );
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    const moved = next.cards.find((c) => c.id === 'c1')!;
    expect(moved.listId).toBe('L2');
    expect(moved.position).toBe('b0V');
  });

  it('card.created → appends the card row and re-sorts', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.created', {
      card: {
        id: 'c4',
        listId: 'L2',
        position: 'b1',
        title: 'dört',
        completedAt: null,
      } satisfies FixCard,
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c4')).toBeDefined();
  });

  it('card.updated → shallow-patches the card by id', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.updated', {
      cardId: 'c1',
      patch: { title: 'birinci (yeni)' },
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c1')!.title).toBe('birinci (yeni)');
  });

  it('card.archived → removes the card from the active set', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.archived', { cardId: 'c2' }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c2')).toBeUndefined();
  });

  it('card.completed → patches completedAt on the card', () => {
    const completedAt = '2026-05-13T10:00:00.000Z';
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.completed', {
      cardId: 'c1',
      completedAt,
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    // Producer ships ISO-8601; dispatcher reifies to `Date` (matches the
    // tRPC + superjson cache shape).
    expect(next.cards.find((c) => c.id === 'c1')!.completedAt).toEqual(new Date(completedAt));
  });

  it('card.uncompleted → clears completedAt on the card', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      cards: fixture().cards.map((c) =>
        c.id === 'c1' ? { ...c, completedAt: new Date('2026-05-13T10:00:00.000Z') } : c,
      ),
    });
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.uncompleted', { cardId: 'c1' }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c1')!.completedAt).toBeNull();
  });

  it('list.moved → re-positions the list', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.moved', {
      listId: 'L1',
      position: 'l2',
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.position).toBe('l2');
  });

  it('list.created → appends and re-sorts', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.created', {
      list: {
        id: 'L3',
        position: 'l2',
        title: 'Yeni liste',
        archivedAt: null,
        color: null,
      } satisfies FixList,
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L3')).toBeDefined();
  });

  it('list.updated → shallow-patches the list', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.updated', {
      listId: 'L1',
      patch: { title: 'YENİ İSİM' },
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.title).toBe('YENİ İSİM');
  });

  it('list.updated with color field → patches the list colour', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.updated', {
      listId: 'L1',
      color: 'yesil',
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.color).toBe('yesil');
  });

  it('list.updated with color:null → clears the list colour', () => {
    qc.setQueryData(boardKey('b1'), {
      ...fixture(),
      lists: fixture().lists.map((l) => (l.id === 'L1' ? { ...l, color: 'mor' } : l)),
    });
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.updated', {
      listId: 'L1',
      color: null,
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.lists.find((l) => l.id === 'L1')!.color).toBeNull();
  });

  it('list.archived → stamps archivedAt without removing the list', () => {
    const archivedAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('list.archived', {
      listId: 'L1',
      archivedAt,
    }));
    const next = qc.getQueryData<FixCache>(boardFilter.queryKey)!;
    const archived = next.lists.find((l) => l.id === 'L1')!;
    expect(archived.archivedAt).toBe(archivedAt);
  });

  it('board.updated → patches the board node', () => {
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('board.updated', {
      patch: { title: 'Yeni pano adı' },
    }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.board.title).toBe('Yeni pano adı');
  });

  it('board.archived → stamps board.archivedAt', () => {
    const archivedAt = '2026-05-13T11:00:00.000Z';
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('board.archived', { archivedAt }));
    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.board.archivedAt).toBe(archivedAt);
  });

  it('unknown event type → warns and leaves the cache untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = qc.getQueryData<FixCache>(boardKey('b1'));
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.unknown_type_future', { foo: 'bar' }));
    const after = qc.getQueryData<FixCache>(boardKey('b1'));
    expect(after).toBe(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('card.updated also patches the card.get cache when present', () => {
    qc.setQueryData(cardKey('c1'), { id: 'c1', title: 'bir', description: '' });
    dispatchRealtimeEvent(qc, { board: boardFilter, card: (cardId) => ({ queryKey: cardKey(cardId) }) }, envelope('card.updated', {
      cardId: 'c1',
      patch: { title: 'patched' },
    }));
    const detail = qc.getQueryData<{ id: string; title: string; description: string }>(cardKey('c1'))!;
    expect(detail.title).toBe('patched');
  });
});
