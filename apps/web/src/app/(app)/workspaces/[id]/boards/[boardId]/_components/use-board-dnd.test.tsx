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

import { createCardDragOverlayController, renderLiftedPreview } from './use-board-dnd';

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

  it('copies board surface variables onto the card drag portal', () => {
    const source = document.createElement('article');
    source.style.setProperty('--board-card-bg', 'oklch(0.22 0.01 250)');
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

    const portal = document.body.firstElementChild as HTMLElement;
    expect(portal.style.getPropertyValue('--board-card-bg')).toBe('oklch(0.22 0.01 250)');
  });

  it('copies board surface variables onto the lifted list preview container', () => {
    const source = document.createElement('section');
    source.style.setProperty('--board-list-bg', 'oklch(0.26 0.03 275)');
    source.style.setProperty('--board-list-border', 'oklch(0.38 0.02 275)');
    source.style.setProperty('--board-card-bg', 'oklch(0.22 0.01 250)');
    source.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 288,
        height: 240,
        right: 288,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const container = document.createElement('div');
    renderLiftedPreview({ container, element: source, kind: 'list' });

    expect(container.style.getPropertyValue('--board-list-bg')).toBe('oklch(0.26 0.03 275)');
    expect(container.style.getPropertyValue('--board-list-border')).toBe('oklch(0.38 0.02 275)');
    expect(container.style.getPropertyValue('--board-card-bg')).toBe('oklch(0.22 0.01 250)');
  });
});
