/**
 * `useBoardRealtime` hook tests — Phase 5C (DEM-85).
 *
 * Drives the hook against a fake `socket.io-client` instance and asserts the
 * five reconciliation contracts from `05-board-mekanigi.md` §5.3:
 *
 *   - mount: connect (if not already) → `board:join` emit → register listener
 *   - echo: an envelope whose `clientMutationId` is in the in-flight set is
 *     skipped (no cache mutation)
 *   - apply: `event.seq === lastAppliedSeq + 1` updates the cache and bumps
 *     `lastAppliedSeq` (`boards.version` mirror)
 *   - gap: `event.seq > lastAppliedSeq + 1` triggers `invalidateQueries` on
 *     the board filter (no in-place apply)
 *   - stale: `event.seq <= lastAppliedSeq` is a no-op (no apply, no invalidate)
 *   - reconnect: a fresh `connect` event invalidates the board cache and
 *     re-emits `board:join`
 *   - unmount: emits `board:leave` and detaches the listener
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import {
  addInFlightClientMutationId,
  clearInFlightClientMutationIds,
} from './in-flight-store';

// --- Fake socket -----------------------------------------------------------
type Listener = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  listeners = new Map<string, Set<Listener>>();
  emitted: { event: string; args: unknown[] }[] = [];

  connect(): this {
    this.connected = true;
    this.trigger('connect');
    return this;
  }
  disconnect(): this {
    this.connected = false;
    this.trigger('disconnect');
    return this;
  }
  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }
  off(event: string, listener?: Listener): this {
    if (!listener) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(listener);
    }
    return this;
  }
  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }
  /** Test helper: invoke registered listeners as if the server sent something. */
  trigger(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) listener(...args);
  }
}

let fakeSocket: FakeSocket;

vi.mock('./client', () => ({
  getRealtimeSocket: () => fakeSocket,
  REALTIME_EVENT_CHANNEL: 'realtime:event',
  disconnectRealtimeSocket: () => {
    fakeSocket.disconnect();
  },
}));

// --- tRPC mock (queryFilter shape mirrors mutations.test.tsx) -------------
const boardKey = (boardId: string) => ['board.get', { boardId }] as const;
const cardKey = (cardId: string) => ['card.get', { cardId }] as const;

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: { queryFilter: ({ boardId }: { boardId: string }) => ({ queryKey: boardKey(boardId) }) },
      list: {
        queryFilter: ({ workspaceId }: { workspaceId: string }) => ({
          queryKey: ['board.list', { workspaceId }] as const,
        }),
      },
    },
    card: {
      get: { queryFilter: ({ cardId }: { cardId: string }) => ({ queryKey: cardKey(cardId) }) },
    },
  }),
}));

// Import AFTER vi.mock so the hook picks up the mocked client.
import { useBoardRealtime } from './use-board-realtime';

// --- Fixture cache (mirrors `board.get`) ----------------------------------
type FixCard = { id: string; listId: string; position: string; title: string };
type FixList = { id: string; position: string; title: string; archivedAt: string | null };
type FixBoard = { id: string; title: string; version: number; archivedAt: string | null };
type FixCache = { board: FixBoard; lists: FixList[]; cards: FixCard[] };

const fixture = (version = 7): FixCache => ({
  board: { id: 'b1', title: 'Pano', version, archivedAt: null },
  lists: [
    { id: 'L1', position: 'l0', title: 'Yapılacak', archivedAt: null },
    { id: 'L2', position: 'l1', title: 'Bitti', archivedAt: null },
  ],
  cards: [
    { id: 'c1', listId: 'L1', position: 'a0', title: 'bir' },
    { id: 'c2', listId: 'L1', position: 'a1', title: 'iki' },
  ],
});

const envelope = <TPayload,>(
  type: string,
  seq: number,
  payload: TPayload,
  overrides: Partial<RealtimeEventEnvelope<TPayload>> = {},
): RealtimeEventEnvelope<TPayload> => ({
  id: `evt_${type}_${seq}`,
  type,
  workspaceId: 'ws_1',
  boardId: 'b1',
  actorUserId: 'user_b',
  seq,
  payload,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// --- Tests ----------------------------------------------------------------

describe('useBoardRealtime — mount/unmount lifecycle', () => {
  beforeEach(() => {
    fakeSocket = new FakeSocket();
    clearInFlightClientMutationIds();
  });
  afterEach(() => {
    clearInFlightClientMutationIds();
  });

  it('mount: connects the socket (if not connected) and emits board:join', () => {
    const qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture());
    expect(fakeSocket.connected).toBe(false);

    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });

    expect(fakeSocket.connected).toBe(true);
    expect(fakeSocket.emitted).toContainEqual({ event: 'board:join', args: [{ boardId: 'b1' }] });
    expect(fakeSocket.listeners.get('realtime:event')?.size).toBe(1);
  });

  it('mount: when the socket is already connected, emits board:join without reconnecting', () => {
    const qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture());
    fakeSocket.connected = true;

    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });

    expect(fakeSocket.emitted).toContainEqual({ event: 'board:join', args: [{ boardId: 'b1' }] });
  });

  it('unmount: emits board:leave and detaches the realtime listener', () => {
    const qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture());
    const { unmount } = renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });

    expect(fakeSocket.listeners.get('realtime:event')?.size).toBe(1);
    unmount();
    expect(fakeSocket.emitted).toContainEqual({ event: 'board:leave', args: [{ boardId: 'b1' }] });
    expect(fakeSocket.listeners.get('realtime:event')?.size ?? 0).toBe(0);
    // Symmetric: connect + disconnect listeners are detached too.
    expect(fakeSocket.listeners.get('connect')?.size ?? 0).toBe(0);
    expect(fakeSocket.listeners.get('disconnect')?.size ?? 0).toBe(0);
  });

  it('unmount BEFORE the socket connects: skips board:leave (no prior join)', () => {
    const qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture());
    // Override the FakeSocket so `connect()` is a no-op — the socket stays
    // disconnected for the whole hook lifecycle.
    class StuckSocket extends FakeSocket {
      override connect(): this {
        // Don't flip `connected` and don't trigger 'connect'.
        return this;
      }
    }
    fakeSocket = new StuckSocket();

    const { unmount } = renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });
    // Hook called connect() but our stub did nothing → no `board:join` emitted.
    expect(fakeSocket.emitted.some((e) => e.event === 'board:join')).toBe(false);

    unmount();
    // No `board:leave` either, because we never joined.
    expect(fakeSocket.emitted.some((e) => e.event === 'board:leave')).toBe(false);
  });
});

