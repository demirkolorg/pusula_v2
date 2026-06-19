'use client';

import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { toast } from '@pusula/ui';
import { useTRPC } from '@/trpc/client';
import { strings } from '@/lib/strings';
import { applyCardMove, applyListMove, useOptimisticBoardMutation } from '@/lib/board-cache';
import { useQuickNoteConvert } from '@/lib/use-quick-note-convert';
import {
  planCardMove,
  planCardMoveToListEnd,
  planListMove,
  planListMoveByOne,
  planQuickNoteConvert,
  type CardEdge,
  type ColumnEdge,
} from './board-dnd-position';
import {
  isCardDragData,
  isCardDropData,
  isListCardsDropData,
  isListDragData,
  isListDropData,
  isQuickNoteDragData,
  type BoardDragState,
} from './board-dnd-types';
import { CardDragPreview } from './card-drag-preview';
import type { BoardCard } from './card-item';

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
  onDraggingChange: (dragging: boolean, options?: { settleUntilCacheUpdate?: boolean }) => void;
  /**
   * Latest card data for the drag preview (DEM-87). Read once at drag start so
   * the preview always reflects the current card without forcing the leaf to
   * re-register on every prop change.
   */
  getCard: () => BoardCard;
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

const BOARD_SURFACE_CSS_VARS = [
  '--board-list-bg',
  '--board-list-bg-hover',
  '--board-list-border',
  '--board-list-add-bg',
  '--board-list-add-bg-hover',
  '--board-list-archived-bg',
  '--board-card-bg',
] as const;

function copyBoardSurfaceVars(source: HTMLElement, target: HTMLElement) {
  const computed = window.getComputedStyle(source);
  for (const name of BOARD_SURFACE_CSS_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) target.style.setProperty(name, value);
    else target.style.removeProperty(name);
  }
}

export function renderLiftedPreview({
  container,
  element,
  kind,
}: {
  container: HTMLElement;
  element: HTMLElement;
  kind: 'card' | 'list';
}) {
  const rect = element.getBoundingClientRect();
  const clone = element.cloneNode(true) as HTMLElement;

  copyBoardSurfaceVars(element, container);
  container.style.width = `${rect.width}px`;
  container.style.height = `${rect.height}px`;
  container.style.pointerEvents = 'none';

  clone.removeAttribute('data-dragging');
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.boxSizing = 'border-box';
  clone.style.opacity = '1';
  clone.style.pointerEvents = 'none';
  clone.style.transformOrigin = kind === 'card' ? '55% 35%' : '50% 18%';
  clone.style.transform = kind === 'card' ? 'rotate(2deg)' : 'rotate(1deg)';
  clone.style.boxShadow = kind === 'card' ? 'none' : 'var(--shadow-drag)';
  clone.style.borderColor = 'var(--board-list-border)';
  if (kind === 'card') clone.style.background = 'var(--card)';

  for (const interactive of clone.querySelectorAll('button, input, textarea, [role="button"]')) {
    if (interactive instanceof HTMLElement) interactive.style.pointerEvents = 'none';
  }

  container.appendChild(clone);
  return () => clone.remove();
}

/**
 * Body-portal drag preview controller for cards (DEM-87). The HTML5 drag-image
 * bitmap path (`setCustomNativeDragPreview`) leaks alpha / shadow / rotated-
 * corner artefacts that no amount of inline styling fixed. Instead we hide the
 * native drag image (`disableNativeDragPreview`) and keep a *live* React tree
 * portal pinned to the cursor — same approach as the legacy Pusula's dnd-kit
 * `DragOverlay`, just expressed against Pragmatic DnD's primitives.
 *
 * The portal is a single body-attached element with `position: fixed` whose
 * `transform: translate(...)` is updated imperatively from the global
 * `monitorForElements` `onDrag` callback (no React state on the hot path → no
 * board-wide re-render per pointer frame).
 */
