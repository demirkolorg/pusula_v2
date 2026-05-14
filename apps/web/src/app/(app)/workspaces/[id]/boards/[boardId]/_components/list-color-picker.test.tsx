import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_COLORS, type ListColor } from '@pusula/domain';
import { strings } from '@/lib/strings';
import { ListColorPicker } from './list-color-picker';

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
  }>;
  cards: [];
};

const copy = strings.board.list.colorPicker;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fixture(color: ListColor | null): FixCache {
  return {
    board: { id: 'b1', title: 'Pano', version: 1, archivedAt: null },
    lists: [
      {
        id: 'l1',
        title: 'Yapılacak',
        position: 'a0',
        archivedAt: null,
        color,
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

function setup(value: ListColor | null = null) {
  const user = userEvent.setup();
  const queryClient = makeQueryClient();
  queryClient.setQueryData(boardKey('b1'), fixture(value));
  render(<ListColorPicker boardId="b1" listId="l1" value={value} />, {
    wrapper: wrap(queryClient),
  });
  return { user, queryClient };
}

describe('<ListColorPicker>', () => {
  beforeEach(() => {
    h.mutationFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 10-colour grid and the clear button', () => {
    setup();

    expect(screen.getByRole('group', { name: copy.title })).toBeInTheDocument();
    for (const color of LIST_COLORS) {
      expect(screen.getByRole('button', { name: copy.colors[color] })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    expect(screen.getByRole('button', { name: copy.clear })).toBeDisabled();
  });

  it('selecting a colour calls list.update with a clientMutationId', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: copy.colors.mavi }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      color: 'mavi',
      clientMutationId: expect.stringMatching(uuidV4),
    });
  });

  it('selecting a colour optimistically updates the board cache', async () => {
    const { user, queryClient } = setup();

    await user.click(screen.getByRole('button', { name: copy.colors.yesil }));

    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]!.color).toBe('yesil');
    });
  });

  it('clearing a colour calls list.update with color:null and patches the cache', async () => {
    const { user, queryClient } = setup('mor');

    await user.click(screen.getByRole('button', { name: copy.clear }));

    await waitFor(() => expect(h.mutationFn).toHaveBeenCalledTimes(1));
    expect(h.mutationFn.mock.calls[0]?.[0]).toMatchObject({
      boardId: 'b1',
      listId: 'l1',
      color: null,
    });
    await waitFor(() => {
      const cache = queryClient.getQueryData<FixCache>(boardKey('b1'))!;
      expect(cache.lists[0]!.color).toBeNull();
    });
  });

  it('clicking the already-selected colour is a no-op', async () => {
    const { user } = setup('mavi');

    await user.click(screen.getByRole('button', { name: copy.colors.mavi }));

    expect(h.mutationFn).not.toHaveBeenCalled();
  });
});