describe('useBoardRealtime — event reconciliation', () => {
  let qc: QueryClient;

  beforeEach(() => {
    fakeSocket = new FakeSocket();
    clearInFlightClientMutationIds();
    qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture(7));
  });

  it('apply: seq === version + 1 patches the cache and advances the version', () => {
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });

    act(() => {
      fakeSocket.trigger(
        'realtime:event',
        envelope('card.moved', 8, {
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          position: 'b0V',
        }),
      );
    });

    const next = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(next.cards.find((c) => c.id === 'c1')!.listId).toBe('L2');
    expect(next.board.version).toBe(8);
  });

  it('echo: skips an envelope whose clientMutationId is in-flight', () => {
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });
    addInFlightClientMutationId('mut-1');
    const before = qc.getQueryData<FixCache>(boardKey('b1'));

    act(() => {
      fakeSocket.trigger(
        'realtime:event',
        envelope(
          'card.moved',
          8,
          { cardId: 'c1', fromListId: 'L1', toListId: 'L2', position: 'b0V' },
          { clientMutationId: 'mut-1' },
        ),
      );
    });

    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(before);
  });

  it('gap: seq > version + 1 invalidates the board cache (no in-place apply)', async () => {
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await act(async () => {
      fakeSocket.trigger(
        'realtime:event',
        envelope('card.moved', 12, {
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          position: 'b0V',
        }),
      );
    });

    expect(spy).toHaveBeenCalled();
    // Cache wasn't patched in-place — the listId still reads 'L1' until the refetch lands.
    const after = qc.getQueryData<FixCache>(boardKey('b1'))!;
    expect(after.cards.find((c) => c.id === 'c1')!.listId).toBe('L1');
  });

  it('no baseline: an envelope arriving before board.get settles triggers invalidate (no apply)', async () => {
    const noCacheQc = newQueryClient(); // No `board.get` cache entry pre-loaded.
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(noCacheQc) });
    const spy = vi.spyOn(noCacheQc, 'invalidateQueries');

    await act(async () => {
      fakeSocket.trigger(
        'realtime:event',
        envelope('card.moved', 1, {
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          position: 'b0V',
        }),
      );
    });

    expect(spy).toHaveBeenCalled();
    expect(noCacheQc.getQueryData(boardKey('b1'))).toBeUndefined();
  });

  it('stale: seq <= version is a no-op (no apply, no invalidate)', () => {
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const before = qc.getQueryData<FixCache>(boardKey('b1'));

    act(() => {
      fakeSocket.trigger(
        'realtime:event',
        envelope('card.moved', 6, {
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          position: 'b0V',
        }),
      );
    });

    expect(spy).not.toHaveBeenCalled();
    expect(qc.getQueryData<FixCache>(boardKey('b1'))).toBe(before);
  });

  it('reconnect: a fresh connect event invalidates the board cache and re-emits board:join', async () => {
    renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });
    // Initial mount already emitted one join.
    const initialJoinCount = fakeSocket.emitted.filter((e) => e.event === 'board:join').length;
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await act(async () => {
      fakeSocket.trigger('connect');
    });

    const finalJoinCount = fakeSocket.emitted.filter((e) => e.event === 'board:join').length;
    expect(finalJoinCount).toBe(initialJoinCount + 1);
    expect(spy).toHaveBeenCalled();
  });
});

describe('useBoardRealtime — connection status', () => {
  beforeEach(() => {
    fakeSocket = new FakeSocket();
    clearInFlightClientMutationIds();
  });

  it('reflects the socket connected/disconnected state', async () => {
    const qc = newQueryClient();
    qc.setQueryData(boardKey('b1'), fixture());

    const { result } = renderHook(() => useBoardRealtime('b1'), { wrapper: wrap(qc) });

    // After mount the hook called connect() → connected.
    expect(result.current.connected).toBe(true);

    await act(async () => {
      fakeSocket.disconnect();
    });
    expect(result.current.connected).toBe(false);

    await act(async () => {
      fakeSocket.connect();
    });
    expect(result.current.connected).toBe(true);
  });
});
