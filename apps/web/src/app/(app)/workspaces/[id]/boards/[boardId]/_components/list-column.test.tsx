import { fireEvent, render, screen } from '@testing-library/react';
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
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
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
      delete: { mutationOptions: (o: unknown) => o },
    },
    card: {
      update: { mutationOptions: (o: unknown) => o },
      create: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
      delete: { mutationOptions: (o: unknown) => o },
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
    attachment: {
      // Faz 11B (DEM-148) — list-column transitively renders card-item which
      // wires the full attachment surface (initiate + commit + getDownloadUrl
      // + list/update/delete).
      initiate: { mutationOptions: (o: unknown) => o },
      commit: { mutationOptions: (o: unknown) => o },
      list: { mutationOptions: (o: unknown) => o, queryOptions: () => ({}) },
      update: { mutationOptions: (o: unknown) => o },
      delete: { mutationOptions: (o: unknown) => o },
      getDownloadUrl: { queryOptions: () => ({}) },
    },
    // Faz 9D (DEM-130) — card-item context menüsü ShareDialog'u render ediyor.
    share: {
      list: { queryOptions: () => ({}), queryKey: () => ['share', 'list'] },
      create: { mutationOptions: (o: unknown) => o },
      revoke: { mutationOptions: (o: unknown) => o },
    },
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
    // Daralt tercihi localStorage'de list.id bazında saklandığından testler arası
    // sızıntı olmaması için temizle (aksi halde bir testin daralttığı l1, sonraki
    // testte daraltılmış başlar).
    window.localStorage.clear();
  });

  it('renders the list title without a header card count', () => {
    render(
      <ListColumn
        boardId="b1"
        list={list}
        cards={[card('c1', 'Bir'), card('c2', 'İki')]}
        canEdit={false}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Yapılacak' })).toHaveClass('text-[15px]');
    expect(screen.queryByText(`2 ${columnCopy.cardCount}`)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bir' }).parentElement).toHaveClass('pt-1');
  });

  it('keeps the add-card button hidden until the list is hovered or focused', () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit />);

    const column = screen.getByRole('region', { name: list.title });
    const addCardButton = screen.getByRole('button', { name: strings.board.card.addCard });

    expect(column).toHaveClass('group/list');
    expect(addCardButton).toHaveClass('opacity-0');
    expect(addCardButton).toHaveClass('pointer-events-none');
    expect(addCardButton).toHaveClass('group-hover/list:opacity-100');
    expect(addCardButton).toHaveClass('group-hover/list:pointer-events-auto');
    expect(addCardButton).toHaveClass('group-focus-within/list:opacity-100');
    expect(addCardButton).toHaveClass('group-focus-within/list:pointer-events-auto');
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

  it('editor: right-clicking the list header opens the same menu as the "⋮" button', async () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit />);
    const header = screen.getByRole('region', { name: list.title }).querySelector('header');
    expect(header).not.toBeNull();
    fireEvent.contextMenu(header as HTMLElement);
    expect(
      await screen.findByRole('menuitem', { name: columnCopy.menuRename }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: strings.board.list.colorPicker.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: columnCopy.menuArchive })).toBeInTheDocument();
  });

  it('viewer (canEdit=false): right-clicking the header opens no context menu', () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit={false} />);
    const header = screen.getByRole('region', { name: list.title }).querySelector('header');
    expect(header).not.toBeNull();
    fireEvent.contextMenu(header as HTMLElement);
    expect(screen.queryByRole('menuitem', { name: columnCopy.menuRename })).not.toBeInTheDocument();
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

  it('renders a coloured list with the Trello-style full column background and no visible border', () => {
    render(<ListColumn boardId="b1" list={{ ...list, color: 'mavi' }} cards={[]} canEdit />);

    const column = screen.getByRole('region', { name: list.title });
    expect(column).toHaveClass('[--board-list-current-bg:var(--board-list-color-mavi-bg)]');
    expect(column).toHaveClass('bg-[color:var(--board-list-current-bg)]');
    expect(column).not.toHaveClass('border-[color:var(--board-list-border)]');
    expect(column).not.toHaveClass('bg-palet-mavi');
    expect(column.querySelector('[data-list-accent]')).toBeNull();
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
    expect(screen.queryByText(`1 ${columnCopy.cardCount}`)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: columnCopy.expand })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const latestColumnRegistration = vi.mocked(dnd.registerColumn).mock.calls.at(-1)?.[0];
    expect(latestColumnRegistration?.listId).toBe(list.id);
    expect(latestColumnRegistration?.dragHandle.isConnected).toBe(true);
    expect(cleanupCardsArea).toHaveBeenCalledTimes(1);
  });

  it('persists the collapse preference to localStorage across a remount (and clears it on expand)', async () => {
    const user = userEvent.setup();
    const storageKey = `pusula-list-collapsed-${list.id}`;

    const { unmount } = render(
      <ListColumn boardId="b1" list={list} cards={[card('c1', 'One')]} canEdit />,
    );

    // Daraltınca localStorage'e yazılır.
    await user.click(screen.getByRole('button', { name: columnCopy.collapse }));
    expect(window.localStorage.getItem(storageKey)).toBe('1');

    // Yeniden mount (sayfa yenilemesi gibi) → daraltılmış başlar.
    unmount();
    render(<ListColumn boardId="b1" list={list} cards={[card('c1', 'One')]} canEdit />);
    expect(screen.getByRole('region', { name: list.title })).toHaveClass('w-10');
    expect(screen.queryByRole('button', { name: 'One' })).not.toBeInTheDocument();

    // Genişletince anahtar silinir (orphan birikmez).
    await user.click(screen.getByRole('button', { name: columnCopy.expand }));
    expect(window.localStorage.getItem(storageKey)).toBeNull();
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
