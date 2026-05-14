import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCard } from './card-item';
import type { BoardList } from './list-column';

const h = vi.hoisted(() => ({ dnd: null as ReturnType<typeof makeDnd> | null }));

vi.mock('./use-board-dnd', () => ({
  useBoardDnd: () => h.dnd,
}));

vi.mock('./list-column', () => ({
  ListColumn: ({ list }: { list: BoardList }) => (
    <section aria-label={list.title} data-testid={`list-${list.id}`} />
  ),
}));

vi.mock('./add-list-column', () => ({
  AddListColumn: () => <div data-testid="add-list-column" />,
}));

import { BoardColumns } from './board-columns';

function makeDnd(over = {}) {
  return {
    enabled: true,
    dragState: { kind: 'idle' as const },
    cardPlaceholder: null,
    listPlaceholder: null,
    error: null,
    clearError: vi.fn(),
    boardStripRef: vi.fn(),
    registerCard: () => () => {},
    registerListCardsArea: () => () => {},
    registerColumn: () => () => {},
    moveCardToListEnd: vi.fn(),
    moveColumnByOne: vi.fn(),
    ...over,
  };
}

const lists: BoardList[] = [
  {
    id: 'L1',
    title: 'Yapilacak',
    position: 'a0',
    color: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'L2',
    title: 'Devam',
    position: 'a1',
    color: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

describe('<BoardColumns>', () => {
  it('renders the list drop placeholder before the hovered target list', () => {
    h.dnd = makeDnd({
      dragState: { kind: 'list', listId: 'L1' },
      listPlaceholder: { targetListId: 'L2', edge: 'left', width: 288, height: 320 },
    });

    render(
      <BoardColumns
        boardId="b1"
        board={{ role: 'member', archivedAt: null }}
        lists={lists}
        cards={[] as BoardCard[]}
      />,
    );

    const placeholder = screen.getByTestId('list-drop-placeholder');
    const targetList = screen.getByTestId('list-L2');
    expect(placeholder).toHaveStyle({ width: '288px', height: '320px' });
    expect(
      Boolean(placeholder.compareDocumentPosition(targetList) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });
});
