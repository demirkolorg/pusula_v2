import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  createMutate: vi.fn(),
  revokeMutate: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      apiKeys: {
        list: {
          queryOptions: (input: unknown, options?: unknown) => ({
            key: 'board.apiKeys.list',
            input,
            ...(typeof options === 'object' && options ? options : {}),
          }),
          queryFilter: (input: unknown) => ({ key: 'board.apiKeys.list', input }),
        },
        create: {
          mutationOptions: (options: unknown) => ({
            key: 'create',
            ...(options as Record<string, unknown>),
          }),
        },
        revoke: {
          mutationOptions: (options: unknown) => ({
            key: 'revoke',
            ...(options as Record<string, unknown>),
          }),
        },
      },
    },
  }),
}));

import { BoardApiKeysSection } from './board-api-keys-section';

const activeKey = {
  id: 'k_1',
  name: 'Otomasyon botu',
  tokenPrefix: 'psk_abcd1234',
  role: 'member' as const,
  botName: 'Otomasyon botu',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-07-10T10:00:00Z'),
};

const revokedKey = {
  id: 'k_2',
  name: 'Eski bot',
  tokenPrefix: 'psk_zzzz9999',
  role: 'viewer' as const,
  botName: 'Eski bot',
  expiresAt: null,
  lastUsedAt: new Date('2026-07-01T10:00:00Z'),
  revokedAt: new Date('2026-07-05T10:00:00Z'),
  createdAt: new Date('2026-06-01T10:00:00Z'),
};

function mockSimpleMutations() {
  h.useMutation.mockImplementation((options: { key?: string }) => ({
    mutate: options.key === 'create' ? h.createMutate : h.revokeMutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }));
}

describe('<BoardApiKeysSection>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.invalidateQueries.mockReset();
    h.createMutate.mockReset();
    h.revokeMutate.mockReset();
    h.useQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: [activeKey, revokedKey],
    });
    mockSimpleMutations();
  });

  it('lists keys with prefix + role, and marks a revoked key with no revoke control', () => {
    render(<BoardApiKeysSection boardId="b_1" />);

    expect(screen.getByText('Otomasyon botu')).toBeInTheDocument();
    expect(screen.getByText(/psk_abcd1234/)).toBeInTheDocument();

    // The revoked key is flagged and offers no revoke button.
    const revokedRow = screen.getByText('Eski bot').closest('li');
    expect(revokedRow).not.toBeNull();
    expect(within(revokedRow as HTMLElement).getByText('İptal edildi')).toBeInTheDocument();
    expect(
      within(revokedRow as HTMLElement).queryByRole('button', { name: 'İptal et' }),
    ).not.toBeInTheDocument();
  });

  it('opens the create dialog and submits name + default role', async () => {
    const user = userEvent.setup();
    render(<BoardApiKeysSection boardId="b_1" />);

    await user.click(screen.getByRole('button', { name: 'Yeni anahtar' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Ad'), 'Yeni bot');
    await user.click(within(dialog).getByRole('button', { name: 'Anahtar oluştur' }));

    expect(h.createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'b_1', name: 'Yeni bot', role: 'member' }),
    );
  });

  it('reveals the plain token exactly once after a successful create', async () => {
    h.useMutation.mockImplementation((options: { key?: string; onSuccess?: (d: unknown, v: unknown) => void }) => ({
      mutate:
        options.key === 'create'
          ? (vars: { name: string; role: 'member' | 'viewer' }) => {
              void options.onSuccess?.(
                {
                  apiKey: {
                    id: 'k_new',
                    name: vars.name,
                    tokenPrefix: 'psk_newpref0',
                    role: vars.role,
                    botName: vars.name,
                    expiresAt: null,
                    lastUsedAt: null,
                    revokedAt: null,
                    createdAt: new Date(),
                  },
                  token: 'psk_ONE_TIME_SECRET_TOKEN',
                },
                vars,
              );
            }
          : h.revokeMutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    }));

    const user = userEvent.setup();
    render(<BoardApiKeysSection boardId="b_1" />);

    await user.click(screen.getByRole('button', { name: 'Yeni anahtar' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Ad'), 'Token bot');
    await user.click(within(dialog).getByRole('button', { name: 'Anahtar oluştur' }));

    expect(await screen.findByText('psk_ONE_TIME_SECRET_TOKEN')).toBeInTheDocument();
    // The one-time reveal warns the operator this value won't be shown again.
    expect(screen.getByText(/bir daha gösterilmeyecek/i)).toBeInTheDocument();
    // The list was refreshed after create.
    await waitFor(() => expect(h.invalidateQueries).toHaveBeenCalled());
  });

  it('confirms before revoking and calls revoke with the key id', async () => {
    const user = userEvent.setup();
    render(<BoardApiKeysSection boardId="b_1" />);

    const activeRow = screen.getByText('Otomasyon botu').closest('li') as HTMLElement;
    await user.click(within(activeRow).getByRole('button', { name: 'İptal et' }));

    // A destructive confirmation dialog opens before the mutation fires.
    const dialog = screen.getByRole('dialog');
    expect(h.revokeMutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Anahtarı iptal et' }));

    expect(h.revokeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'b_1', apiKeyId: 'k_1' }),
    );
  });
});
