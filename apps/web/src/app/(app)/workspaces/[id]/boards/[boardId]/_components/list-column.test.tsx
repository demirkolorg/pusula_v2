import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Hoisted mocks shared by the factories below.
const h = vi.hoisted(() => ({ mutate: vi.fn(), invalidateQueries: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    list: {
      update: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
    },
    card: {
      update: { mutationOptions: (o: unknown) => o },
      create: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
      complete: { mutationOptions: (o: unknown) => o },
      uncomplete: { mutationOptions: (o: unknown) => o },
      get: { queryFilter: () => ({}) },
      members: {
        add: { mutationOptions: (o: unknown) => o },
        remove: { mutationOptions: (o: unknown) => o },
        list: { queryFilter: () => ({}) },
      },
      labels: {
        add: { mutationOptions: (o: unknown) => o },
        remove: { mutationOptions: (o: unknown) => o },
        list: { queryFilter: () => ({}) },
      },
    },
    board: { get: { queryFilter: () => ({}) } },
    attachment: { createUpload: { mutationOptions: (o: unknown) => o } },
  }),
}));

import { ListColumn, type BoardList } from './list-column';
import { type BoardCard } from './card-item';
import { BoardDndProvider } from './board-dnd-context';
import type { BoardDnd } from './use-board-dnd';

const columnCopy = strings.board.column;