export function createCardDragOverlayController() {
  let el: HTMLDivElement | null = null;
  let root: Root | null = null;
  let pointerOffset = { x: 0, y: 0 };

  function ensureEl(): HTMLDivElement {
    if (el) return el;
    const node = document.createElement('div');
    node.style.position = 'fixed';
    node.style.top = '0';
    node.style.left = '0';
    node.style.zIndex = '9999';
    node.style.pointerEvents = 'none';
    node.style.willChange = 'transform';
    document.body.appendChild(node);
    el = node;
    root = createRoot(node);
    return node;
  }

  function applyTransform(clientX: number, clientY: number) {
    if (!el) return;
    el.style.transform = `translate(${clientX - pointerOffset.x}px, ${clientY - pointerOffset.y}px)`;
  }

  return {
    show(card: BoardCard, sourceElement: HTMLElement, input: { clientX: number; clientY: number }) {
      const sourceRect = sourceElement.getBoundingClientRect();
      pointerOffset = {
        x: input.clientX - sourceRect.left,
        y: input.clientY - sourceRect.top,
      };
      ensureEl();
      copyBoardSurfaceVars(sourceElement, el!);
      applyTransform(input.clientX, input.clientY);
      flushSync(() => {
        root!.render(createElement(CardDragPreview, { card, width: sourceRect.width }));
      });
    },
    update(input: { clientX: number; clientY: number }) {
      applyTransform(input.clientX, input.clientY);
    },
    hide(options?: { deferUnmount?: boolean }) {
      const rootToUnmount = root;
      const elToRemove = el;
      root = null;
      el = null;
      if (!rootToUnmount && !elToRemove) return;

      if (options?.deferUnmount) {
        if (elToRemove) elToRemove.style.display = 'none';
        queueMicrotask(() => {
          rootToUnmount?.unmount();
          elToRemove?.remove();
        });
        return;
      }

      rootToUnmount?.unmount();
      elToRemove?.remove();
    },
  };
}

