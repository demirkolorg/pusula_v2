import type { ReactNode } from 'react';
import { Suspense, act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  queryResults: new Map<string, unknown>(),
  queryOptionsSeen: [] as unknown[],
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  requestMutate: vi.fn(),
  useBoardRealtime: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: {
        queryOptions: (input: unknown, options?: unknown) => ({
          key: 'board.get',
          input,
          ...(typeof options === 'object' && options ? options : {}),
        }),
      },
      accessRequests: {
        context: {
          queryOptions: (input: unknown) => ({ key: 'board.accessRequests.context', input }),
        },
        request: {
          mutationOptions: (options: unknown) => ({
            key: 'board.accessRequests.request',
            ...(options as Record<string, unknown>),
          }),
        },
      },
    },
  }),
}));

vi.mock('@/lib/realtime', () => ({
  useBoardRealtime: h.useBoardRealtime,
}));

vi.mock('./_components/board-columns', () => ({
  BoardColumns: () => <div data-testid="board-columns" />,
}));

vi.mock('./_components/board-top-bar', () => ({
  BoardTopBar: ({ title }: { title: string }) => <div data-testid="board-top-bar">{title}</div>,
}));

vi.mock('./_components/card-detail/card-detail-route', () => ({
  CardDetailRoute: () => null,
}));

import BoardDetailPage from './page';

type QueryStub = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data?: unknown;
  error?: { message: string };
};

const queryStub = (overrides: Partial<QueryStub>): QueryStub => ({
  isPending: false,
  isError: false,
  isSuccess: false,
  ...overrides,
});

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>loading</div>}>
        <BoardDetailPage params={Promise.resolve({ id: 'ws_1', boardId: 'b_1' })} />
      </Suspense>,
    );
  });
}

describe('<BoardDetailPage> board access request gate', () => {
  beforeEach(() => {
    h.queryResults = new Map();
    h.queryOptionsSeen = [];
    h.requestMutate.mockReset();
    h.useBoardRealtime.mockReset();
    h.useBoardRealtime.mockReturnValue({ connected: true });
    h.useMutation.mockReset();
    h.useMutation.mockReturnValue({
      mutate: h.requestMutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    });
    h.useQuery.mockReset();
    h.useQuery.mockImplementation((options: { key?: string }) => {
      h.queryOptionsSeen.push(options);
      return (
        h.queryResults.get(options.key ?? '') ?? queryStub({ isSuccess: true, data: undefined })
      );
    });
  });

  it('shows the access request screen without starting board.get or realtime when the viewer has no board access', async () => {
    h.queryResults.set(
      'board.accessRequests.context',
      queryStub({
        isSuccess: true,
        data: {
          board: { id: 'b_1', title: 'Tekman Is Panosu', archivedAt: null },
          workspace: { id: 'ws_1', name: 'Tekman' },
          currentUser: { id: 'u_1', name: 'Pusula Portal', email: 'pusulaportal@gmail.com' },
          access: { hasAccess: false, role: null },
          request: null,
        },
      }),
    );

    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Bu pano özel' })).toBeInTheDocument();
    expect(screen.getByText('Tekman Is Panosu')).toBeInTheDocument();
    expect(screen.getByText('Tekman')).toBeInTheDocument();
    expect(screen.getByText('Pusula Portal')).toBeInTheDocument();
    expect(screen.getByText('pusulaportal@gmail.com')).toBeInTheDocument();
    expect(screen.queryByText(/hesap değiş/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-columns')).not.toBeInTheDocument();

    const boardGetOptions = h.queryOptionsSeen.find(
      (options) => (options as { key?: string }).key === 'board.get',
    ) as { enabled?: boolean } | undefined;
    expect(boardGetOptions?.enabled).toBe(false);
    expect(h.useBoardRealtime).toHaveBeenCalledWith('b_1', { enabled: false });
  });

  it('sends a board-scoped access request from the no-access screen', async () => {
    const user = userEvent.setup();
    h.queryResults.set(
      'board.accessRequests.context',
      queryStub({
        isSuccess: true,
        data: {
          board: { id: 'b_1', title: 'Tekman Is Panosu', archivedAt: null },
          workspace: { id: 'ws_1', name: 'Tekman' },
          currentUser: { id: 'u_1', name: 'Pusula Portal', email: 'pusulaportal@gmail.com' },
          access: { hasAccess: false, role: null },
          request: null,
        },
      }),
    );

    await renderPage();

    await user.click(await screen.findByRole('button', { name: 'Talep gönder' }));

    expect(h.requestMutate).toHaveBeenCalledWith({
      boardId: 'b_1',
      clientMutationId: expect.any(String),
    });
  });
});
