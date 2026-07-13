import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { MoveBoardToWorkspaceDialog } from './move-board-to-workspace-dialog';

const copy = strings.board.moveToWorkspace;

const moveMutate = vi.fn();
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

// react-query — workspace.list `__q` etiketiyle ayırt edilir; mutation casuslanır.
let workspacesData: Array<{ id: string; name: string; role: string }> = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { __q?: string }) => {
    if (options?.__q === 'workspace.list') return { data: workspacesData, isPending: false };
    return { data: undefined, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: moveMutate, isPending: false }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: {
        queryOptions: (_input: unknown, opts: unknown) => ({ __q: 'workspace.list', opts }),
        queryFilter: () => ({ queryKey: ['workspace.list'] }),
      },
    },
    board: {
      get: { queryFilter: (input: unknown) => ({ queryKey: ['board.get', input] }) },
      list: { queryFilter: (input: unknown) => ({ queryKey: ['board.list', input] }) },
      moveToWorkspace: { mutationOptions: (o: unknown) => o },
    },
  }),
}));

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    boardId: 'b1',
    currentWorkspaceId: 'ws_current',
    open: true,
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<MoveBoardToWorkspaceDialog {...props} />);
  return props;
}

describe('<MoveBoardToWorkspaceDialog>', () => {
  beforeEach(() => {
    workspacesData = [
      { id: 'ws_current', name: 'Mevcut Alan', role: 'owner' },
      { id: 'ws_target', name: 'Hedef Alan', role: 'member' },
      { id: 'ws_guest', name: 'Misafir Alan', role: 'guest' },
    ];
    moveMutate.mockClear();
    routerReplace.mockClear();
  });

  it('renders the title, member note and target select when eligible workspaces exist', () => {
    setup();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByText(copy.membersNote)).toBeInTheDocument();
    // Mevcut + guest alanlar elendi, ama en az bir hedef var → seçici görünür.
    expect(screen.getByText(copy.workspacePlaceholder)).toBeInTheDocument();
    expect(screen.queryByText(copy.noTargets)).not.toBeInTheDocument();
  });

  it('keeps submit disabled until a target workspace is chosen', () => {
    setup();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
    expect(moveMutate).not.toHaveBeenCalled();
  });

  it('shows the empty state when only the current or guest workspaces remain', () => {
    workspacesData = [
      { id: 'ws_current', name: 'Mevcut Alan', role: 'owner' },
      { id: 'ws_guest', name: 'Misafir Alan', role: 'guest' },
    ];
    setup();
    expect(screen.getByText(copy.noTargets)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
  });
});
