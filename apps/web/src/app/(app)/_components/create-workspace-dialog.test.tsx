import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  invalidateQueries: vi.fn(),
  mutationState: { isPending: false, isError: false, error: null as { message: string } | null },
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { onSuccess?: () => void | Promise<void> }) => ({
    mutate: async (vars: unknown) => {
      h.mutate(vars);
      await options.onSuccess?.();
    },
    reset: h.reset,
    ...h.mutationState,
  }),
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      create: { mutationOptions: (o: unknown) => o },
      list: { queryFilter: () => ({ filter: 'workspace.list' }) },
    },
  }),
}));

import { CreateWorkspaceDialog } from './create-workspace-dialog';

describe('<CreateWorkspaceDialog>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.reset.mockReset();
    h.invalidateQueries.mockReset();
    h.mutationState.isPending = false;
    h.mutationState.isError = false;
    h.mutationState.error = null;
  });

  it('submits the trimmed name and selected icon', async () => {
    const user = userEvent.setup();
    render(<CreateWorkspaceDialog />);

    await user.click(screen.getByRole('button', { name: strings.workspace.newButton }));
    await user.click(screen.getByRole('button', { name: 'Roket' }));
    await user.type(screen.getByLabelText(strings.workspace.create.nameLabel), '  Pazarlama  ');
    await user.click(screen.getByRole('button', { name: strings.workspace.create.submit }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const arg = h.mutate.mock.calls[0]?.[0] as {
      name: string;
      icon: string;
      clientMutationId: string;
    };
    expect(arg.name).toBe('Pazarlama');
    expect(arg.icon).toBe('rocket');
    expect(arg.clientMutationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(h.invalidateQueries).toHaveBeenCalledWith({ filter: 'workspace.list' });
  });
});
