import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_ICON_COLORS, LIST_ICONS, type ListIcon, type ListIconColor } from '@pusula/domain';
import { strings } from '@/lib/strings';
import { ListIconPicker } from './list-icon-picker';

const h = vi.hoisted(() => ({
  mutationFn: vi.fn(async (vars: unknown) => vars),
}));

const boardKey = (boardId: string) => ['board.get', { boardId }] as const;
const cardKey = (cardId: string) => ['card.get', { cardId }] as const;

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: { queryFilter: ({ boardId }: { boardId: string }) => ({ queryKey: boardKey(boardId) }) },
    },
    card: {
      get: { queryFilter: ({ cardId }: { cardId: string }) => ({ queryKey: cardKey(cardId) }) },
    },
    list: {
      update: {
        mutationOptions: (options: unknown) => ({
          ...(options as object),
          mutationFn: h.mutationFn,
        }),
      },
    },
  }),
}));

type FixCache = {
  board: { id: string; title: string; version: number; archivedAt: Date | null };
  lists: Array<{
    id: string;
    title: string;
    position: string;
    archivedAt: Date | null;
    color: string | null;
    icon: string | null;
    iconColor: string | null;
  }>;
  cards: [];
};

const copy = strings.board.list.iconPicker;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fixture(icon: ListIcon | null, iconColor: ListIconColor | null): FixCache {
  return {
    board: { id: 'b1', title: 'Pano', version: 1, archivedAt: null },
    lists: [
      {
        id: 'l1',
        title: 'Yapılacak',
        position: 'a0',
        archivedAt: null,
        color: null,
        icon,
        iconColor,
      },
    ],
    cards: [],
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrap(queryClient: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function setup(value: ListIcon | null = null, color: ListIconColor | null = null) {
  const user = userEvent.setup();
  const queryClient = makeQueryClient();
  queryClient.setQueryData(boardKey('b1'), fixture(value, color));
  render(<ListIconPicker boardId="b1" listId="l1" value={value} color={color} />, {
    wrapper: wrap(queryClient),
  });
  return { user, queryClient };
}

describe('<ListIconPicker>', () => {
  beforeEach(() => {
    h.mutationFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the icon grid, colour grid, and reset buttons', () => {
    setup();

    expect(screen.getByRole('group', { name: copy.title })).toBeInTheDocument();
    for (const icon of LIST_ICONS) {
      expect(screen.getByRole('button', { name: copy.icons[icon] })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    for (const color of LIST_ICON_COLORS) {
      expect(screen.getByRole('button', { name: copy.colors[color] })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: copy.clearColor })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.clearIcon })).toBeDisabled();
  });

  it('selecting an icon calls list.update with a clientMutationId and patches the cache', async () => {
    const { user, queryClient } = setup();

    await user.click(screen.getByRole('button', { name: copy.icons.star }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      icon: 'star',
      clientMutationId: expect.stringMatching(uuidV4),
    });
    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]).toMatchObject({ icon: 'star', iconColor: null });
    });
  });

  it('selecting an icon colour requires an icon and patches iconColor', async () => {
    const { user, queryClient } = setup('flag');

    await user.click(screen.getByRole('button', { name: copy.colors.mavi }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      iconColor: 'mavi',
    });
    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]).toMatchObject({ icon: 'flag', iconColor: 'mavi' });
    });
  });

  it('clearing icon colour keeps the icon and patches iconColor:null', async () => {
    const { user, queryClient } = setup('rocket', 'mor');

    await user.click(screen.getByRole('button', { name: copy.clearColor }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      iconColor: null,
    });
    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]).toMatchObject({ icon: 'rocket', iconColor: null });
    });
  });

  it('clearing icon clears iconColor too', async () => {
    const { user, queryClient } = setup('calendar', 'sari');

    await user.click(screen.getByRole('button', { name: copy.clearIcon }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      icon: null,
    });
    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]).toMatchObject({ icon: null, iconColor: null });
    });
  });

  it('clicking the already-selected icon is a no-op', async () => {
    const { user } = setup('star');

    await user.click(screen.getByRole('button', { name: copy.icons.star }));

    expect(h.mutationFn).not.toHaveBeenCalled();
  });
});
