import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import type { BoardRow, WorkspaceRow } from './types';

// Children own tRPC mutations / links; stub them to inert markers so the grid
// test focuses on filtering + the view toggle.
vi.mock('./board-card', () => ({
  BoardCard: ({ board }: { board: BoardRow }) => (
    <div data-testid="board-card">{board.title}</div>
  ),
}));
vi.mock('./board-list-row', () => ({
  BoardListRow: ({ board }: { board: BoardRow }) => (
    <div data-testid="board-list-row">{board.title}</div>
  ),
}));
vi.mock('../../workspaces/[id]/_components/create-board-dialog', () => ({
  CreateBoardDialog: () => null,
}));

import { BoardGrid } from './board-grid';

const workspace: WorkspaceRow = {
  id: 'w1',
  name: 'Alpha',
  slug: 'alpha',
  role: 'owner',
  createdAt: new Date('2026-01-01'),
  boardCount: 3,
  memberCount: 5,
  lastActivityAt: null,
};

const board = (id: string, title: string, over: Partial<BoardRow> = {}): BoardRow => ({
  id,
  title,
  icon: 'layout-grid',
  background: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  role: 'admin',
  updatedAt: new Date('2026-05-01'),
  openCount: 4,
  doneCount: 9,
  members: [],
  favorited: false,
  lastActivityAt: new Date('2026-05-01'),
  ...over,
});

const boards = [
  board('b1', 'Backlog', { favorited: true, lastActivityAt: new Date('2026-05-10') }),
  board('b2', 'Roadmap', { favorited: false, lastActivityAt: new Date('2026-05-15') }),
  board('b3', 'Operations', { favorited: false, lastActivityAt: new Date('2026-05-01') }),
];

describe('<BoardGrid>', () => {
  it('renders all boards in the grid by default', () => {
    render(<BoardGrid workspace={workspace} boards={boards} isPending={false} isError={false} />);
    expect(screen.getAllByTestId('board-card')).toHaveLength(3);
  });

  it('filters to favorited boards on the "Yıldızlı" tab', async () => {
    const user = userEvent.setup();
    render(<BoardGrid workspace={workspace} boards={boards} isPending={false} isError={false} />);
    await user.click(screen.getByRole('tab', { name: strings.home.boards.filterStarred }));
    const cards = screen.getAllByTestId('board-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Backlog');
  });

  it('sorts by recent activity on the "Son düzenlenen" tab', async () => {
    const user = userEvent.setup();
    render(<BoardGrid workspace={workspace} boards={boards} isPending={false} isError={false} />);
    await user.click(screen.getByRole('tab', { name: strings.home.boards.filterRecent }));
    const cards = screen.getAllByTestId('board-card');
    expect(cards.map((node) => node.textContent)).toEqual(['Roadmap', 'Backlog', 'Operations']);
  });

  it('switches to the list view when the list toggle is pressed', async () => {
    const user = userEvent.setup();
    render(<BoardGrid workspace={workspace} boards={boards} isPending={false} isError={false} />);
    await user.click(screen.getByRole('button', { name: strings.home.boards.viewListLabel }));
    expect(screen.getAllByTestId('board-list-row')).toHaveLength(3);
    expect(screen.queryByTestId('board-card')).not.toBeInTheDocument();
  });

  it('shows the starred-empty message when no board is favorited', async () => {
    const user = userEvent.setup();
    const plain = boards.map((b) => ({ ...b, favorited: false }));
    render(<BoardGrid workspace={workspace} boards={plain} isPending={false} isError={false} />);
    await user.click(screen.getByRole('tab', { name: strings.home.boards.filterStarred }));
    expect(screen.getByText(strings.home.boards.emptyStarred)).toBeInTheDocument();
  });

  it('shows an error alert when the board query failed', () => {
    render(
      <BoardGrid
        workspace={workspace}
        boards={[]}
        isPending={false}
        isError
        errorMessage="boom"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
