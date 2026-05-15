/**
 * Optimistic mutation hooks for the board screen (Phase 4 — DEM-79 + DEM-80).
 *
 * `useOptimisticBoardMutation` standardises the lifecycle from
 * `05-board-mekanigi.md` §5.2 for **board detail** (`board.get`) mutations:
 *
 *   onMutate:   cancel `board.get`, snapshot all matching cache rows,
 *               apply the caller's pure cache transform.
 *   onError:    rollback the snapshot; on CONFLICT also invalidate +
 *               refetch the board and call `onConflict` (neutral notice);
 *               otherwise call `onMutationError` (destructive notice).
 *   onSettled:  invalidate `board.get` (and `card.get` if the caller
 *               supplied a `cardId`).
 *
 * `clientMutationId` (UUID v4) is injected into the variables automatically
 * when the caller calls `.mutate(...)` / `.mutateAsync(...)`, so call sites
 * never sprinkle `crypto.randomUUID()` per mutation. If the caller already
 * set one (e.g. for tests / replays), it's kept as-is.
 *
 * `useOptimisticBoardListMutation` is the sibling for **workspace board
 * list** (`board.list({ workspaceId })`) mutations — `board.create` /
 * `board.update` / `board.archive` triggered from the workspace screen.
 * Same lifecycle, different cache filter and snapshot shape.
 *
 * Both hooks consume tRPC's `<procedure>.mutationOptions` builder
 * structurally, so any board/list/card collaborative mutation plugs in
 * without naming each.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import {
  addInFlightClientMutationId,
  removeInFlightClientMutationId,
} from '@/lib/realtime/in-flight-store';
import { useBoardCacheKeys } from './keys';
import type { BoardCache, BoardSummary, CardDetailCache } from './types';

/** Rollback context returned from `onMutate` and consumed by `onError`. */
export type OptimisticRollback = {
  /** All matching `board.get` entries before the optimistic patch. */
  previous: [readonly unknown[], unknown][];
  /** Snapshot of the `card.get` cache, when `applyCardDetail` is provided. */
  cardDetail?: [readonly unknown[], unknown][];
};

/** Rollback context for the workspace-board-list hook. */
export type OptimisticBoardListRollback = {
  previous: [readonly unknown[], unknown][];
};

function isConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'data' in err &&
    typeof (err as { data?: { code?: unknown } }).data === 'object' &&
    (err as { data?: { code?: unknown } }).data?.code === 'CONFLICT'
  );
}

/**
 * tRPC's `.mutationOptions(...)` signature — accepts a `useMutation` options
 * bag and returns a (possibly enriched) options bag. We keep it structural so
 * the hook accepts any board/list/card mutation builder without naming each.
 */
type MutationOptionsBuilderLike = (options: never) => unknown;

type MutationOptionsVars<TBuilder> = TBuilder extends (
  options: UseMutationOptions<infer _TData, infer _TError, infer TVars, infer _TContext>,
) => unknown
  ? TVars & { clientMutationId?: string }
  : { clientMutationId?: string };

type MutationOptionsData<TBuilder> = TBuilder extends (
  options: UseMutationOptions<infer TData, infer _TError, infer _TVars, infer _TContext>,
) => unknown
  ? TData
  : unknown;

/**
 * Wrap a tRPC mutation in the standard optimistic lifecycle against
 * `board.get` (and optionally `card.get`). Use this for every board/list/card
 * collaborative mutation that affects the board screen — see `05-board-mekanigi.md`
 * §5.2 for the per-mutation `apply` callback contract.
 */
