import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

type NotificationRow = {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: string;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  payload: Record<string, unknown>;
  readAt: Date | string | null;
  createdAt: Date | string;
};

type NotificationPage = {
  items: NotificationRow[];
  nextCursor: string | null;
};

type NotificationListData = InfiniteData<NotificationPage, string | null>;

const routerPush = vi.fn();
const markReadCalls: unknown[] = [];
const markAllReadCalls: unknown[] = [];
let listResult: NotificationPage = { items: [], nextCursor: null };
let listDelay = false;
let markReadReject = false;

const listKey = ['notifications.list', { limit: 20 }] as const;
const unreadCountKey = ['notifications.unreadCount'] as const;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      list: {
        infiniteQueryOptions: (_input: { limit: number }, options: unknown) => ({
          queryKey: listKey,
          initialPageParam: null,
          queryFn: async () => {
            if (listDelay) {
              await new Promise(() => {});
            }
            return listResult;
          },
          ...(typeof options === 'object' && options ? options : {}),
        }),
        infiniteQueryFilter: () => ({ queryKey: listKey, type: 'infinite' }),
      },
      unreadCount: {
        queryFilter: () => ({ queryKey: unreadCountKey, type: 'query' }),
      },
      markRead: {
        mutationOptions: (options: Record<string, unknown>) => ({
          mutationFn: async (input: unknown) => {
            markReadCalls.push(input);
            if (markReadReject) throw new Error('mark failed');
            const id = (input as { id: string }).id;
            const readAt = new Date();
            listResult = {
              ...listResult,
              items: listResult.items.map((item) => (item.id === id ? { ...item, readAt } : item)),
            };
            return { id, readAt, changed: true };
          },
          ...options,
        }),
      },
      markAllRead: {
        mutationOptions: (options: Record<string, unknown>) => ({
          mutationFn: async (input: unknown) => {
            markAllReadCalls.push(input);
            const readAt = new Date();
            listResult = {
              ...listResult,
              items: listResult.items.map((item) =>
                item.readAt == null ? { ...item, readAt } : item,
              ),
            };
            return { marked: 2 };
          },
          ...options,
        }),
      },
    },
  }),
}));

import { NotificationCenter } from './notification-center';

function unreadNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    recipientId: 'user_1',
    actorId: 'actor_1',
    type: 'card.member_added',
    workspaceId: 'ws1',
    boardId: 'b1',
    cardId: 'c1',
    payload: {
      actorName: 'Ada',
      cardTitle: 'Plan kartı',
      workspaceId: 'ws1',
      boardId: 'b1',
      cardId: 'c1',
    },
    readAt: null,
    createdAt: new Date('2026-05-14T09:00:00.000Z'),
    ...overrides,
  };
}

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderCenter(queryClient = newQueryClient(), onClose = vi.fn()) {
  return {
    onClose,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NotificationCenter onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

function getListCache(queryClient: QueryClient): NotificationListData | undefined {
  return queryClient.getQueryData<NotificationListData>(listKey);
}

describe('<NotificationCenter>', () => {
  beforeEach(() => {
    routerPush.mockReset();
    markReadCalls.length = 0;
    markAllReadCalls.length = 0;
    listResult = { items: [], nextCursor: null };
    listDelay = false;
    markReadReject = false;
  });

  it('renders three skeleton rows while loading', () => {
    listDelay = true;

    renderCenter();

    expect(screen.getAllByTestId('notification-skeleton')).toHaveLength(3);
  });

  it('renders the empty state after an empty page loads', async () => {
    renderCenter();

    expect(await screen.findByText(strings.notifications.empty)).toBeInTheDocument();
  });

  it('renders notification rows and marks unread rows with a visual state', async () => {
    listResult = {
      items: [
        unreadNotification({ id: 'n1', payload: { actorName: 'Ada', cardTitle: 'Plan kartı' } }),
        unreadNotification({
          id: 'n2',
          type: 'comment.mentioned',
          payload: { actorName: 'Bora', cardTitle: 'Mention kartı' },
        }),
        unreadNotification({
          id: 'n3',
          type: 'comment.created',
          payload: { actorName: 'Cem', cardTitle: 'Yorum kartı' },
          readAt: new Date('2026-05-14T09:05:00.000Z'),
        }),
      ],
      nextCursor: null,
    };

    renderCenter();

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bora')).toBeInTheDocument();
    expect(screen.getByText('Cem')).toBeInTheDocument();
    expect(screen.getByTestId('notification-row-n1')).toHaveAttribute('data-unread', 'true');
    expect(screen.getByTestId('notification-row-n3')).toHaveAttribute('data-unread', 'false');
  });

  it('renders unknown notification types with fallback actor and summary copy', async () => {
    listResult = {
      items: [
        unreadNotification({
          id: 'n-unknown',
          type: 'future.notification.type',
          payload: {},
        }),
      ],
      nextCursor: null,
    };

    renderCenter();

    expect(await screen.findByText(strings.notifications.fallbackActorName)).toBeInTheDocument();
    expect(screen.getByText(strings.notifications.summary.default)).toBeInTheDocument();
  });

  it('clicking an unread row navigates, marks it read, and closes the panel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    listResult = { items: [unreadNotification()], nextCursor: null };

    renderCenter(newQueryClient(), onClose);

    await user.click(await screen.findByTestId('notification-row-n1'));

    expect(routerPush).toHaveBeenCalledWith('/workspaces/ws1/boards/b1?card=c1');
    expect(markReadCalls).toEqual([{ id: 'n1' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('mark-all-read optimistically marks every cached unread notification', async () => {
    const user = userEvent.setup();
    const queryClient = newQueryClient();
    listResult = {
      items: [
        unreadNotification({ id: 'n1' }),
        unreadNotification({ id: 'n2', type: 'comment.created' }),
      ],
      nextCursor: null,
    };

    renderCenter(queryClient);
    await screen.findByTestId('notification-row-n1');

    await user.click(screen.getByRole('button', { name: strings.notifications.markAllRead }));

    await waitFor(() => {
      const rows = getListCache(queryClient)?.pages.flatMap((page) => page.items) ?? [];
      expect(rows.every((row) => row.readAt != null)).toBe(true);
    });
    expect(markAllReadCalls).toEqual([undefined]);
  });

  it('mark-read optimistically updates list and unread-count caches while the mutation is pending', async () => {
    const user = userEvent.setup();
    const queryClient = newQueryClient();
    queryClient.setQueryData(unreadCountKey, { count: 1 });
    listResult = { items: [unreadNotification()], nextCursor: null };

    renderCenter(queryClient);

    await user.click(await screen.findByTestId('notification-row-n1'));

    await waitFor(() => {
      const row = getListCache(queryClient)?.pages[0]?.items[0];
      expect(row?.readAt).not.toBeNull();
      expect(queryClient.getQueryData<{ count: number }>(unreadCountKey)?.count).toBe(0);
    });
  });

  it('rolls back optimistic mark-read when the mutation fails', async () => {
    const user = userEvent.setup();
    const queryClient = newQueryClient();
    queryClient.setQueryData(unreadCountKey, { count: 1 });
    listResult = { items: [unreadNotification()], nextCursor: null };
    markReadReject = true;

    renderCenter(queryClient);

    await user.click(await screen.findByTestId('notification-row-n1'));

    await waitFor(() => {
      const row = getListCache(queryClient)?.pages[0]?.items[0];
      expect(row?.readAt).toBeNull();
      expect(queryClient.getQueryData<{ count: number }>(unreadCountKey)?.count).toBe(1);
    });
  });
});
