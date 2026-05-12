import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
      create: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
      complete: { mutationOptions: (o: unknown) => o },
      uncomplete: { mutationOptions: (o: unknown) => o },
    },
    board: { get: { queryFilter: () => ({}) } },
  }),
}));

import { ListColumn, type BoardList } from './list-column';
import { type BoardCard } from './card-item';

const columnCopy = strings.board.column;

const list: BoardList = {
  id: 'l1',
  title: 'Yapılacak',
  position: 'a0',
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const archivedList: BoardList = { ...list, id: 'l2', title: 'Eski', archivedAt: new Date('2026-04-01') };

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

describe('<ListColumn>', () => {
  it('renders the list title and the card count', () => {
    render(<ListColumn boardId="b1" list={list} cards={[card('c1', 'Bir'), card('c2', 'İki')]} canEdit={false} />);
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
    expect(await screen.findByRole('menuitem', { name: columnCopy.menuRename })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: columnCopy.menuArchive })).toBeInTheDocument();
  });

  it('an archived list is read-only: shows the archived label, no add-card form, "⋮" offers restore', async () => {
    const user = userEvent.setup();
    render(<ListColumn boardId="b1" list={archivedList} cards={[]} canEdit />);
    // header shows the archived title but no add-card form footer
    expect(screen.getByRole('heading', { name: 'Eski' })).toBeInTheDocument();
    expect(screen.queryByLabelText(strings.board.card.addCardPlaceholder)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: columnCopy.more }));
    expect(await screen.findByRole('menuitem', { name: columnCopy.menuRestore })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: columnCopy.menuRename })).not.toBeInTheDocument();
  });

  it('shows the empty hint when the list has no cards', () => {
    render(<ListColumn boardId="b1" list={list} cards={[]} canEdit={false} />);
    expect(screen.getByText(columnCopy.empty)).toBeInTheDocument();
  });
});
