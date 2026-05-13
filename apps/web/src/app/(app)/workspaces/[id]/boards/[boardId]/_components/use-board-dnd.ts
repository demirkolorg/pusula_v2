'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useTRPC } from '@/trpc/client';
import { strings } from '@/lib/strings';
import { applyCardMoveToBoardCache, applyListMoveToBoardCache } from './board-dnd-cache';
import {
  planCardMove,
  planCardMoveToListEnd,
  planListMove,
  planListMoveByOne,
  type CardEdge,
  type ColumnEdge,
} from './board-dnd-position';
import {
  isCardDragData,
  isCardDropData,
  isListCardsDropData,
  isListDragData,
  isListDropData,
  type BoardDragState,
} from './board-dnd-types';

/** Minimal list shape the hook needs from `board.get`. */
type DndList = { id: string; position: string; archivedAt: Date | string | null };
/** Minimal card shape the hook needs from `board.get`. */
type DndCard = { id: string; listId: string; position: string };

type RegisterCardArgs = {
  element: HTMLElement;
  cardId: string;
  listId: string;
  position: string;
  /**
   * Whether the card should also be a drop target. A card in an *archived* list
   * is draggable (you can move it *out*) but not a drop target (nothing may be
   * dropped *onto* it / into its list). Defaults to `true`.
  */
  isDropTarget?: boolean;
  onDraggingChange: (dragging: boolean) => void;
};

type RegisterListCardsAreaArgs = {
  element: HTMLElement;
  listId: string;
};

type RegisterColumnArgs = {
  element: HTMLElement;
  dragHandle: HTMLElement;
  listId: string;
  position: string;
  onDraggingChange: (dragging: boolean) => void;
};

/** Rollback context returned from `onMutate` and consumed by `onError`. */
type MoveRollback = { previous: [readonly unknown[], unknown][] };

export type CardDropPlaceholder = {
  listId: string;
  targetCardId: string | null;
  edge: CardEdge;
  height: number | null;
};

export type ListDropPlaceholder = {
  targetListId: string;
  edge: ColumnEdge;
  width: number | null;
  height: number | null;
};

export type BoardDnd = {
  /** Whether drag-and-drop is active (board `member+` and the board is not archived). */
  enabled: boolean;
  /** What's currently being dragged (drives ghost styling). */
  dragState: BoardDragState;
  /** Visual-only card drop target marker; never feeds the move mutation. */
  cardPlaceholder: CardDropPlaceholder | null;
  /** Visual-only list drop target marker; never feeds the move mutation. */
  listPlaceholder: ListDropPlaceholder | null;
  /** A move failed mid-flight; a low-noise message to surface. `null` when clear. */
  error: string | null;
  clearError: () => void;
  registerCard: (args: RegisterCardArgs) => () => void;
  registerListCardsArea: (args: RegisterListCardsAreaArgs) => () => void;
  registerColumn: (args: RegisterColumnArgs) => () => void;
  /**
   * Imperative move for the accessible ⋮ menus (keyboard / mobile): append the
   * card to the end of `toListId` (a no-op if it's already last there). Same
   * optimistic+rollback path as a drag.
   */
  moveCardToListEnd: (cardId: string, fromListId: string, toListId: string) => void;
  /**
   * Imperative move for the column ⋮ menu: shift the list past its immediate
   * neighbour in the given direction (a no-op at the edge).
   */
  moveColumnByOne: (listId: string, direction: 'left' | 'right') => void;
};

const isConflict = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'data' in err &&
  typeof (err as { data?: { code?: unknown } }).data === 'object' &&
  (err as { data?: { code?: unknown } }).data?.code === 'CONFLICT';

