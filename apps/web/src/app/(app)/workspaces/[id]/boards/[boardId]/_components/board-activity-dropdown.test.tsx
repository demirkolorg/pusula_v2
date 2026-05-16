import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardActivityDropdown } from './board-activity-dropdown';

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
const triggerName = strings.board.topBar.activity;

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

describe('<BoardActivityDropdown>', () => {
  it('opens from the top-bar trigger and renders readable activity rows', async () => {
    const user = userEvent.setup();
    h.fetchQuery.mockResolvedValue({ items: [], nextCursor: null });
    h.useQuery.mockReturnValue({
      data: { items: events, nextCursor: 'next-page' },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    });

    render(<BoardActivityDropdown boardId="b1" />);

    await user.click(screen.getByRole('button', { name: triggerName }));

    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByText('Ada panoyu oluşturdu')).toBeInTheDocument();
    expect(screen.getByText('Bora liste ekledi: “Backlog”')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.loadMore }));
    expect(h.fetchQuery).toHaveBeenCalledTimes(1);
  });

  it('opens the activity detail modal from a row info button', async () => {
    const user = userEvent.setup();
    h.useQuery.mockReturnValue({
      data: { items: events, nextCursor: null },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    });

    render(<BoardActivityDropdown boardId="b1" />);
    await user.click(screen.getByRole('button', { name: triggerName }));

    const infoButtons = screen.getAllByRole('button', {
      name: strings.activityDetail.infoLabel,
    });
    await user.click(infoButtons[0]!);

    expect(screen.getByText(strings.activityDetail.title)).toBeInTheDocument();
    expect(screen.getByText('board.created')).toBeInTheDocument();
  });

  it('renders the empty state when there are no events', async () => {
    const user = userEvent.setup();
    h.useQuery.mockReturnValue({
      data: { items: [], nextCursor: null },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    });

    render(<BoardActivityDropdown boardId="b1" />);
    await user.click(screen.getByRole('button', { name: triggerName }));

    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });
});