export type UseOptimisticBoardMutationArgs<TBuilder extends MutationOptionsBuilderLike> = {
  /** tRPC procedure's `mutationOptions` (e.g. `trpc.card.update.mutationOptions`). */
  mutationOptions: TBuilder;
  /** Board whose cache is patched + invalidated. */
  boardId: string;
  /**
   * If set, `card.get` for this id is also invalidated on settle (for mutations
   * that affect a single card detail, e.g. `card.update` / `card.complete`).
   * Can be a function of the vars when the id isn't known at hook setup.
   */
  cardId?: string | ((vars: MutationOptionsVars<TBuilder>) => string | undefined);
  /**
   * Pure cache transform applied in `onMutate` to the `board.get` cache.
   * Receives the current cache and the mutation vars; returns the patched cache
   * (same reference if no-op).
   */
  apply: (data: BoardCache, vars: MutationOptionsVars<TBuilder>) => BoardCache;
  /**
   * Optional patch for the `card.get` cache too — used by the card-detail
   * modal so an in-flight `card.update` / `card.complete` flips the modal
   * fields optimistically (the board chip already flips via `apply`). Pass
   * the same `cardId` argument so the hook can locate the right card cache.
   */
  applyCardDetail?: (data: CardDetailCache, vars: MutationOptionsVars<TBuilder>) => CardDetailCache;
  /**
   * Called on `CONFLICT` after rollback + refetch. Place to show the neutral
   * "moved by someone else / reloaded" toast (`strings.board.conflict.*`).
   */
  onConflict?: (err: unknown, vars: MutationOptionsVars<TBuilder>) => void;
  /**
   * Called on any non-`CONFLICT` error after rollback. Place to show the
   * destructive toast (`strings.board.optimistic.error`).
   */
  onMutationError?: (err: unknown, vars: MutationOptionsVars<TBuilder>) => void;
  /**
   * Called once the mutation resolves successfully (after the cache reconcile).
   * Useful for closing inline editors / dialogs that owned the mutation.
   */
  onMutationSuccess?: (
    data: MutationOptionsData<TBuilder>,
    vars: MutationOptionsVars<TBuilder>,
  ) => void | Promise<void>;
};

/**
 * Wraps a tRPC mutation in the standard optimistic lifecycle. 4C calls this
 * once per collaborative mutation (card/list/board create/update/move/
 * archive/etc.) instead of restating onMutate/onError/onSettled each time.
 *
 * The returned object exposes the same `useMutation` surface (`mutate` /
 * `mutateAsync` / `isPending` / `error` / `reset` / ...) but `mutate` /
 * `mutateAsync` are wrapped so the caller's vars get a `clientMutationId`
 * injected automatically (when absent).
 */
export function useOptimisticBoardMutation<TBuilder extends MutationOptionsBuilderLike>(
  args: UseOptimisticBoardMutationArgs<TBuilder>,
) {
  type TVars = MutationOptionsVars<TBuilder>;
  type TData = MutationOptionsData<TBuilder>;

  const queryClient = useQueryClient();
  const cacheKeys = useBoardCacheKeys();
  const {
    boardId,
    apply,
    applyCardDetail,
    cardId,
    onConflict,
    onMutationError,
    onMutationSuccess,
    mutationOptions,
  } = args;

  const boardFilter = useMemo(() => cacheKeys.board(boardId), [cacheKeys, boardId]);

  const resolveCardId = useCallback(
    (vars: TVars): string | undefined => {
      if (typeof cardId === 'function') return cardId(vars);
      return cardId;
    },
    [cardId],
  );

  const onMutate = useCallback(
    async (vars: TVars): Promise<OptimisticRollback> => {
      // Phase 5C — track the in-flight `clientMutationId` so the realtime
      // listener can echo-skip our own server-side acknowledgement.
      if (vars.clientMutationId) addInFlightClientMutationId(vars.clientMutationId);
      await queryClient.cancelQueries(boardFilter);
      const previous = queryClient.getQueriesData(boardFilter);
      queryClient.setQueriesData<BoardCache>(boardFilter, (data) =>
        data == null ? data : apply(data, vars),
      );
      let cardDetail: [readonly unknown[], unknown][] | undefined;
      if (applyCardDetail) {
        const id = resolveCardId(vars);
        if (id) {
          const cardFilter = cacheKeys.card(id);
          await queryClient.cancelQueries(cardFilter);
          cardDetail = queryClient.getQueriesData(cardFilter);
          queryClient.setQueriesData<CardDetailCache>(cardFilter, (data) =>
            data == null ? data : applyCardDetail(data, vars),
          );
        } else if (process.env.NODE_ENV !== 'production') {
          // Faz 4 review fix (W1 DEM-80): `applyCardDetail` opsiyonel + `cardId`
          // de opsiyonel. Caller `applyCardDetail` verir ama `cardId`/var resolver
          // bir id döndürmezse modal `card.get` cache'i sessizce patch'lenmez.
          // Dev ortamında uyarı ver — production'da yutulur (sessiz fail
          // beklenenden gerçekten farklı değil; warn yalnız dev rehberi).
          console.warn(
            '[useOptimisticBoardMutation] applyCardDetail provided but cardId could not be resolved; card.get cache will not receive the optimistic patch.',
          );
        }
      }
      return { previous, cardDetail };
    },
    [queryClient, boardFilter, apply, applyCardDetail, cacheKeys, resolveCardId],
  );

  const onError = useCallback(
    async (err: unknown, vars: TVars, ctx: OptimisticRollback | undefined) => {
      if (ctx) {
        for (const [key, data] of ctx.previous) queryClient.setQueryData(key, data);
        if (ctx.cardDetail) {
          for (const [key, data] of ctx.cardDetail) queryClient.setQueryData(key, data);
        }
      }
      if (isConflict(err)) {
        await queryClient.invalidateQueries(boardFilter);
        onConflict?.(err, vars);
      } else {
        onMutationError?.(err, vars);
      }
    },
    [queryClient, boardFilter, onConflict, onMutationError],
  );

  const onSettled = useCallback(
    async (_data: TData | undefined, _err: unknown, vars: TVars) => {
      if (vars.clientMutationId) removeInFlightClientMutationId(vars.clientMutationId);
      await queryClient.invalidateQueries(boardFilter);
      const id = resolveCardId(vars);
      if (id) await queryClient.invalidateQueries(cacheKeys.card(id));
    },
    [queryClient, boardFilter, cacheKeys, resolveCardId],
  );

  const onSuccess = useCallback(
    async (data: TData, vars: TVars) => {
      await onMutationSuccess?.(data, vars);
    },
    [onMutationSuccess],
  );

  const buildMutationOptions = mutationOptions as unknown as (
    options: UseMutationOptions<TData, unknown, TVars, OptimisticRollback>,
  ) => unknown;
  const mutation = useMutation<TData, unknown, TVars, OptimisticRollback>(
    buildMutationOptions({ onMutate, onError, onSettled, onSuccess }) as UseMutationOptions<
      TData,
      unknown,
      TVars,
      OptimisticRollback
    >,
  );

  return wrapWithClientMutationId(mutation);
}

