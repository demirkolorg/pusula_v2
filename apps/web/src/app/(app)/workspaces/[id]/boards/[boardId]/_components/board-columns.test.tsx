import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import type { BoardCard } from './card-item';
import type { BoardList } from './list-column';

const h = vi.hoisted(() => ({ dnd: null as ReturnType<typeof makeDnd> | null }));

vi.mock('./use-board-dnd', () => ({
  useBoardDnd: () => h.dnd,
}));

vi.mock('./list-column', () => ({
  ListColumn: ({
    list,
    cards,
  }: {
    list: BoardList;
    cards: Array<{ id: string; title: string }>;
  }) => (
    <section aria-label={list.title} data-testid={`list-${list.id}`}>
      {cards.map((card) => (
        <span key={card.id}>{card.title}</span>
      ))}
    </section>
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
    icon: null,
    iconColor: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'L2',
    title: 'Devam',
    position: 'a1',
    color: null,
    icon: null,
    iconColor: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

const cards: BoardCard[] = [
  {
    id: 'C1',
    listId: 'L1',
    boardId: 'b1',
    title: 'Acil kart',
    description: null,
    position: 'a0',
    dueAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    completed: false,
    coverColor: null,
    labels: [{ labelId: 'l1', name: 'Acil', color: 'red' }],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    members: [],
  },
  {
    id: 'C2',
    listId: 'L2',
    boardId: 'b1',
    title: 'Beklemede kart',
    description: null,
    position: 'a0',
    dueAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    completed: false,
    coverColor: null,
    labels: [{ labelId: 'l2', name: 'Beklemede', color: 'blue' }],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    members: [],
  },
];

const archivedCards = [
  {
    id: 'C3',
    listId: 'L1',
    boardId: 'b1',
    title: 'Arsivli kart',
    description: null,
    position: 'a1',
    dueAt: null,
    archivedAt: new Date('2026-05-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    coverImageAttachmentId: null,
    listTitle: 'Yapilacak',
    listArchivedAt: null,
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
        selectedLabelIds={new Set()}
        showArchivedLists={false}
      />,
    );

    const placeholder = screen.getByTestId('list-drop-placeholder');
    const targetList = screen.getByTestId('list-L2');
    expect(placeholder).toHaveStyle({ width: '288px', height: '320px' });
    expect(
      Boolean(placeholder.compareDocumentPosition(targetList) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('uses external filter state and does not render a separate filter row', () => {
    h.dnd = makeDnd();

    render(
      <BoardColumns
        boardId="b1"
        board={{ role: 'member', archivedAt: null }}
        lists={lists}
        cards={cards}
        selectedLabelIds={new Set(['l1'])}
        showArchivedLists={false}
      />,
    );

    expect(screen.getByTestId('list-L1')).toHaveTextContent('Acil kart');
    expect(screen.getByTestId('list-L2')).not.toHaveTextContent('Beklemede kart');
    expect(screen.queryByText(strings.board.filter.labelsTitle)).not.toBeInTheDocument();
  });

  it('adds archived cards to their visible columns only when the card archive toggle is enabled', () => {
    h.dnd = makeDnd();

    const { rerender } = render(
      <BoardColumns
        boardId="b1"
        board={{ role: 'member', archivedAt: null }}
        lists={lists}
        cards={cards}
        selectedLabelIds={new Set()}
        showArchivedLists={false}
        showArchivedCards={false}
        archivedCards={archivedCards}
      />,
    );

    expect(screen.getByTestId('list-L1')).toHaveTextContent('Acil kart');
    expect(screen.getByTestId('list-L1')).not.toHaveTextContent('Arsivli kart');

    rerender(
      <BoardColumns
        boardId="b1"
        board={{ role: 'member', archivedAt: null }}
        lists={lists}
        cards={cards}
        selectedLabelIds={new Set()}
        showArchivedLists={false}
        showArchivedCards
        archivedCards={archivedCards}
      />,
    );

    expect(screen.getByTestId('list-L1')).toHaveTextContent('Acil kart');
    expect(screen.getByTestId('list-L1')).toHaveTextContent('Arsivli kart');
  });
});
