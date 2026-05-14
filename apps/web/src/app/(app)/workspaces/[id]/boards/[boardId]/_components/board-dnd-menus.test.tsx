import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import type { BoardDnd } from './use-board-dnd';

// --- Shared mocks ---------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/workspaces/w1/boards/b1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
  }),
}));

import { BoardDndProvider } from './board-dnd-context';
import { ListColumn, type BoardList } from './list-column';
import { CardItem, type BoardCard } from './card-item';

const dndCopy = strings.board.dnd;
const columnCopy = strings.board.column;

/** A `BoardDnd` whose registrars are no-ops and whose moves are spies. */
function makeDnd(over: Partial<BoardDnd> = {}): BoardDnd & {
  moveCardToListEnd: ReturnType<typeof vi.fn>;
  moveColumnByOne: ReturnType<typeof vi.fn>;
} {
  return {
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
  } as BoardDnd & { moveCardToListEnd: ReturnType<typeof vi.fn>; moveColumnByOne: ReturnType<typeof vi.fn> };
}

const lists: BoardList[] = [
  { id: 'L1', title: 'Yapılacak', position: 'a0', color: null, icon: null, iconColor: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'L2', title: 'Devam Eden', position: 'a1', color: null, icon: null, iconColor: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'L3', title: 'Bitti', position: 'a2', color: null, icon: null, iconColor: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date() },
];

const card: BoardCard = {
  id: 'c1',
  listId: 'L1',
  boardId: 'b1',
  title: 'Bir kart',
  description: null,
  position: 'a0',
  dueAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completed: false,
  coverColor: null,
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
  commentCount: 0,
  members: [],
};

describe('board drag-and-drop accessible alternatives (⋮ menus)', () => {
  describe('column ⋮ "move left / right"', () => {
    it('the middle column offers both directions; picking one calls moveColumnByOne', async () => {
      const user = userEvent.setup();
      const dnd = makeDnd();
      render(
        <BoardDndProvider value={dnd}>
          <ListColumn boardId="b1" list={lists[1]!} cards={[]} canEdit allLists={lists} />
        </BoardDndProvider>,
      );
      await user.click(screen.getByRole('button', { name: columnCopy.more }));
      expect(await screen.findByRole('menuitem', { name: dndCopy.moveLeft })).toBeInTheDocument();
      const right = screen.getByRole('menuitem', { name: dndCopy.moveRight });
      expect(right).toBeInTheDocument();
      await user.click(right);
      expect(dnd.moveColumnByOne).toHaveBeenCalledWith('L2', 'right');
    });

    it('the first column has no "move left"; the last has no "move right"', async () => {
      const user = userEvent.setup();
      const dnd = makeDnd();
      const { unmount } = render(
        <BoardDndProvider value={dnd}>
          <ListColumn boardId="b1" list={lists[0]!} cards={[]} canEdit allLists={lists} />
        </BoardDndProvider>,
      );
      await user.click(screen.getByRole('button', { name: columnCopy.more }));
      expect(screen.queryByRole('menuitem', { name: dndCopy.moveLeft })).not.toBeInTheDocument();
      expect(await screen.findByRole('menuitem', { name: dndCopy.moveRight })).toBeInTheDocument();
      unmount();

      render(
        <BoardDndProvider value={dnd}>
          <ListColumn boardId="b1" list={lists[2]!} cards={[]} canEdit allLists={lists} />
        </BoardDndProvider>,
      );
      await user.click(screen.getByRole('button', { name: columnCopy.more }));
      expect(await screen.findByRole('menuitem', { name: dndCopy.moveLeft })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: dndCopy.moveRight })).not.toBeInTheDocument();
    });

    it('without a DnD context the move actions are absent (only rename/archive)', async () => {
      const user = userEvent.setup();
      render(<ListColumn boardId="b1" list={lists[1]!} cards={[]} canEdit allLists={lists} />);
      await user.click(screen.getByRole('button', { name: columnCopy.more }));
      expect(await screen.findByRole('menuitem', { name: columnCopy.menuRename })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: dndCopy.moveLeft })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: dndCopy.moveRight })).not.toBeInTheDocument();
    });
  });

  describe('card context menu "move to list"', () => {
    it('right-clicking the card lists the move targets and an archive action; the own list is disabled', async () => {
      const user = userEvent.setup();
      const dnd = makeDnd();
      render(
        <BoardDndProvider value={dnd}>
          <CardItem boardId="b1" card={card} canEdit allLists={lists} />
        </BoardDndProvider>,
      );
      fireEvent.contextMenu(screen.getByRole('button', { name: card.title }));
      const move = await screen.findByRole('menuitem', { name: dndCopy.move });
      await user.hover(move);

      // The card sits in "Yapılacak" → that item is present but disabled.
      const ownList = await screen.findByRole('menuitem', { name: 'Yapılacak' });
      expect(ownList).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: /Devam Eden/ })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Bitti/ })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: strings.board.card.archive })).toBeInTheDocument();
    });

    it('picking a target list calls moveCardToListEnd with the right ids', async () => {
      const user = userEvent.setup();
      const dnd = makeDnd();
      render(
        <BoardDndProvider value={dnd}>
          <CardItem boardId="b1" card={card} canEdit allLists={lists} />
        </BoardDndProvider>,
      );
      fireEvent.contextMenu(screen.getByRole('button', { name: card.title }));
      const move = await screen.findByRole('menuitem', { name: dndCopy.move });
      await user.hover(move);
      const target = await screen.findByRole('menuitem', { name: /Bitti/ });
      fireEvent.click(target);
      expect(dnd.moveCardToListEnd).toHaveBeenCalledWith('c1', 'L1', 'L3');
    });

    it('without a DnD context there is no separate move button on the card surface', () => {
      render(<CardItem boardId="b1" card={card} canEdit allLists={lists} />);
      expect(screen.queryByRole('button', { name: dndCopy.move })).not.toBeInTheDocument();
    });
  });
});
