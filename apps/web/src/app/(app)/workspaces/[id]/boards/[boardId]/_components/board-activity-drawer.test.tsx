import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardActivityDrawer } from './board-activity-drawer';

const h = vi.hoisted(() => ({
  fetchQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useQueryClient: () => ({ fetchQuery: h.fetchQuery }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      activity: {
        list: {
          queryOptions: (input: unknown, options: unknown) => ({ input, options }),
        },
      },
    },
  }),
}));

const copy = strings.board.activity;

const events = [
  {
    id: 'a1',
    type: 'board.created',
    actorId: 'u1',
    actorName: 'Ada',
    payload: {},
    createdAt: new Date('2026-05-14T10:00:00Z'),
  },
  {
    id: 'a2',
    type: 'list.created',
    actorId: 'u2',
    actorName: 'Bora',
    payload: { title: 'Backlog' },
    createdAt: new Date('2026-05-14T10:01:00Z'),
  },
];

describe('<BoardActivityDrawer>', () => {
  it('renders readable board activity rows and the pagination action', async () => {
    const user = userEvent.setup();
    h.fetchQuery.mockResolvedValue({ items: [], nextCursor: null });
    h.useQuery.mockReturnValue({
      data: { items: events, nextCursor: 'next-page' },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    });

    render(<BoardActivityDrawer boardId="b1" open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: copy.title })).toBeInTheDocument();
    expect(screen.getByText('Ada panoyu oluşturdu')).toBeInTheDocument();
    expect(screen.getByText('Bora liste ekledi: “Backlog”')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.loadMore }));
    expect(h.fetchQuery).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when there are no events', () => {
    h.useQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    });

    render(<BoardActivityDrawer boardId="b1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });
});
