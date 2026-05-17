import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { boardRoleLabels, strings } from '@/lib/strings';
import type { BoardRow } from './types';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The favorite button owns the optimistic tRPC mutation; stub it so this card
// test stays presentational.
vi.mock('./board-favorite-button', () => ({
  BoardFavoriteButton: ({ favorited }: { favorited: boolean }) => (
    <button type="button" data-favorited={favorited}>
      star
    </button>
  ),
}));

import { BoardCard } from './board-card';

const baseBoard: BoardRow = {
  id: 'b1',
  title: 'Sprint Tahtası',
  icon: 'layout-grid',
  background: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  role: 'admin',
  updatedAt: new Date('2026-05-17'),
  openCount: 12,
  doneCount: 18,
  members: [
    { userId: 'u1', name: 'Ada Lovelace', role: 'admin' },
    { userId: 'u2', name: 'Alan Turing', role: 'member' },
  ],
  favorited: false,
  lastActivityAt: new Date('2026-05-17'),
};

describe('<BoardCard>', () => {
  it('links the title to the board screen', () => {
    render(<BoardCard workspaceId="w1" board={baseBoard} />);
    expect(screen.getByRole('link', { name: 'Sprint Tahtası' })).toHaveAttribute(
      'href',
      '/workspaces/w1/boards/b1',
    );
  });

  it('shows the role badge and the open/done task counts', () => {
    render(<BoardCard workspaceId="w1" board={baseBoard} />);
    expect(
      screen.getByText(`${strings.board.roleBadgePrefix} ${boardRoleLabels.admin}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(strings.home.boards.taskCounts(12, 18)),
    ).toBeInTheDocument();
  });

  it('renders the archived badge for an archived board', () => {
    render(
      <BoardCard
        workspaceId="w1"
        board={{ ...baseBoard, archivedAt: new Date('2026-04-01') }}
      />,
    );
    expect(screen.getByText(strings.board.archivedBadge)).toBeInTheDocument();
  });

  it('omits the archived badge for an active board', () => {
    render(<BoardCard workspaceId="w1" board={baseBoard} />);
    expect(screen.queryByText(strings.board.archivedBadge)).not.toBeInTheDocument();
  });
});
