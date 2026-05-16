import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vitest + RTL tests for Section 7 — "Aktif susturmalar" listesi
 * (Faz 10H / DEM-142). Component data-driven through `useTRPC`'s
 * `notifications.preferences.list` query + `unsnooze` mutation; mocked
 * to exercise UI in isolation from a live backend.
 *
 * Coverage:
 *   1. loading skeleton state
 *   2. empty state (aktif snooze yok)
 *   3. error state (loadFailed copy)
 *   4. dolu liste — yalnız `cardId` dolu + `muteUntil > now` satırlar render
 *   5. süresi dolmuş satır listede gösterilmez
 *   6. "Kaldır" tıklanınca `unsnooze` mutation cardId ile çağrılır
 */

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  cancelQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: h.useMutation,
  useQueryClient: () => ({
    cancelQueries: h.cancelQueries,
    invalidateQueries: h.invalidateQueries,
    getQueryData: h.getQueryData,
    setQueryData: h.setQueryData,
  }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      preferences: {
        list: {
          queryOptions: () => ({ key: 'notifications.preferences.list' }),
          queryFilter: () => ({ queryKey: ['notifications.preferences.list'] }),
        },
        get: {
          queryFilter: (_input?: unknown) => ({
            queryKey: ['notifications.preferences.get'],
          }),
        },
        unsnooze: { mutationOptions: (o: unknown) => o },
      },
    },
  }),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return { ...mod, toast: { success: vi.fn(), error: h.toastError } };
});

import { NotificationsSnoozeList } from './notifications-snooze-list';

type ListRow = {
  id: string;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  scopeLabel: string;
  muteUntil: Date | string | null;
};

function setListQuery(state: {
  isPending?: boolean;
  isError?: boolean;
  data?: ListRow[];
}) {
  h.useQuery.mockReturnValue({
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    data: state.data ?? [],
  });
}

function setMutation({
  mutate = vi.fn(),
  isPending = false,
  variables,
}: {
  mutate?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  variables?: { cardId: string };
} = {}) {
  h.useMutation.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending,
    variables,
    reset: vi.fn(),
  });
  return mutate;
}

describe('NotificationsSnoozeList', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    setMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton while preferences.list is pending', () => {
    setListQuery({ isPending: true });
    render(<NotificationsSnoozeList />);
    expect(screen.getByLabelText(/susturmalar yükleniyor/i)).toBeInTheDocument();
  });

  it('renders empty state when there are no active snoozes', () => {
    setListQuery({ data: [] });
    render(<NotificationsSnoozeList />);
    expect(
      screen.getByText(/Aktif susturma yok\. Bir kartı geçici olarak susturmak için/i),
    ).toBeInTheDocument();
  });

  it('shows the loadFailed copy when preferences.list errors out', () => {
    setListQuery({ isError: true });
    render(<NotificationsSnoozeList />);
    expect(screen.getByText(/Susturmalar yüklenemedi/i)).toBeInTheDocument();
  });

  it('lists only card-scope rows whose muteUntil is in the future', () => {
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000);
    setListQuery({
      data: [
        // Aktif kart snooze — gösterilmeli.
        {
          id: 'p_active',
          workspaceId: null,
          boardId: null,
          cardId: 'c_active',
          scopeLabel: 'API tasarımı',
          muteUntil: future,
        },
        // Workspace-scope satır — kart değil, listede görünmemeli.
        {
          id: 'p_ws',
          workspaceId: 'ws_1',
          boardId: null,
          cardId: null,
          scopeLabel: 'Acme Workspace',
          muteUntil: null,
        },
      ],
    });
    render(<NotificationsSnoozeList />);
    expect(screen.getByText('API tasarımı')).toBeInTheDocument();
    expect(screen.queryByText('Acme Workspace')).not.toBeInTheDocument();
  });

  it('hides expired snooze rows even when the row exists in DB', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    setListQuery({
      data: [
        {
          id: 'p_expired',
          workspaceId: null,
          boardId: null,
          cardId: 'c_expired',
          scopeLabel: 'Süresi dolmuş kart',
          muteUntil: past,
        },
      ],
    });
    render(<NotificationsSnoozeList />);
    expect(screen.queryByText('Süresi dolmuş kart')).not.toBeInTheDocument();
    // Empty state devreye girer.
    expect(
      screen.getByText(/Aktif susturma yok\. Bir kartı geçici olarak susturmak için/i),
    ).toBeInTheDocument();
  });

  it('fires unsnooze mutation with the row cardId when "Kaldır" is clicked', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const mutate = setMutation();
    setListQuery({
      data: [
        {
          id: 'p_x',
          workspaceId: null,
          boardId: null,
          cardId: 'c_x',
          scopeLabel: 'Q2 roadmap planlama',
          muteUntil: future,
        },
      ],
    });
    const user = userEvent.setup();
    render(<NotificationsSnoozeList />);
    const removeButton = screen.getByRole('button', {
      name: /Q2 roadmap planlama susturmasını kaldır/,
    });
    await user.click(removeButton);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'c_x' }),
    );
  });
});
