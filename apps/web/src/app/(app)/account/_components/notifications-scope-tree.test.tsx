import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        get: { queryFilter: () => ({ queryKey: ['preferences', 'get'] }) },
        list: {
          queryOptions: () => ({ key: 'preferences.list' }),
          queryFilter: () => ({ queryKey: ['preferences', 'list'] }),
        },
        upsert: { mutationOptions: (o: unknown) => o },
        delete: { mutationOptions: (o: unknown) => o },
      },
    },
    workspace: { list: { queryOptions: () => ({ key: 'workspace.list' }) } },
    board: { list: { queryOptions: () => ({ key: 'board.list' }) } },
  }),
}));

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return {
    ...mod,
    toast: { success: vi.fn(), error: h.toastError },
  };
});

import { NotificationsScopeTree } from './notifications-scope-tree';

type ScopeRow = {
  id: string;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: Date;
  scopeLabel: string;
};

const mutationCalls: Array<{ kind: 'upsert' | 'delete'; mutate: ReturnType<typeof vi.fn> }> = [];

function setListQuery(state: { isPending?: boolean; isError?: boolean; data?: ScopeRow[] }) {
  h.useQuery.mockReturnValue({
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    data: state.data ?? [],
  });
}

function setMutations() {
  // useMutation called twice in this component (delete, then upsert).
  let callIdx = 0;
  h.useMutation.mockImplementation(() => {
    callIdx += 1;
    const mutate = vi.fn();
    mutationCalls.push({ kind: callIdx === 1 ? 'delete' : 'upsert', mutate });
    return {
      mutate,
      mutateAsync: vi.fn(),
      isPending: false,
      reset: vi.fn(),
      variables: undefined,
    };
  });
}

describe('NotificationsScopeTree', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.useMutation.mockReset();
    h.cancelQueries.mockReset();
    h.invalidateQueries.mockReset();
    h.getQueryData.mockReset();
    h.setQueryData.mockReset();
    h.toastError.mockReset();
    mutationCalls.length = 0;
    setMutations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state when no override rows exist', () => {
    setListQuery({ data: [] });
    render(<NotificationsScopeTree />);
    expect(
      screen.getByText(
        /Belirli bir çalışma alanı veya pano için ayrı tercih oluşturmak istersen/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yeni kapsam ekle/ })).toBeInTheDocument();
  });

  it('shows the loading state when the list query is pending', () => {
    setListQuery({ isPending: true });
    render(<NotificationsScopeTree />);
    expect(screen.getByText('Kapsam tercihleri yükleniyor…')).toBeInTheDocument();
  });

  it('renders override rows but skips the global row', () => {
    setListQuery({
      data: [
        {
          id: 'p1',
          workspaceId: null,
          boardId: null,
          cardId: null,
          muteLevel: 'none',
          mentionOnly: false,
          pushEnabled: true,
          emailEnabled: true,
          updatedAt: new Date(),
          scopeLabel: 'Genel',
        },
        {
          id: 'p2',
          workspaceId: 'ws-1',
          boardId: null,
          cardId: null,
          muteLevel: 'all',
          mentionOnly: false,
          pushEnabled: true,
          emailEnabled: false,
          updatedAt: new Date(),
          scopeLabel: 'Acme Workspace',
        },
        {
          id: 'p3',
          workspaceId: null,
          boardId: 'b-1',
          cardId: null,
          muteLevel: 'mentions_only',
          mentionOnly: true,
          pushEnabled: true,
          emailEnabled: true,
          updatedAt: new Date(),
          scopeLabel: 'Q2 Roadmap',
        },
      ],
    });
    render(<NotificationsScopeTree />);
    // Global "Genel" satırı override listesinde gösterilmemeli (Section 1 yönetir).
    expect(screen.queryByText('Genel')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Workspace')).toBeInTheDocument();
    expect(screen.getByText('Q2 Roadmap')).toBeInTheDocument();
  });

  it('fires the delete mutation when clicking "Kaldır"', async () => {
    setListQuery({
      data: [
        {
          id: 'p2',
          workspaceId: 'ws-1',
          boardId: null,
          cardId: null,
          muteLevel: 'all',
          mentionOnly: false,
          pushEnabled: true,
          emailEnabled: false,
          updatedAt: new Date(),
          scopeLabel: 'Acme Workspace',
        },
      ],
    });
    render(<NotificationsScopeTree />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Acme Workspace için özel tercihi kaldır/ }),
    );
    const deleteCall = mutationCalls.find((c) => c.kind === 'delete');
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1' }),
    );
  });

  it('opens the add-scope dialog when clicking "Yeni kapsam ekle"', async () => {
    setListQuery({ data: [] });
    render(<NotificationsScopeTree />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Yeni kapsam ekle/ }));
    // Dialog opens — find the dialog role (title text matches the button so
    // we cannot use it as the discriminator).
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Form-only label only appears inside the dialog.
    expect(screen.getByText('Kapsam türü')).toBeInTheDocument();
  });
});