/**
 * Wires Atlassian Pragmatic Drag and Drop on the board screen (Phase 3B —
 * DEM-43): column reorder, card reorder (within a list) and card cross-list
 * moves (same board). No backend mutation fires *during* a drag — only one
 * `card.move` / `list.move` on drop, optimistic against the `board.get` cache
 * with rollback on error and `invalidate`+refetch on settle (full normalized
 * cache is Phase 4). On `CONFLICT` (the card moved out from under us) it rolls
 * back, refetches the board, and surfaces a "moved by someone else" notice.
 *
 * Returns an `enabled` flag, the current `dragState`, an `error` channel, a
 * `boardStripRef` (attach to the columns container for horizontal auto-scroll),
 * and three registrar functions the column/card components call from their own
 * `useEffect`s (each returns a cleanup) — so the hook can stay in one place
 * (`BoardColumns`) and the leaf components don't each own a mutation.
 */
export function useBoardDnd(opts: {
  boardId: string;
  lists: DndList[];
  cards: DndCard[];
  enabled: boolean;
}): BoardDnd & { boardStripRef: (el: HTMLElement | null) => void } {
  const { boardId, enabled } = opts;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Latest data, read inside the (stable) monitor callbacks.
  const listsRef = useRef(opts.lists);
  const cardsRef = useRef(opts.cards);
  listsRef.current = opts.lists;
  cardsRef.current = opts.cards;

  const [dragState, setDragState] = useState<BoardDragState>({ kind: 'idle' });
  const [cardPlaceholder, setCardPlaceholder] = useState<CardDropPlaceholder | null>(null);
  const [listPlaceholder, setListPlaceholder] = useState<ListDropPlaceholder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const draggedCardHeightRef = useRef<number | null>(null);
  const draggedListSizeRef = useRef<{ width: number | null; height: number | null }>({
    width: null,
    height: null,
  });

  const boardStripElRef = useRef<HTMLElement | null>(null);
  const boardStripRef = useCallback((el: HTMLElement | null) => {
    boardStripElRef.current = el;
  }, []);

  // --- Optimistic move mutations -------------------------------------------
  const boardFilter = trpc.board.get.queryFilter({ boardId });

  const snapshotAndCancel = useCallback(async (): Promise<MoveRollback> => {
    await queryClient.cancelQueries(boardFilter);
    return { previous: queryClient.getQueriesData(boardFilter) };
  }, [queryClient, boardFilter]);

  const rollback = useCallback(
    (ctx: MoveRollback | undefined) => {
      if (!ctx) return;
      for (const [key, data] of ctx.previous) queryClient.setQueryData(key, data);
    },
    [queryClient],
  );

  const cardMove = useMutation(
    trpc.card.move.mutationOptions({
      onMutate: async (vars): Promise<MoveRollback> => {
        setError(null);
        const ctx = await snapshotAndCancel();
        queryClient.setQueriesData(boardFilter, (data: unknown) =>
          data == null
            ? data
            : applyCardMoveToBoardCache(data as Parameters<typeof applyCardMoveToBoardCache>[0], {
                cardId: vars.cardId,
                toListId: vars.toListId,
                newPosition: vars.newPosition!,
              }),
        );
        return ctx;
      },
      onError: async (err, _vars, ctx) => {
        rollback(ctx);
        if (isConflict(err)) {
          await queryClient.invalidateQueries(boardFilter);
          setError(strings.board.dnd.conflict);
        } else {
          setError(strings.board.dnd.error);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries(boardFilter);
      },
    }),
  );

  const listMove = useMutation(
    trpc.list.move.mutationOptions({
      onMutate: async (vars): Promise<MoveRollback> => {
        setError(null);
        const ctx = await snapshotAndCancel();
        queryClient.setQueriesData(boardFilter, (data: unknown) =>
          data == null
            ? data
            : applyListMoveToBoardCache(data as Parameters<typeof applyListMoveToBoardCache>[0], {
                listId: vars.listId,
                newPosition: vars.newPosition!,
              }),
        );
        return ctx;
      },
      onError: (_err, _vars, ctx) => {
        rollback(ctx);
        setError(strings.board.dnd.error);
      },
      onSettled: async () => {
        await queryClient.invalidateQueries(boardFilter);
      },
    }),
  );

  // Keep stable refs so the monitor effect doesn't re-register on every render.
  const cardMoveRef = useRef(cardMove);
  const listMoveRef = useRef(listMove);
  cardMoveRef.current = cardMove;
  listMoveRef.current = listMove;

  // --- Stable helpers used by the monitor + imperative moves --------------
  const isListActive = useCallback(
    (listId: string) => listsRef.current.some((l) => l.id === listId && l.archivedAt == null),
    [],
  );
  const cardsByListId = useCallback(
    (listId: string) =>
      cardsRef.current
        .filter((c) => c.listId === listId)
        .map((c) => ({ id: c.id, position: c.position })),
    [],
  );
  const listsForPlan = useCallback(
    () => listsRef.current.map((l) => ({ id: l.id, position: l.position })),
    [],
  );

  const clearCardPlaceholder = useCallback(() => {
    setCardPlaceholder((current) => (current == null ? current : null));
  }, []);

  const showCardPlaceholder = useCallback((next: CardDropPlaceholder) => {
    setCardPlaceholder((current) =>
      current?.listId === next.listId &&
      current.targetCardId === next.targetCardId &&
      current.edge === next.edge &&
      current.height === next.height
        ? current
        : next,
    );
  }, []);

  const clearListPlaceholder = useCallback(() => {
    setListPlaceholder((current) => (current == null ? current : null));
  }, []);

  const showListPlaceholder = useCallback((next: ListDropPlaceholder) => {
    setListPlaceholder((current) =>
      current?.targetListId === next.targetListId &&
      current.edge === next.edge &&
      current.width === next.width &&
      current.height === next.height
        ? current
        : next,
    );
  }, []);

  const moveCardToListEnd = useCallback(
    (cardId: string, fromListId: string, toListId: string) => {
      if (!enabled || !isListActive(toListId)) return;
      const plan = planCardMoveToListEnd({ cardId, fromListId, toListId, cardsByListId });
      if (!plan) return;
      setError(null);
      cardMoveRef.current.mutate({
        cardId: plan.cardId,
        fromListId: plan.fromListId,
        toListId: plan.toListId,
        beforeCardId: plan.beforeCardId ?? undefined,
        afterCardId: plan.afterCardId ?? undefined,
        newPosition: plan.newPosition,
        clientMutationId: crypto.randomUUID(),
      });
    },
    [enabled, isListActive, cardsByListId],
  );

  const moveColumnByOne = useCallback(
    (listId: string, direction: 'left' | 'right') => {
      if (!enabled) return;
      const plan = planListMoveByOne({ listId, direction, lists: listsForPlan() });
      if (!plan) return;
      setError(null);
      listMoveRef.current.mutate({
        boardId,
        listId: plan.listId,
        beforeListId: plan.beforeListId ?? undefined,
        afterListId: plan.afterListId ?? undefined,
        newPosition: plan.newPosition,
        clientMutationId: crypto.randomUUID(),
      });
    },
    [enabled, boardId, listsForPlan],
  );

  // --- Global monitor + board-strip auto-scroll ----------------------------
  useEffect(() => {
    if (!enabled) return;
    const cleanups = [
      monitorForElements({
        canMonitor: ({ source }) => isCardDragData(source.data) || isListDragData(source.data),
        onDragStart: ({ source }) => {
          const data = source.data;
          clearCardPlaceholder();
          clearListPlaceholder();
          if (isCardDragData(data)) {
            const height = source.element.getBoundingClientRect().height;
            draggedCardHeightRef.current = height > 0 ? height : null;
            draggedListSizeRef.current = { width: null, height: null };
            setDragState({ kind: 'card', cardId: data.cardId, fromListId: data.fromListId });
          } else if (isListDragData(data)) {
            draggedCardHeightRef.current = null;
            const rect = source.element.getBoundingClientRect();
            draggedListSizeRef.current = {
              width: rect.width > 0 ? rect.width : null,
              height: rect.height > 0 ? rect.height : null,
            };
            setDragState({ kind: 'list', listId: data.listId });
          }
        },
        onDrag: ({ source, location }) => {
          if (isListDragData(source.data)) {
            clearCardPlaceholder();
            const target = location.current.dropTargets[0];
            if (!target) {
              clearListPlaceholder();
              return;
            }
            const targetData = target.data;
            if (!isListDropData(targetData)) {
              clearListPlaceholder();
              return;
            }
            const edge: ColumnEdge = extractClosestEdge(targetData) === 'left' ? 'left' : 'right';
            const plan = planListMove({
              listId: source.data.listId,
              targetListId: targetData.listId,
              edge,
              lists: listsForPlan(),
            });
            if (!plan) {
              clearListPlaceholder();
              return;
            }
            showListPlaceholder({
              targetListId: targetData.listId,
              edge,
              width: draggedListSizeRef.current.width,
              height: draggedListSizeRef.current.height,
            });
            return;
          }

          clearListPlaceholder();
          if (!isCardDragData(source.data)) {
            return;
          }
          const target = location.current.dropTargets[0];
          if (!target) {
            clearCardPlaceholder();
            return;
          }

          const dragged = source.data;
          const td = target.data;
          let toListId: string;
          let targetCardId: string | null;
          let edge: CardEdge = 'bottom';
          if (isCardDropData(td)) {
            toListId = td.listId;
            targetCardId = td.cardId;
            edge = extractClosestEdge(td) === 'top' ? 'top' : 'bottom';
          } else if (isListCardsDropData(td)) {
            toListId = td.listId;
            targetCardId = null;
            if (target.element instanceof HTMLElement) {
              const cardElements = Array.from(
                target.element.querySelectorAll<HTMLElement>('[data-board-card-id]'),
              ).filter((el) => el.dataset.boardCardId !== dragged.cardId);
              const lastCard = cardElements[cardElements.length - 1];
              if (lastCard && location.current.input.clientY <= lastCard.getBoundingClientRect().bottom) {
                setCardPlaceholder((current) => (current?.listId === toListId ? current : null));
                return;
              }
            }
          } else {
            clearCardPlaceholder();
            return;
          }
          if (!isListActive(toListId)) {
            clearCardPlaceholder();
            return;
          }
          const plan = planCardMove({
            cardId: dragged.cardId,
            fromListId: dragged.fromListId,
            toListId,
            targetCardId,
            edge,
            cardsByListId,
          });
          if (!plan) {
            clearCardPlaceholder();
            return;
          }

          const targetHeight =
            target.element instanceof HTMLElement ? target.element.getBoundingClientRect().height : 0;
          showCardPlaceholder({
            listId: toListId,
            targetCardId,
            edge,
            height: draggedCardHeightRef.current ?? (targetHeight > 0 ? targetHeight : null),
          });
        },
        onDrop: ({ source, location }) => {
          setDragState({ kind: 'idle' });
          clearCardPlaceholder();
          clearListPlaceholder();
          draggedCardHeightRef.current = null;
          draggedListSizeRef.current = { width: null, height: null };
          const target = location.current.dropTargets[0];
          if (!target) return;

          // --- Card drop ---
          if (isCardDragData(source.data)) {
            const dragged = source.data;
            const td = target.data;
            let toListId: string;
            let targetCardId: string | null;
            let edge: CardEdge = 'bottom';
            if (isCardDropData(td)) {
              toListId = td.listId;
              targetCardId = td.cardId;
              edge = extractClosestEdge(td) === 'top' ? 'top' : 'bottom';
            } else if (isListCardsDropData(td)) {
              toListId = td.listId;
              targetCardId = null;
            } else {
              return;
            }
            if (!isListActive(toListId)) return; // can't drop into an archived list
            const plan = planCardMove({
              cardId: dragged.cardId,
              fromListId: dragged.fromListId,
              toListId,
              targetCardId,
              edge,
              cardsByListId,
            });
            if (!plan) return; // dropped where it already is
            cardMoveRef.current.mutate({
              cardId: plan.cardId,
              fromListId: plan.fromListId,
              toListId: plan.toListId,
              beforeCardId: plan.beforeCardId ?? undefined,
              afterCardId: plan.afterCardId ?? undefined,
              newPosition: plan.newPosition,
              clientMutationId: crypto.randomUUID(),
            });
            return;
          }

          // --- Column drop ---
          if (isListDragData(source.data)) {
            const dragged = source.data;
            const td = target.data;
            if (!isListDropData(td)) return;
            const edge: ColumnEdge = extractClosestEdge(td) === 'left' ? 'left' : 'right';
            const plan = planListMove({
              listId: dragged.listId,
              targetListId: td.listId,
              edge,
              lists: listsForPlan(),
            });
            if (!plan) return;
            listMoveRef.current.mutate({
              boardId,
              listId: plan.listId,
              beforeListId: plan.beforeListId ?? undefined,
              afterListId: plan.afterListId ?? undefined,
              newPosition: plan.newPosition,
              clientMutationId: crypto.randomUUID(),
            });
          }
        },
      }),
    ];
    if (boardStripElRef.current) {
      cleanups.push(autoScrollForElements({ element: boardStripElRef.current }));
    }
    return combine(...cleanups);
  }, [
    enabled,
    boardId,
    isListActive,
    cardsByListId,
    listsForPlan,
    clearCardPlaceholder,
    clearListPlaceholder,
    showCardPlaceholder,
    showListPlaceholder,
  ]);

  // --- Registrars (called from each column/card component's effect) --------
  const registerCard = useCallback(
    (args: RegisterCardArgs): (() => void) => {
      if (!enabled) return () => {};
      const { element, cardId, listId, position, isDropTarget = true } = args;
      const cleanups = [
        draggable({
          element,
          getInitialData: () => ({ type: 'card', cardId, fromListId: listId, position }),
          onDragStart: () => args.onDraggingChange(true),
          onDrop: () => args.onDraggingChange(false),
        }),
      ];
      if (isDropTarget) {
        cleanups.push(
          dropTargetForElements({
            element,
            canDrop: ({ source }) => isCardDragData(source.data) && source.data.cardId !== cardId,
            getData: ({ input, element: el }) =>
              attachClosestEdge(
                { type: 'card', cardId, listId, position },
                { element: el, input, allowedEdges: ['top', 'bottom'] },
              ),
            getIsSticky: () => true,
          }),
        );
      }
      return combine(...cleanups);
    },
    [enabled],
  );

  const registerListCardsArea = useCallback(
    (args: RegisterListCardsAreaArgs): (() => void) => {
      if (!enabled) return () => {};
      const { element, listId } = args;
      return dropTargetForElements({
        element,
        canDrop: ({ source }) => isCardDragData(source.data) && isListActive(listId),
        getData: () => ({ type: 'list-cards', listId }),
        getIsSticky: () => true,
      });
    },
    [enabled, isListActive],
  );

  const registerColumn = useCallback(
    (args: RegisterColumnArgs): (() => void) => {
      if (!enabled) return () => {};
      const { element, dragHandle, listId, position } = args;
      return combine(
        draggable({
          element,
          dragHandle,
          getInitialData: () => ({ type: 'list', listId, position }),
          onDragStart: () => args.onDraggingChange(true),
          onDrop: () => args.onDraggingChange(false),
        }),
        dropTargetForElements({
          element,
          canDrop: ({ source }) => isListDragData(source.data) && source.data.listId !== listId,
          getData: ({ input, element: el }) =>
            attachClosestEdge(
              { type: 'list', listId, position },
              { element: el, input, allowedEdges: ['left', 'right'] },
            ),
          getIsSticky: () => true,
        }),
      );
    },
    [enabled],
  );

  // Memoize the context value so leaf component effects don't tear down and
  // re-create their Pragmatic DnD registrations on every parent re-render.
  // The stable callbacks (registerCard, registerColumn, etc.) are already
  // useCallback-stable; only dragState, error, and enabled change at runtime.
  return useMemo(
    () => ({
      enabled,
      dragState,
      cardPlaceholder,
      listPlaceholder,
      error,
      clearError,
      boardStripRef,
      registerCard,
      registerListCardsArea,
      registerColumn,
      moveCardToListEnd,
      moveColumnByOne,
    }),
    [
      enabled,
      dragState,
      cardPlaceholder,
      listPlaceholder,
      error,
      clearError,
      boardStripRef,
      registerCard,
      registerListCardsArea,
      registerColumn,
      moveCardToListEnd,
      moveColumnByOne,
    ],
  );
}
