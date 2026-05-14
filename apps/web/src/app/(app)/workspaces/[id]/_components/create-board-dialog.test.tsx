import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Hoisted so the mock factories below can reference them; also handed back to tests.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  invalidateQueries: vi.fn(),
  cancelQueries: vi.fn(),
  getQueriesData: vi.fn().mockReturnValue([] as Array<[unknown, unknown]>),
  setQueriesData: vi.fn(),
  mutationState: { isPending: false, isError: false, error: null as { message: string } | null },
}));

// `useOptimisticBoardListMutation` (Phase 4C — DEM-80) wires onMutate / onError /
// onSettled / onSuccess around the underlying tRPC mutation; the mock invokes
// the lifecycle so we can assert both the `clientMutationId` injection and the
// settle-time invalidate against `board.list({ workspaceId })`.
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    onMutate?: (vars: unknown) => unknown | Promise<unknown>;
    onSuccess?: (data: unknown, vars: unknown) => void | Promise<void>;
    onSettled?: (data: unknown, err: unknown, vars: unknown) => void | Promise<void>;
  }) => ({
    mutate: async (vars: unknown) => {
      h.mutate(vars);
      const ctx = await options.onMutate?.(vars);
      await options.onSuccess?.(undefined, vars);
      await options.onSettled?.(undefined, undefined, vars);
      return ctx;
    },
    reset: h.reset,
    ...h.mutationState,
  }),
  useQueryClient: () => ({
    invalidateQueries: h.invalidateQueries,
    cancelQueries: h.cancelQueries,
    getQueriesData: h.getQueriesData,
    setQueriesData: h.setQueriesData,
  }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      create: { mutationOptions: (o: unknown) => o },
      list: { queryFilter: (input: unknown) => ({ filter: 'board.list', input }) },
      get: { queryFilter: (input: unknown) => ({ filter: 'board.get', input }) },
      // `useBoardCacheKeys` needs `card.get.queryFilter` to exist too — it never
      // fires for a workspace board-list mutation but is constructed eagerly.
    },
    card: {
      get: { queryFilter: (input: unknown) => ({ filter: 'card.get', input }) },
    },
  }),
}));

// Imported after the mocks above are registered (vi.mock/vi.hoisted are hoisted).
import { CreateBoardDialog } from './create-board-dialog';

describe('<CreateBoardDialog>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.reset.mockReset();
    h.invalidateQueries.mockReset();
    h.cancelQueries.mockReset();
    h.getQueriesData.mockReset();
    h.getQueriesData.mockReturnValue([]);
    h.setQueriesData.mockReset();
    h.mutationState.isPending = false;
    h.mutationState.isError = false;
    h.mutationState.error = null;
  });
  afterEach(() => vi.clearAllMocks());

  it('opening the dialog shows the title field and submit button', async () => {
    const user = userEvent.setup();
    render(<CreateBoardDialog workspaceId="w1" />);

    await user.click(screen.getByRole('button', { name: strings.board.newButton }));

    expect(screen.getByLabelText(strings.board.create.nameLabel)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.create.submit }),
    ).toBeInTheDocument();
  });

  it('blocks submit on an empty title and does not call the mutation', async () => {
    const user = userEvent.setup();
    render(<CreateBoardDialog workspaceId="w1" />);

    await user.click(screen.getByRole('button', { name: strings.board.newButton }));
    await user.click(screen.getByRole('button', { name: strings.board.create.submit }));

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(strings.board.create.nameLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('submits the trimmed title with a UUID-v4 clientMutationId and invalidates board.list', async () => {
    const user = userEvent.setup();
    render(<CreateBoardDialog workspaceId="w1" />);

    await user.click(screen.getByRole('button', { name: strings.board.newButton }));
    await user.click(screen.getByRole('button', { name: 'Roket' }));
    await user.type(screen.getByLabelText(strings.board.create.nameLabel), '  Yol Haritası  ');
    await user.click(screen.getByRole('button', { name: strings.board.create.submit }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const arg = h.mutate.mock.calls[0]?.[0] as {
      workspaceId: string;
      title: string;
      icon: string;
      clientMutationId: string;
    };
    expect(arg.workspaceId).toBe('w1');
    expect(arg.title).toBe('Yol Haritası');
    expect(arg.icon).toBe('rocket');
    expect(arg.clientMutationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(h.invalidateQueries).toHaveBeenCalledWith({
      filter: 'board.list',
      input: { workspaceId: 'w1' },
    });
  });
});
