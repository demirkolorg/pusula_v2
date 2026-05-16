import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  workspacesQuery: vi.fn(),
  boardsQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: { key: string }) => {
    if (opts.key === 'workspace.list') return h.workspacesQuery();
    if (opts.key === 'board.list') return h.boardsQuery();
    return { data: undefined, isPending: false, isError: false };
  }),
  useMutation: h.useMutation,
  useQueryClient: () => ({
    invalidateQueries: h.invalidateQueries,
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      preferences: {
        get: { queryFilter: () => ({ queryKey: ['preferences', 'get'] }) },
        list: { queryFilter: () => ({ queryKey: ['preferences', 'list'] }) },
        upsert: { mutationOptions: (o: unknown) => o },
      },
    },
    workspace: {
      list: { queryOptions: () => ({ key: 'workspace.list' }) },
    },
    board: {
      list: { queryOptions: () => ({ key: 'board.list' }) },
    },
  }),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return {
    ...mod,
    toast: { success: vi.fn(), error: h.toastError },
  };
});

import { NotificationsScopeAddDialog } from './notifications-scope-add-dialog';

function setMutation({
  mutate = vi.fn(),
  isPending = false,
}: { mutate?: ReturnType<typeof vi.fn>; isPending?: boolean } = {}) {
  h.useMutation.mockImplementation(() => ({
    mutate,
    mutateAsync: vi.fn(),
    isPending,
    reset: vi.fn(),
  }));
  return mutate;
}

describe('NotificationsScopeAddDialog', () => {
  beforeEach(() => {
    h.workspacesQuery.mockReset();
    h.boardsQuery.mockReset();
    h.useMutation.mockReset();
    h.invalidateQueries.mockReset();
    h.toastError.mockReset();
    h.workspacesQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        { id: 'ws-1', name: 'Acme', slug: 'acme', icon: null, role: 'owner', createdAt: new Date() },
      ],
    });
    h.boardsQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          id: 'b-1',
          title: 'Q2 Roadmap',
          icon: null,
          background: null,
          version: 1,
          archivedAt: null,
          createdAt: new Date(),
          boardRole: 'admin',
        },
      ],
    });
    setMutation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when open=false', () => {
    render(<NotificationsScopeAddDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Yeni kapsam ekle')).not.toBeInTheDocument();
  });

  it('shows workspace radio + workspace select when opened', () => {
    render(<NotificationsScopeAddDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Scope kind radios (RadioGroup) — both labels are radio items.
    expect(screen.getByRole('radio', { name: 'Çalışma alanı' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pano' })).toBeInTheDocument();
    // Workspace select trigger (the only combobox open initially).
    expect(screen.getByRole('combobox', { name: 'Çalışma alanı' })).toBeInTheDocument();
  });

  it('disables submit until workspace is selected', () => {
    render(<NotificationsScopeAddDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeDisabled();
  });

  it('cancel button closes the dialog via onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    render(<NotificationsScopeAddDialog open onOpenChange={onOpenChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'İptal' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
