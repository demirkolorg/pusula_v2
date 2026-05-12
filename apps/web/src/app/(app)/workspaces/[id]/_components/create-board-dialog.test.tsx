import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Hoisted so the mock factories below can reference them; also handed back to tests.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  invalidateQueries: vi.fn(),
  mutationState: { isPending: false, isError: false, error: null as { message: string } | null },
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { onSuccess?: () => unknown }) => ({
    mutate: (...args: unknown[]) => {
      h.mutate(...args);
      options.onSuccess?.();
    },
    reset: h.reset,
    ...h.mutationState,
  }),
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      create: { mutationOptions: (o: unknown) => o },
      list: { queryFilter: (input: unknown) => ({ filter: 'board.list', input }) },
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

  it('submits the trimmed title with a clientMutationId and invalidates board.list', async () => {
    const user = userEvent.setup();
    render(<CreateBoardDialog workspaceId="w1" />);

    await user.click(screen.getByRole('button', { name: strings.board.newButton }));
    await user.type(screen.getByLabelText(strings.board.create.nameLabel), '  Yol Haritası  ');
    await user.click(screen.getByRole('button', { name: strings.board.create.submit }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const arg = h.mutate.mock.calls[0]?.[0] as {
      workspaceId: string;
      title: string;
      clientMutationId: string;
    };
    expect(arg.workspaceId).toBe('w1');
    expect(arg.title).toBe('Yol Haritası');
    expect(typeof arg.clientMutationId).toBe('string');
    expect(arg.clientMutationId.length).toBeGreaterThan(0);
    expect(h.invalidateQueries).toHaveBeenCalledWith({ filter: 'board.list', input: { workspaceId: 'w1' } });
  });
});