/**
 * Optional patch over a workspace board-list cache row (the rare case where
 * the caller wants to surface server-assigned fields, e.g. computed counts).
 * Most callers pass `apply` only.
 */
export type UseOptimisticBoardListMutationArgs<TBuilder extends MutationOptionsBuilderLike> = {
  mutationOptions: TBuilder;
  /** Workspace whose board list cache is patched + invalidated. */
  workspaceId: string;
  /** Pure transform over the workspace's `BoardSummary[]` cache. */
  apply: (
    boards: readonly BoardSummary[],
    vars: MutationOptionsVars<TBuilder>,
  ) => readonly BoardSummary[];
  onConflict?: (err: unknown, vars: MutationOptionsVars<TBuilder>) => void;
  onMutationError?: (err: unknown, vars: MutationOptionsVars<TBuilder>) => void;
  onMutationSuccess?: (
    data: MutationOptionsData<TBuilder>,
    vars: MutationOptionsVars<TBuilder>,
  ) => void | Promise<void>;
};

/**
 * Sibling of `useOptimisticBoardMutation` for the workspace screen's board
 * list (`board.list({ workspaceId })`). Same lifecycle / `clientMutationId`
 * injection — only the cache filter and snapshot shape differ.
 */
export function useOptimisticBoardListMutation<TBuilder extends MutationOptionsBuilderLike>(
  args: UseOptimisticBoardListMutationArgs<TBuilder>,
) {
  type TVars = MutationOptionsVars<TBuilder>;
  type TData = MutationOptionsData<TBuilder>;

  const queryClient = useQueryClient();
  const cacheKeys = useBoardCacheKeys();
  const { workspaceId, apply, onConflict, onMutationError, onMutationSuccess, mutationOptions } =
    args;

  const boardsFilter = useMemo(() => cacheKeys.boards(workspaceId), [cacheKeys, workspaceId]);

  const onMutate = useCallback(
    async (vars: TVars): Promise<OptimisticBoardListRollback> => {
      if (vars.clientMutationId) addInFlightClientMutationId(vars.clientMutationId);
      await queryClient.cancelQueries(boardsFilter);
      const previous = queryClient.getQueriesData(boardsFilter);
      queryClient.setQueriesData<readonly BoardSummary[]>(boardsFilter, (data) =>
        data == null ? data : apply(data, vars),
      );
      return { previous };
    },
    [queryClient, boardsFilter, apply],
  );

  const onError = useCallback(
    async (err: unknown, vars: TVars, ctx: OptimisticBoardListRollback | undefined) => {
      if (ctx) {
        for (const [key, data] of ctx.previous) queryClient.setQueryData(key, data);
      }
      if (isConflict(err)) {
        await queryClient.invalidateQueries(boardsFilter);
        onConflict?.(err, vars);
      } else {
        onMutationError?.(err, vars);
      }
    },
    [queryClient, boardsFilter, onConflict, onMutationError],
  );

  const onSettled = useCallback(
    async (_data: TData | undefined, _err: unknown, vars: TVars) => {
      if (vars.clientMutationId) removeInFlightClientMutationId(vars.clientMutationId);
      await queryClient.invalidateQueries(boardsFilter);
    },
    [queryClient, boardsFilter],
  );

  const onSuccess = useCallback(
    async (data: TData, vars: TVars) => {
      await onMutationSuccess?.(data, vars);
    },
    [onMutationSuccess],
  );

  const buildMutationOptions = mutationOptions as unknown as (
    options: UseMutationOptions<TData, unknown, TVars, OptimisticBoardListRollback>,
  ) => unknown;
  const mutation = useMutation<TData, unknown, TVars, OptimisticBoardListRollback>(
    buildMutationOptions({ onMutate, onError, onSettled, onSuccess }) as UseMutationOptions<
      TData,
      unknown,
      TVars,
      OptimisticBoardListRollback
    >,
  );

  return wrapWithClientMutationId(mutation);
}