/**
 * Wires Atlassian Pragmatic Drag and Drop on the board screen (Phase 3B —
 * DEM-43; migrated to `useOptimisticBoardMutation` in Phase 4C — DEM-80).
 * Column reorder, card reorder (within a list) and card cross-list moves
 * (same board). No backend mutation fires *during* a drag — only one
 * `card.move` / `list.move` on drop. The shared optimistic hook takes the
 * `board.get` cache snapshot, applies the pure `applyCardMove`/`applyListMove`
 * transform, rolls back on error, refetches on `CONFLICT`, and surfaces a
 * neutral / destructive toast — the same UX Phase 3B drag-drop had, now
 * sourced from the common hook so every board mutation in Phase 4 shares it.
 *
 * Returns an `enabled` flag, the current `dragState`, a `boardStripRef`
 * (attach to the columns container for horizontal auto-scroll), and three
 * registrar functions the column/card components call from their own
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

  // Latest data, read inside the (stable) monitor callbacks.
  const listsRef = useRef(opts.lists);
  const cardsRef = useRef(opts.cards);
  listsRef.current = opts.lists;
  cardsRef.current = opts.cards;

  const [dragState, setDragState] = useState<BoardDragState>({ kind: 'idle' });
  const [cardPlaceholder, setCardPlaceholder] = useState<CardDropPlaceholder | null>(null);
  const [listPlaceholder, setListPlaceholder] = useState<ListDropPlaceholder | null>(null);
  const draggedCardHeightRef = useRef<number | null>(null);
  const settlingCardDropRef = useRef<{
    cardId: string;
    toListId: string;
    newPosition: string;
  } | null>(null);
  const draggedListSizeRef = useRef<{ width: number | null; height: number | null }>({
    width: null,
    height: null,
  });

  const boardStripElRef = useRef<HTMLElement | null>(null);
  const boardStripRef = useCallback((el: HTMLElement | null) => {
    boardStripElRef.current = el;
  }, []);

  // --- Card drag-overlay portal (DEM-87) ----------------------------------
  // Lazy: controller is created on first drag and torn down on hook unmount.
  const cardOverlayRef = useRef<ReturnType<typeof createCardDragOverlayController> | null>(null);
  const cardOverlay = useCallback(() => {
    if (!cardOverlayRef.current) {
      cardOverlayRef.current = createCardDragOverlayController();
    }
    return cardOverlayRef.current;
  }, []);
  useEffect(() => {
    return () => {
      cardOverlayRef.current?.hide();
      cardOverlayRef.current = null;
    };
  }, []);

  // --- Optimistic move mutations (shared hook — Phase 4C / DEM-80) ---------
  const onConflict = useCallback(() => {
    toast(strings.board.conflict.refreshed);
  }, []);
  const onMutationError = useCallback(() => {
    toast.error(strings.board.optimistic.error);
  }, []);

  const cardMove = useOptimisticBoardMutation({
    mutationOptions: trpc.card.move.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.newPosition == null
        ? data
        : applyCardMove(data, {
            cardId: vars.cardId,
            toListId: vars.toListId,
            newPosition: vars.newPosition,
          }),
    onConflict,
    onMutationError,
  });

  const listMove = useOptimisticBoardMutation({
    mutationOptions: trpc.list.move.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.newPosition == null
        ? data
        : applyListMove(data, { listId: vars.listId, newPosition: vars.newPosition }),
    onConflict,
    onMutationError,
  });

  // Hızlı Not → kart dönüşümü (DEM-205). Panelden sürüklenen bir not bir pano
  // listesine bırakılınca tetiklenir; `quickNote.convertToCard` mutation'ı.
  const quickNoteConvert = useQuickNoteConvert(boardId);

  // Keep stable refs so the monitor effect doesn't re-register on every render.
  const cardMoveRef = useRef(cardMove);
  const listMoveRef = useRef(listMove);
  const quickNoteConvertRef = useRef(quickNoteConvert);
  cardMoveRef.current = cardMove;
  listMoveRef.current = listMove;
  quickNoteConvertRef.current = quickNoteConvert;

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

  const resolveCardDropPlan = useCallback(
    (
      sourceData: Record<string | symbol, unknown>,
      target: { data: Record<string | symbol, unknown> } | undefined,
    ) => {
      if (!isCardDragData(sourceData) || !target) return null;
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
        return null;
      }

      if (!isListActive(toListId)) return null;
      return planCardMove({
        cardId: sourceData.cardId,
        fromListId: sourceData.fromListId,
        toListId,
        targetCardId,
        edge,
        cardsByListId,
      });
    },
    [isListActive, cardsByListId],
  );

  /**
   * Resolve where a dragged quick note (DEM-205) would convert to a card —
   * which list + the before/after neighbours. `null` when the target isn't a
   * card / list-cards drop zone or the target list is archived.
   */
  const resolveQuickNoteDropPlan = useCallback(
    (target: { data: Record<string | symbol, unknown> } | undefined) => {
      if (!target) return null;
      const td = target.data;
      let toListId: string;
      let targetCardId: string | null = null;
      let edge: CardEdge = 'bottom';
      if (isCardDropData(td)) {
        toListId = td.listId;
        targetCardId = td.cardId;
        edge = extractClosestEdge(td) === 'top' ? 'top' : 'bottom';
      } else if (isListCardsDropData(td)) {
        toListId = td.listId;
      } else {
        return null;
      }
      if (!isListActive(toListId)) return null;
      return {
        toListId,
        targetCardId,
        edge,
        plan: planQuickNoteConvert({ toListId, targetCardId, edge, cardsByListId }),
      };
    },
    [isListActive, cardsByListId],
  );

  const finishSettlingCardDrop = useCallback(() => {
    settlingCardDropRef.current = null;
    draggedCardHeightRef.current = null;
    clearCardPlaceholder();
    cardOverlay().hide({ deferUnmount: true });
  }, [clearCardPlaceholder, cardOverlay]);

  useLayoutEffect(() => {
    const pending = settlingCardDropRef.current;
    if (!pending) return;
    const moved = opts.cards.find((c) => c.id === pending.cardId);
    if (moved?.listId === pending.toListId && moved.position === pending.newPosition) {
      finishSettlingCardDrop();
    }
  }, [opts.cards, finishSettlingCardDrop]);

  const moveCardToListEnd = useCallback(
    (cardId: string, fromListId: string, toListId: string) => {
      if (!enabled || !isListActive(toListId)) return;
      const plan = planCardMoveToListEnd({ cardId, fromListId, toListId, cardsByListId });
      if (!plan) return;
      cardMoveRef.current.mutate({
        cardId: plan.cardId,
        fromListId: plan.fromListId,
        toListId: plan.toListId,
        beforeCardId: plan.beforeCardId ?? undefined,
        afterCardId: plan.afterCardId ?? undefined,
        newPosition: plan.newPosition ?? undefined,
      });
    },
    [enabled, isListActive, cardsByListId],
  );

  const moveColumnByOne = useCallback(
    (listId: string, direction: 'left' | 'right') => {
      if (!enabled) return;
      const plan = planListMoveByOne({ listId, direction, lists: listsForPlan() });
      if (!plan) return;
      listMoveRef.current.mutate({
        boardId,
        listId: plan.listId,
        beforeListId: plan.beforeListId ?? undefined,
        afterListId: plan.afterListId ?? undefined,
        newPosition: plan.newPosition ?? undefined,
      });
    },
    [enabled, boardId, listsForPlan],
  );

  // --- Global monitor + board-strip auto-scroll ----------------------------
  useEffect(() => {
    if (!enabled) return;
    const cleanups = [
      monitorForElements({
        canMonitor: ({ source }) =>
          isCardDragData(source.data) ||
          isListDragData(source.data) ||
          isQuickNoteDragData(source.data),
        onDragStart: ({ source }) => {
          const data = source.data;
          settlingCardDropRef.current = null;
          clearCardPlaceholder();
          clearListPlaceholder();
          if (isQuickNoteDragData(data)) {
            // The quick note carries its own native drag preview (panel row);
            // no board-card ghost height to track.
            draggedCardHeightRef.current = null;
            draggedListSizeRef.current = { width: null, height: null };
            setDragState({ kind: 'quick-note', noteId: data.noteId });
            return;
          }
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

          // Quick note drag (DEM-205) — reuse the card drop placeholder so the
          // user sees exactly where the converted card will land.
          if (isQuickNoteDragData(source.data)) {
            const resolved = resolveQuickNoteDropPlan(location.current.dropTargets[0]);
            if (!resolved) {
              clearCardPlaceholder();
              return;
            }
            const targetEl = location.current.dropTargets[0]?.element;
            const targetHeight =
              targetEl instanceof HTMLElement ? targetEl.getBoundingClientRect().height : 0;
            showCardPlaceholder({
              listId: resolved.toListId,
              targetCardId: resolved.targetCardId,
              edge: resolved.edge,
              height: targetHeight > 0 ? targetHeight : null,
            });
            return;
          }

          if (!isCardDragData(source.data)) {
            return;
          }
          // DEM-87: keep the body-portal preview pinned to the cursor.
          cardOverlay().update(location.current.input);
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
              if (
                lastCard &&
                location.current.input.clientY <= lastCard.getBoundingClientRect().bottom
              ) {
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
            target.element instanceof HTMLElement
              ? target.element.getBoundingClientRect().height
              : 0;
          showCardPlaceholder({
            listId: toListId,
            targetCardId,
            edge,
            height: draggedCardHeightRef.current ?? (targetHeight > 0 ? targetHeight : null),
          });
        },
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0];
          // --- Card drop ---
          if (isCardDragData(source.data)) {
            const plan = resolveCardDropPlan(source.data, target);
            setDragState({ kind: 'idle' });
            clearListPlaceholder();
            draggedListSizeRef.current = { width: null, height: null };
            if (!plan) {
              settlingCardDropRef.current = null;
              clearCardPlaceholder();
              draggedCardHeightRef.current = null;
              cardOverlay().hide();
              return;
            }
            if (plan.newPosition == null) {
              settlingCardDropRef.current = null;
              clearCardPlaceholder();
              draggedCardHeightRef.current = null;
              cardOverlay().hide();
            } else {
              settlingCardDropRef.current = {
                cardId: plan.cardId,
                toListId: plan.toListId,
                newPosition: plan.newPosition,
              };
            }
            cardMoveRef.current.mutate({
              cardId: plan.cardId,
              fromListId: plan.fromListId,
              toListId: plan.toListId,
              beforeCardId: plan.beforeCardId ?? undefined,
              afterCardId: plan.afterCardId ?? undefined,
              newPosition: plan.newPosition ?? undefined,
            });
            return;
          }

          // --- Quick note drop (DEM-205) → convert to a card at the drop spot ---
          if (isQuickNoteDragData(source.data)) {
            const resolved = resolveQuickNoteDropPlan(target);
            setDragState({ kind: 'idle' });
            clearCardPlaceholder();
            clearListPlaceholder();
            draggedCardHeightRef.current = null;
            if (resolved) {
              quickNoteConvertRef.current.convert({
                noteId: source.data.noteId,
                listId: resolved.plan.toListId,
                beforeCardId: resolved.plan.beforeCardId,
                afterCardId: resolved.plan.afterCardId,
                newPosition: resolved.plan.newPosition ?? undefined,
              });
            }
            return;
          }

          setDragState({ kind: 'idle' });
          settlingCardDropRef.current = null;
          clearCardPlaceholder();
          clearListPlaceholder();
          draggedCardHeightRef.current = null;
          draggedListSizeRef.current = { width: null, height: null };
          cardOverlay().hide();
          if (!target) return;

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
              newPosition: plan.newPosition ?? undefined,
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
    cardOverlay,
    resolveCardDropPlan,
    resolveQuickNoteDropPlan,
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
          // DEM-87: bypass the HTML5 drag-image bitmap entirely. The body
          // portal in `cardOverlay()` is the *real* preview; any visible
          // browser drag image would just stack on top.
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            disableNativeDragPreview({ nativeSetDragImage });
          },
          onDragStart: ({ source, location }) => {
            args.onDraggingChange(true);
            cardOverlay().show(args.getCard(), source.element, location.current.input);
          },
          onDrop: ({ source, location }) => {
            const willMove = resolveCardDropPlan(source.data, location.current.dropTargets[0]);
            args.onDraggingChange(
              false,
              willMove?.newPosition != null ? { settleUntilCacheUpdate: true } : undefined,
            );
            if (!willMove || willMove.newPosition == null) cardOverlay().hide();
          },
        }),
      ];
      if (isDropTarget) {
        cleanups.push(
          dropTargetForElements({
            element,
            // Cards accept other cards (not themselves) and quick notes
            // dragged from the panel (DEM-205 — convert-to-card).
            canDrop: ({ source }) =>
              (isCardDragData(source.data) && source.data.cardId !== cardId) ||
              isQuickNoteDragData(source.data),
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
    [enabled, cardOverlay, resolveCardDropPlan],
  );

  const registerListCardsArea = useCallback(
    (args: RegisterListCardsAreaArgs): (() => void) => {
      if (!enabled) return () => {};
      const { element, listId } = args;
      return dropTargetForElements({
        element,
        // The end-of-list zone accepts a moved card or a quick note (DEM-205).
        canDrop: ({ source }) =>
          (isCardDragData(source.data) || isQuickNoteDragData(source.data)) &&
          isListActive(listId),
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
          onGenerateDragPreview: ({ nativeSetDragImage, location, source }) => {
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: preserveOffsetOnSource({
                element: source.element,
                input: location.current.input,
              }),
              render: ({ container }) =>
                renderLiftedPreview({ container, element: source.element, kind: 'list' }),
            });
          },
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
  // useCallback-stable; only dragState, placeholders, and enabled change at
  // runtime. Errors surface via toast (Phase 4C — DEM-80), not state.
  return useMemo(
    () => ({
      enabled,
      dragState,
      cardPlaceholder,
      listPlaceholder,
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
      boardStripRef,
      registerCard,
      registerListCardsArea,
      registerColumn,
      moveCardToListEnd,
      moveColumnByOne,
    ],
  );
}
