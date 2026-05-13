/**
 * Failure-mode tests for the Phase 4 optimistic-mutation hook (DEM-81 / 4D).
 *
 * Covers the five contracts pinned by `05-board-mekanigi.md` §5.2 +
 * `08-web-ve-mobil.md` §8.1.9 for in-scope collaborative mutations:
 *
 *   1. `clientMutationId` (UUID v4) injected on every `.mutate(...)` call,
 *      regardless of mutation shape; a caller-supplied id is preserved.
 *   2. Network / 5xx error → cache rolls back to the pre-mutation snapshot
 *      and the destructive `onMutationError` callback fires (no `onConflict`).
 *   3. `TRPCError({ code: 'CONFLICT' })` → cache rolls back AND
 *      `invalidateQueries(boardFilter)` runs AND the neutral `onConflict`
 *      callback fires (no destructive `onMutationError`).
 *   4. Concurrent mutates (race) → both `apply`s run; both finish; the cache
 *      reflects the composite of both optimistic patches.
 *   5. Rollback exactness — the snapshot restored on error is structurally
 *      equal to the pre-mutation cache (no flicker / no partial state).
 *
 * Scope (per the 4D prompt): `card.move`, `card.create`, `card.archive`,
 * `list.move`, `board.update` — five distinct mutation patterns spanning
 * move / create / archive / update. The hook is generic over its builder
 * so testing the lifecycle for these five covers the other 12 in scope.
 */
import {
  QueryClient,
  QueryClientProvider,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyBoardPatch,
  applyCardArchive,
  applyCardMove,
  applyListMove,
  useOptimisticBoardListMutation,
  useOptimisticBoardMutation,
} from './index';

// --- tRPC client mock ------------------------------------------------------
// `useBoardCacheKeys` consumes `useTRPC().board.get.queryFilter({ boardId })`
// (and siblings for `card.get` / `board.list`) — shape the mock so each
// helper returns a deterministic `{ queryKey }` the test's QueryClient
// addresses with `getQueryData(queryKey)` against.
const boardKey = (boardId: string) => ['board.get', { boardId }] as const;
const boardListKey = (workspaceId: string) => ['board.list', { workspaceId }] as const;
const cardKey = (cardId: string) => ['card.get', { cardId }] as const;

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: { queryFilter: ({ boardId }: { boardId: string }) => ({ queryKey: boardKey(boardId) }) },
      list: {
        queryFilter: ({ workspaceId }: { workspaceId: string }) => ({
          queryKey: boardListKey(workspaceId),
        }),
      },
    },
    card: {
      get: { queryFilter: ({ cardId }: { cardId: string }) => ({ queryKey: cardKey(cardId) }) },
    },
  }),
}));

// --- Fixture cache shape --------------------------------------------------

type FixCard = { id: string; listId: string; position: string; title: string };
type FixList = { id: string; position: string; title: string; archivedAt: Date | null };
type FixBoard = { id: string; title: string };
type FixCache = { board: FixBoard; lists: FixList[]; cards: FixCard[] };

const fixture = (): FixCache => ({
  board: { id: 'b1', title: 'Pano' },
  lists: [
    { id: 'L1', position: 'l0', title: 'Yapılacak', archivedAt: null },
    { id: 'L2', position: 'l1', title: 'Bitti', archivedAt: null },
  ],
  cards: [
    { id: 'c1', listId: 'L1', position: 'a0', title: 'bir' },
    { id: 'c2', listId: 'L1', position: 'a1', title: 'iki' },
    { id: 'c3', listId: 'L2', position: 'b0', title: 'üç' },
  ],
});

// --- Mutation variable shapes (mirror the real tRPC inputs in scope) ------

type MoveCardVars = {
  cardId: string;
  fromListId: string;
  toListId: string;
  newPosition: string;
  clientMutationId?: string;
};
type CreateCardVars = { listId: string; title: string; clientMutationId?: string };
type ArchiveCardVars = { cardId: string; archived: boolean; clientMutationId?: string };
type MoveListVars = {
  boardId: string;
  listId: string;
  newPosition: string;
  clientMutationId?: string;
};
type UpdateBoardVars = { boardId: string; title?: string; clientMutationId?: string };
type CreateBoardVars = { workspaceId: string; title: string; clientMutationId?: string };

// --- Helpers --------------------------------------------------------------

