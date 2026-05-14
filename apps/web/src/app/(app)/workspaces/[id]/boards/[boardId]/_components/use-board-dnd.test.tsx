import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardCard } from './card-item';

const h = vi.hoisted(() => ({
  root: { render: vi.fn(), unmount: vi.fn() },
  createRoot: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: h.createRoot,
}));

vi.mock('react-dom', () => ({
  flushSync: (fn: () => void) => fn(),
}));

import { createCardDragOverlayController } from './use-board-dnd';

const card: BoardCard = {
  id: 'card1',
  listId: 'list1',
  boardId: 'board1',
  title: 'Kart A',
  description: null,
  position: 'a0',
  dueAt: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  completed: false,
  coverColor: null,
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
  commentCount: 0,
  members: [],
};

describe('createCardDragOverlayController', () => {
  beforeEach(() => {
    h.root.render.mockReset();
    h.root.unmount.mockReset();
    h.createRoot.mockReset();
    h.createRoot.mockReturnValue(h.root);
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('can hide visually now but defer React root unmount until after the current commit', async () => {
    const source = document.createElement('article');
    source.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 240,
        height: 56,
        right: 250,
        bottom: 76,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    const overlay = createCardDragOverlayController();
    overlay.show(card, source, { clientX: 20, clientY: 30 });

    (overlay.hide as (options: { deferUnmount: boolean }) => void)({ deferUnmount: true });

    expect(h.root.unmount).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(h.root.unmount).toHaveBeenCalledTimes(1);
  });
});