const list: BoardList = {
  id: 'l1',
  title: 'Yapılacak',
  position: 'a0',
  color: null,
  icon: null,
  iconColor: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const archivedList: BoardList = {
  ...list,
  id: 'l2',
  title: 'Eski',
  archivedAt: new Date('2026-04-01'),
};

const card = (id: string, title: string): BoardCard => ({
  id,
  listId: 'l1',
  boardId: 'b1',
  title,
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
});

const makeDnd = (over: Partial<BoardDnd> = {}): BoardDnd => ({
  enabled: true,
  dragState: { kind: 'idle' },
  cardPlaceholder: null,
  listPlaceholder: null,
  registerCard: () => () => {},
  registerListCardsArea: () => () => {},
  registerColumn: () => () => {},
  moveCardToListEnd: vi.fn(),
  moveColumnByOne: vi.fn(),
  ...over,
});

describe('<ListColumn>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.invalidateQueries.mockReset();
  });

  it('renders the list title and the card count', () => {
    render(
      <ListColumn
        boardId="b1"
        list={list}
        cards={[card('c1', 'Bir'), card('c2', 'İki')]}
        canEdit={false}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Yapılacak' })).toBeInTheDocument();
    expect(screen.getByText(`2 ${columnCopy.cardCount}`)).toBeInTheDocument();
  });

  it('viewer (canEdit=false): no "⋮" menu, no add-card form', () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit={false} />);
    expect(screen.queryByRole('button', { name: columnCopy.more })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: columnCopy.addList })).not.toBeInTheDocument();
  });

  it('editor: the "⋮" menu offers rename and archive', async () => {
    const user = userEvent.setup();
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit />);
    await user.click(screen.getByRole('button', { name: columnCopy.more }));
    expect(
      await screen.findByRole('menuitem', { name: columnCopy.menuRename }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: strings.board.list.colorPicker.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: strings.board.list.iconPicker.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: columnCopy.menuArchive })).toBeInTheDocument();
  });

  it('renders a list icon with the selected icon colour', () => {
    render(
      <ListColumn
        boardId="b1"
        list={{ ...list, icon: 'star', iconColor: 'mavi' }}
        cards={[]}
        canEdit
      />,
    );

    const icon = screen.getByTestId('list-icon-star');
    expect(icon).toHaveClass('text-palet-mavi');
  });

  it('renders a coloured list as a stable surface with a palette accent', () => {
    render(<ListColumn boardId="b1" list={{ ...list, color: 'mavi' }} cards={[]} canEdit />);

    const column = screen.getByRole('region', { name: list.title });
    expect(column).toHaveClass('bg-[color:var(--board-list-bg)]');
    expect(column).toHaveClass('border-[color:var(--board-list-border)]');
    expect(column).not.toHaveClass('bg-palet-mavi');
    expect(column.querySelector('[data-list-accent]')).toHaveClass('bg-palet-mavi');
    expect(column.querySelector('header')).toHaveClass('text-card-foreground');
  });

  it('editor can rename the list inline by clicking the title', async () => {
    const user = userEvent.setup();
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit />);

    await user.click(screen.getByRole('button', { name: list.title }));
    const input = screen.getByLabelText(columnCopy.renamePlaceholder);
    await user.clear(input);
    await user.type(input, 'Devam Eden');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith(
      {
        boardId: 'b1',
        listId: 'l1',
        title: 'Devam Eden',
        clientMutationId: expect.any(String),
      },
      undefined,
    );
  });

  it('an archived list is read-only: shows the archived label, no add-card form, "⋮" offers restore', async () => {
    const user = userEvent.setup();
    render(<ListColumn boardId="b1" list={archivedList} cards={[]} canEdit />);
    // header shows the archived title but no add-card form footer
    expect(screen.getByRole('heading', { name: 'Eski' })).toBeInTheDocument();
    expect(screen.queryByLabelText(strings.board.card.addCardPlaceholder)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: columnCopy.more }));
    expect(
      await screen.findByRole('menuitem', { name: columnCopy.menuRestore }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: columnCopy.menuRename })).not.toBeInTheDocument();
  });

  it('shows the empty hint when the list has no cards', () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit={false} />);
    expect(screen.getByText(columnCopy.empty)).toBeInTheDocument();
  });

  it('renders a card drop placeholder before the hovered target card', () => {
    const dnd = makeDnd({
      dragState: { kind: 'card', cardId: 'c1', fromListId: 'l1' },
      cardPlaceholder: { listId: 'l1', targetCardId: 'c2', edge: 'top', height: 52 },
    });
    render(
      <BoardDndProvider value={dnd}>
        <ListColumn
          boardId="b1"
          list={list}
          cards={[card('c1', 'One'), card('c2', 'Two')]}
          canEdit
        />
      </BoardDndProvider>,
    );

    const placeholder = screen.getByTestId('card-drop-placeholder');
    const targetCard = screen.getByRole('button', { name: 'Two' });
    expect(placeholder).toHaveStyle({ height: '52px' });
    expect(
      Boolean(placeholder.compareDocumentPosition(targetCard) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('collapses into a narrow summary that hides cards and no longer accepts card drops', async () => {
    const user = userEvent.setup();
    const cleanupCardsArea = vi.fn();
    const dnd = makeDnd({
      registerColumn: vi.fn(() => vi.fn()),
      registerListCardsArea: vi.fn(() => cleanupCardsArea),
    });

    render(
      <BoardDndProvider value={dnd}>
        <ListColumn boardId="b1" list={list} cards={[card('c1', 'One')]} canEdit />
      </BoardDndProvider>,
    );

    await user.click(screen.getByRole('button', { name: columnCopy.collapse }));

    const column = screen.getByRole('region', { name: list.title });
    expect(column).toHaveClass('w-10');
    expect(screen.queryByRole('button', { name: 'One' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: strings.board.card.addCard }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: columnCopy.expand })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const latestColumnRegistration = vi.mocked(dnd.registerColumn).mock.calls.at(-1)?.[0];
    expect(latestColumnRegistration?.listId).toBe(list.id);
    expect(latestColumnRegistration?.dragHandle.isConnected).toBe(true);
    expect(cleanupCardsArea).toHaveBeenCalledTimes(1);
  });

  it('expands a collapsed list and re-enables the card drop area', async () => {
    const user = userEvent.setup();
    const cleanupCardsArea = vi.fn();
    const dnd = makeDnd({
      registerListCardsArea: vi.fn(() => cleanupCardsArea),
    });

    render(
      <BoardDndProvider value={dnd}>
        <ListColumn boardId="b1" list={list} cards={[card('c1', 'One')]} canEdit />
      </BoardDndProvider>,
    );

    await user.click(screen.getByRole('button', { name: columnCopy.collapse }));
    await user.click(screen.getByRole('button', { name: columnCopy.expand }));

    expect(screen.getByRole('button', { name: 'One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.board.card.addCard })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: columnCopy.collapse })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(dnd.registerListCardsArea).toHaveBeenCalledTimes(2);
  });
});