const VALID_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build a tRPC-shaped `mutationOptions` builder for the test: it forwards the
 * caller's lifecycle hooks (`onMutate` / `onError` / `onSettled` / `onSuccess`)
 * and injects the test's `mutationFn`. The `TVars` generic is the channel
 * `useOptimisticBoardMutation` uses to infer the mutation's variable shape.
 */
function makeMutationOptions<TVars, TData = unknown>(
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  return (opts: UseMutationOptions<TData, unknown, TVars, unknown>) =>
    ({ ...opts, mutationFn }) as UseMutationOptions<TData, unknown, TVars, unknown>;
}

/** A `TRPCError`-shaped CONFLICT (matches the hook's `isConflict` check). */
const conflictError = () =>
  Object.assign(new Error('CONFLICT — concurrent move'), {
    data: { code: 'CONFLICT' },
  });

function newQueryClient(): QueryClient {
  // Note: do NOT set `gcTime: 0` here — these tests put fixture data into the
  // cache with `setQueryData(...)` without mounting a `useQuery` observer, so
  // the query is "inactive" from the start. With `gcTime: 0`, cancelQueries
  // (called from `onMutate`) flips the query through a state that triggers
  // immediate garbage collection, dropping the cache *before* the rollback
  // can restore it. The default `gcTime` (5 min) keeps the cache around for
  // the whole test run.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrap(queryClient: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// --- Tests ----------------------------------------------------------------

describe('useOptimisticBoardMutation — failure modes (Phase 4D / DEM-81)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = newQueryClient();
    queryClient.setQueryData(boardKey('b1'), fixture());
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ----- clientMutationId injection (5 mutations × 1 test each) ------------

  describe('clientMutationId injection (UUID v4)', () => {
    it('card.move: every mutate vars carries a UUID v4 clientMutationId', async () => {
      const mutationFn = vi.fn(async (_vars: MoveCardVars) => ({ ok: true }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyCardMove(data as unknown as FixCache, {
                cardId: vars.cardId,
                toListId: vars.toListId,
                newPosition: vars.newPosition,
              }) as unknown as typeof data,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0V',
        });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as MoveCardVars;
      expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    });

    it('card.create: clientMutationId injected even when apply is a no-op', async () => {
      const mutationFn = vi.fn(async (_vars: CreateCardVars) => ({ id: 'new' }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data) => data, // create has no optimistic insert (server picks id)
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ listId: 'L1', title: 'Yeni kart' });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as CreateCardVars;
      expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    });

    it('card.archive: clientMutationId injected', async () => {
      const mutationFn = vi.fn(async (_vars: ArchiveCardVars) => ({ ok: true }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            cardId: 'c1',
            apply: (data, vars) =>
              vars.archived
                ? (applyCardArchive(data as unknown as FixCache, vars.cardId) as unknown as typeof data)
                : data,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ cardId: 'c1', archived: true });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as ArchiveCardVars;
      expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    });

    it('list.move: clientMutationId injected', async () => {
      const mutationFn = vi.fn(async (_vars: MoveListVars) => ({ ok: true }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyListMove(data as unknown as FixCache, {
                listId: vars.listId,
                newPosition: vars.newPosition,
              }) as unknown as typeof data,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ boardId: 'b1', listId: 'L2', newPosition: 'l0V' });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as MoveListVars;
      expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    });

    it('board.update: clientMutationId injected', async () => {
      const mutationFn = vi.fn(async (_vars: UpdateBoardVars) => ({ ok: true }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              vars.title == null
                ? data
                : (applyBoardPatch(data as unknown as FixCache, {
                    title: vars.title,
                  }) as unknown as typeof data),
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ boardId: 'b1', title: 'Yeni başlık' });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as UpdateBoardVars;
      expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    });

    it('honours a caller-supplied clientMutationId (does not overwrite)', async () => {
      const supplied = '11111111-2222-4333-8444-555555555555';
      const mutationFn = vi.fn(async (_vars: ArchiveCardVars) => ({ ok: true }));
      const builder = makeMutationOptions(mutationFn);
      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data) => data,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ cardId: 'c1', archived: true, clientMutationId: supplied });
      });
      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const vars = mutationFn.mock.calls[0]?.[0] as ArchiveCardVars;
      expect(vars.clientMutationId).toBe(supplied);
    });
  });

  // ----- Network error → rollback + onMutationError ------------------------

  describe('network error → rollback + destructive notice', () => {
    it('card.move 5xx → cache rolls back to the pre-mutation snapshot', async () => {
      const mutationFn = vi.fn(async (_vars: MoveCardVars) => {
        throw new Error('500 Internal Server Error');
      });
      const builder = makeMutationOptions(mutationFn);
      const onConflict = vi.fn();
      const onMutationError = vi.fn();
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyCardMove(data as unknown as FixCache, vars) as unknown as typeof data,
            onConflict,
            onMutationError,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0V',
        });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      const c1 = after.cards.find((c) => c.id === 'c1')!;
      expect(c1.listId).toBe('L1');
      expect(c1.position).toBe('a0');
      expect(after.cards).toEqual(before.cards);
      expect(onMutationError).toHaveBeenCalledTimes(1);
      expect(onConflict).not.toHaveBeenCalled();
    });

    it('list.move timeout → cache rolls back + onMutationError fires', async () => {
      const mutationFn = vi.fn(async (_vars: MoveListVars) => {
        throw new Error('Network timeout');
      });
      const builder = makeMutationOptions(mutationFn);
      const onMutationError = vi.fn();
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyListMove(data as unknown as FixCache, {
                listId: vars.listId,
                newPosition: vars.newPosition,
              }) as unknown as typeof data,
            onMutationError,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ boardId: 'b1', listId: 'L2', newPosition: 'l0V' });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(after.lists).toEqual(before.lists);
      expect(onMutationError).toHaveBeenCalledTimes(1);
    });

    it('card.archive error → archived card is restored to the cache', async () => {
      const mutationFn = vi.fn(async (_vars: ArchiveCardVars) => {
        throw new Error('Server down');
      });
      const builder = makeMutationOptions(mutationFn);
      const onMutationError = vi.fn();
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(before.cards.find((c) => c.id === 'c2')).toBeDefined();

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              vars.archived
                ? (applyCardArchive(data as unknown as FixCache, vars.cardId) as unknown as typeof data)
                : data,
            onMutationError,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ cardId: 'c2', archived: true });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(after.cards.find((c) => c.id === 'c2')).toBeDefined();
      expect(onMutationError).toHaveBeenCalledTimes(1);
    });
  });

  // ----- CONFLICT → rollback + invalidate + onConflict ---------------------

  describe('CONFLICT → rollback + refetch + neutral notice', () => {
    it('card.move CONFLICT: rolls back, invalidates board.get, fires onConflict', async () => {
      const mutationFn = vi.fn(async (_vars: MoveCardVars) => {
        throw conflictError();
      });
      const builder = makeMutationOptions(mutationFn);
      const onConflict = vi.fn();
      const onMutationError = vi.fn();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyCardMove(data as unknown as FixCache, vars) as unknown as typeof data,
            onConflict,
            onMutationError,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0V',
        });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(after.cards).toEqual(before.cards);
      expect(onConflict).toHaveBeenCalledTimes(1);
      expect(onMutationError).not.toHaveBeenCalled();
      // Hook calls `invalidateQueries(boardFilter)` both on CONFLICT (after
      // rollback, before `onConflict`) AND in `onSettled` — so we expect at
      // least one invalidation against the `board.get` queryKey.
      const filterCalls = invalidateSpy.mock.calls.filter(([arg]) => {
        const qk = (arg as { queryKey?: unknown[] })?.queryKey;
        return Array.isArray(qk) && qk[0] === 'board.get';
      });
      expect(filterCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('board.update CONFLICT: rolls back + onConflict (not onMutationError)', async () => {
      const mutationFn = vi.fn(async (_vars: UpdateBoardVars) => {
        throw conflictError();
      });
      const builder = makeMutationOptions(mutationFn);
      const onConflict = vi.fn();
      const onMutationError = vi.fn();
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              vars.title == null
                ? data
                : (applyBoardPatch(data as unknown as FixCache, {
                    title: vars.title,
                  }) as unknown as typeof data),
            onConflict,
            onMutationError,
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({ boardId: 'b1', title: 'Yeni başlık' });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(after.board.title).toBe(before.board.title);
      expect(onConflict).toHaveBeenCalledTimes(1);
      expect(onMutationError).not.toHaveBeenCalled();
    });
  });

  // ----- Race conditions ---------------------------------------------------

  describe('race (concurrent mutates)', () => {
    it('two card.move mutates: both apply, both finish, cache stable', async () => {
      let resolveFirst!: (v: { ok: true }) => void;
      const firstPromise = new Promise<{ ok: true }>((resolve) => {
        resolveFirst = resolve;
      });
      let resolveSecond!: (v: { ok: true }) => void;
      const secondPromise = new Promise<{ ok: true }>((resolve) => {
        resolveSecond = resolve;
      });
      const mutationFn = vi
        .fn(async (_vars: MoveCardVars) => ({ ok: true }))
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => secondPromise);
      const builder = makeMutationOptions(mutationFn);

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyCardMove(data as unknown as FixCache, vars) as unknown as typeof data,
          }),
        { wrapper: wrap(queryClient) },
      );

      // Kick off both moves — the second runs against the first's optimistic
      // cache, so both cards end up on L2 in the cache before either settles.
      await act(async () => {
        result.current.mutate({
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0V',
        });
        result.current.mutate({
          cardId: 'c2',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0W',
        });
      });

      const inFlight = queryClient.getQueryData(boardKey('b1')) as FixCache;
      const onL2 = inFlight.cards.filter((c) => c.listId === 'L2').map((c) => c.id);
      expect(onL2).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']));
      expect(mutationFn).toHaveBeenCalledTimes(2);

      // Resolve in order — first then second. After both settle, cache is stable.
      await act(async () => {
        resolveFirst({ ok: true });
        resolveSecond({ ok: true });
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.isPending).toBe(false));

      const final = queryClient.getQueryData(boardKey('b1')) as FixCache;
      const finalOnL2 = final.cards.filter((c) => c.listId === 'L2').map((c) => c.id);
      expect(finalOnL2).toEqual(expect.arrayContaining(['c1', 'c2']));
    });
  });

  // ----- Rollback exactness ------------------------------------------------

  describe('rollback exactness (no flicker)', () => {
    it('on error, cache is structurally equal to the pre-mutation snapshot', async () => {
      const mutationFn = vi.fn(async (_vars: MoveCardVars) => {
        throw new Error('boom');
      });
      const builder = makeMutationOptions(mutationFn);
      const before = queryClient.getQueryData(boardKey('b1')) as FixCache;

      const { result } = renderHook(
        () =>
          useOptimisticBoardMutation({
            mutationOptions: builder,
            boardId: 'b1',
            apply: (data, vars) =>
              applyCardMove(data as unknown as FixCache, vars) as unknown as typeof data,
            onMutationError: vi.fn(),
          }),
        { wrapper: wrap(queryClient) },
      );

      await act(async () => {
        result.current.mutate({
          cardId: 'c1',
          fromListId: 'L1',
          toListId: 'L2',
          newPosition: 'b0V',
        });
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const after = queryClient.getQueryData(boardKey('b1')) as FixCache;
      expect(after).toEqual(before);
    });
  });
});