/**
 * Inject a `clientMutationId` (UUID v4) when the caller hasn't set one. Tiny
 * helper so 4C call sites read `cardMove.mutate(withClientMutationId(vars))`
 * instead of sprinkling `crypto.randomUUID()` everywhere. The field stays
 * optional on the wire (server-side parse `z.string().uuid().optional()`),
 * but every UI mutation in scope of Phase 4 produces one.
 *
 * Exported now so 4D (DEM-81) failure tests can import it from the public
 * surface and assert the regex; consumers don't typically call this directly
 * — `useOptimistic{Board,BoardList}Mutation` wrap their `mutate` /
 * `mutateAsync` with this automatically.
 */
export function withClientMutationId<TVars extends { clientMutationId?: string }>(
  vars: TVars,
): TVars & { clientMutationId: string } {
  return {
    ...vars,
    clientMutationId: vars.clientMutationId ?? crypto.randomUUID(),
  };
}

/**
 * Read `.message` off a mutation's `error` without spreading `unknown` casts
 * across UI call sites. The optimistic hooks pin `TError = unknown` so the
 * tRPC error shape doesn't leak into the hook's signature — components use
 * this helper to surface a human-readable string in inline alerts. Returns
 * `null` when the mutation isn't currently errored.
 */
export function getMutationErrorMessage(mutation: {
  isError: boolean;
  error: unknown;
}): string | null {
  if (!mutation.isError) return null;
  const err = mutation.error;
  if (
    err != null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return null;
}

/**
 * Wrap a `useMutation` result so `mutate` / `mutateAsync` inject a
 * `clientMutationId` automatically. Internal helper used by both optimistic
 * hooks; not exported.
 *
 * Faz 4 review fix (W2 DEM-80): React Query'nin result objesi `Object.assign`
 * ile **yerinde mutate edilmez** — yeni bir obje döner. React Query bu objeyi
 * internal observer cache'iyle paylaşabiliyor; yerinde mutation observer leak
 * riski yaratırdı.
 */
function wrapWithClientMutationId<TData, TError, TVars extends { clientMutationId?: string }, TCtx>(
  mutation: ReturnType<typeof useMutation<TData, TError, TVars, TCtx>>,
): ReturnType<typeof useMutation<TData, TError, TVars, TCtx>> {
  const originalMutate = mutation.mutate;
  const originalMutateAsync = mutation.mutateAsync;
  const wrappedMutate = ((vars: TVars, options?: Parameters<typeof originalMutate>[1]) =>
    originalMutate(withClientMutationId(vars), options)) as typeof originalMutate;
  const wrappedMutateAsync = ((
    vars: TVars,
    options?: Parameters<typeof originalMutateAsync>[1],
  ) => originalMutateAsync(withClientMutationId(vars), options)) as typeof originalMutateAsync;
  return { ...mutation, mutate: wrappedMutate, mutateAsync: wrappedMutateAsync };
}
