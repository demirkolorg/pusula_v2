'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  isChecklistItemDragData as isDrag,
  isChecklistItemDropData as isDrop,
} from './checklist-dnd';
import { planChecklistReorder, type ChecklistItemEdge } from '@/lib/checklist-reorder';

export type ChecklistReorderArgs = {
  checklistId: string;
  itemId: string;
  beforeItemId: string | undefined;
  afterItemId: string | undefined;
  newPosition: string;
  orderedIds: string[];
};

/** Drop indicator: which item gets a top/bottom line + which item is dragging. */
export type ChecklistDropIndicator = {
  /** Item id the indicator line attaches to (the drop target under the cursor). */
  itemId: string;
  edge: ChecklistItemEdge;
};

export type ChecklistDnd = {
  enabled: boolean;
  /** Item id currently being dragged (drives the source ghost styling). */
  draggingItemId: string | null;
  /** Visual-only drop line; never feeds the mutation. */
  dropIndicator: ChecklistDropIndicator | null;
  registerItem: (args: {
    element: HTMLElement;
    dragHandle: HTMLElement;
    itemId: string;
    position: string;
    /** İç içe madde ebeveyni (kök için `null`) — aynı-seviye reorder kısıtı. */
    parentItemId: string | null;
  }) => () => void;
};

/**
 * Wires Atlassian Pragmatic Drag and Drop for one checklist's items (vertical
 * list, same-checklist reorder only). No backend mutation fires *during* a drag
 * — only one `onReorder` on drop with the resolved neighbours + optimistic
 * `newPosition` (computed by the pure `planChecklistReorder`). Mirrors the board
 * `use-board-dnd` pattern (draggable + dropTargetForElements + monitorForElements
 * + attach/extractClosestEdge) scoped down to a single vertical list.
 *
 * `items` is read through a ref so the stable monitor doesn't re-register on
 * every render; the latest positions are always available at drop time.
 */
export function useChecklistDnd(opts: {
  checklistId: string;
  items: readonly { id: string; position: string; parentItemId?: string | null }[];
  enabled: boolean;
  onReorder: (args: ChecklistReorderArgs) => void;
}): ChecklistDnd {
  const { checklistId, enabled, onReorder } = opts;

  const itemsRef = useRef(opts.items);
  itemsRef.current = opts.items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<ChecklistDropIndicator | null>(null);

  const clearIndicator = useCallback(() => {
    setDropIndicator((current) => (current == null ? current : null));
  }, []);

  const showIndicator = useCallback((next: ChecklistDropIndicator) => {
    setDropIndicator((current) =>
      current?.itemId === next.itemId && current.edge === next.edge ? current : next,
    );
  }, []);

  // --- Global monitor (scoped to this checklist via checklistId on payloads) ---
  useEffect(() => {
    if (!enabled) return;
    return monitorForElements({
      canMonitor: ({ source }) =>
        isDrag(source.data) && source.data.checklistId === checklistId,
      onDragStart: ({ source }) => {
        if (isDrag(source.data)) setDraggingItemId(source.data.itemId);
        clearIndicator();
      },
      onDrag: ({ source, location }) => {
        if (!isDrag(source.data)) return;
        const target = location.current.dropTargets[0];
        if (!target) {
          clearIndicator();
          return;
        }
        const td = target.data;
        if (
          !isDrop(td) ||
          td.checklistId !== checklistId ||
          td.itemId === source.data.itemId ||
          // Aynı-seviye reorder: farklı ebeveyndeki maddeye drop göstergesi çizme.
          td.parentItemId !== source.data.parentItemId
        ) {
          clearIndicator();
          return;
        }
        const edge: ChecklistItemEdge = extractClosestEdge(td) === 'top' ? 'top' : 'bottom';
        showIndicator({ itemId: td.itemId, edge });
      },
      onDrop: ({ source, location }) => {
        setDraggingItemId(null);
        clearIndicator();
        if (!isDrag(source.data)) return;
        const target = location.current.dropTargets[0];
        if (!target) return;
        const td = target.data;
        if (!isDrop(td) || td.checklistId !== checklistId) return;
        // Aynı-seviye reorder: hedef, sürüklenenle aynı ebeveynde değilse no-op.
        if (td.parentItemId !== source.data.parentItemId) return;
        const edge: ChecklistItemEdge = extractClosestEdge(td) === 'top' ? 'top' : 'bottom';
        // Plan yalnız aynı kardeş grubu (aynı `parentItemId`) içinde hesaplanır —
        // komşular ve `newPosition` yalnız o gruptan türetilir; diğer seviyeler
        // etkilenmez.
        const siblingParent = source.data.parentItemId;
        const siblings = itemsRef.current.filter(
          (i) => (i.parentItemId ?? null) === siblingParent,
        );
        const plan = planChecklistReorder({
          items: siblings,
          movedItemId: source.data.itemId,
          targetItemId: td.itemId,
          edge,
        });
        if (!plan) return;
        onReorderRef.current({
          checklistId,
          itemId: source.data.itemId,
          beforeItemId: plan.beforeItemId,
          afterItemId: plan.afterItemId,
          newPosition: plan.newPosition,
          orderedIds: plan.orderedIds,
        });
      },
    });
  }, [enabled, checklistId, clearIndicator, showIndicator]);

  const registerItem = useCallback<ChecklistDnd['registerItem']>(
    ({ element, dragHandle, itemId, position, parentItemId }) => {
      if (!enabled) return () => {};
      return combine(
        draggable({
          element,
          dragHandle,
          getInitialData: () => ({
            type: 'checklist-item',
            checklistId,
            itemId,
            position,
            parentItemId,
          }),
          // Default native drag bitmap is fine for a simple text row; no custom
          // portal needed (unlike the board card with its rich preview).
        }),
        dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            isDrag(source.data) &&
            source.data.checklistId === checklistId &&
            source.data.itemId !== itemId &&
            // Aynı-seviye reorder: yalnız aynı ebeveyndeki maddeler birbirine hedef.
            source.data.parentItemId === parentItemId,
          getData: ({ input, element: el }) =>
            attachClosestEdge(
              { type: 'checklist-item', checklistId, itemId, position, parentItemId },
              { element: el, input, allowedEdges: ['top', 'bottom'] },
            ),
          getIsSticky: () => true,
        }),
      );
    },
    [enabled, checklistId],
  );

  return useMemo(
    () => ({ enabled, draggingItemId, dropIndicator, registerItem }),
    [enabled, draggingItemId, dropIndicator, registerItem],
  );
}