// --- useOptimisticBoardListMutation (workspace board.list) ----------------

describe('useOptimisticBoardListMutation — failure mode', () => {
  it('network error rolls back the workspace board-list cache + injects clientMutationId', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(boardListKey('w1'), [
      { id: 'B1', title: 'Pano A', archivedAt: null },
      { id: 'B2', title: 'Pano B', archivedAt: null },
    ]);
    const before = queryClient.getQueryData(boardListKey('w1'));
    const mutationFn = vi.fn(async (_vars: CreateBoardVars) => {
      throw new Error('Network');
    });
    const builder = makeMutationOptions(mutationFn);
    const onMutationError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticBoardListMutation({
          mutationOptions: builder,
          workspaceId: 'w1',
          apply: (boards) => boards,
          onMutationError,
        }),
      { wrapper: wrap(queryClient) },
    );

    await act(async () => {
      result.current.mutate({ workspaceId: 'w1', title: 'Yeni pano' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const after = queryClient.getQueryData(boardListKey('w1'));
    expect(after).toEqual(before);
    const vars = mutationFn.mock.calls[0]?.[0] as CreateBoardVars;
    expect(vars.clientMutationId).toMatch(VALID_UUID_V4);
    expect(onMutationError).toHaveBeenCalledTimes(1);
  });
});
