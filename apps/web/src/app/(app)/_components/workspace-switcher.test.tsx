import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  params: {} as { id?: string; boardId?: string },
  workspaceList: [] as Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
    role: 'owner' | 'admin' | 'member' | 'guest';
    createdAt: Date;
  }>,
  workspaceGet: null as null | {
    id: string;
    name: string;
    slug: string;
    icon: string;
    role: 'owner' | 'admin' | 'member' | 'guest';
    memberCount: number;
    ownerId: string;
    createdAt: Date;
  },
  fetchQuery: vi.fn(),
  boardListsByWorkspace: {} as Record<
    string,
    Array<{
      id: string;
      title: string;
      archivedAt: Date | null;
    }>
  >,
}));

vi.mock('next/navigation', () => ({
  useParams: () => h.params,
  useRouter: () => ({ push: h.push }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: h.fetchQuery }),
  useQuery: (options: { queryKey?: unknown[]; enabled?: boolean }) => {
    const key = options.queryKey?.[0];
    if (key === 'workspace.list') {
      return {
        data: h.workspaceList,
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
      };
    }
    if (key === 'workspace.get') {
      return {
        data: options.enabled === false ? undefined : h.workspaceGet,
        isPending: false,
        isError: false,
        isSuccess: options.enabled !== false,
        error: null,
      };
    }
    return { data: undefined, isPending: false, isError: false, isSuccess: true, error: null };
  },
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ queryKey: ['workspace.list'] }) },
      get: {
        queryOptions: (input: unknown) => ({ queryKey: ['workspace.get', input] }),
      },
    },
    board: {
      list: {
        queryOptions: (input: unknown) => ({ queryKey: ['board.list', input] }),
      },
    },
  }),
}));

vi.mock('./create-workspace-dialog', () => ({
  CreateWorkspaceDialog: ({ open }: { open?: boolean } = {}) =>
    open ? <div role="dialog" aria-label="create-workspace" /> : null,
}));

import { WorkspaceSwitcher } from './workspace-switcher';

const copy = strings.shell.workspaceSwitcher;

describe('<WorkspaceSwitcher>', () => {
  beforeEach(() => {
    h.push.mockReset();
    h.fetchQuery.mockReset();
    h.params = {};
    h.workspaceList = [
      {
        id: 'w1',
        name: 'Alpha Workspace',
        slug: 'alpha',
        icon: 'briefcase',
        role: 'owner',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'w2',
        name: 'Beta Workspace',
        slug: 'beta',
        icon: 'rocket',
        role: 'member',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    h.workspaceGet = null;
    h.boardListsByWorkspace = {
      w1: [{ id: 'b1', title: 'Alpha Board', archivedAt: null }],
      w2: [{ id: 'b2', title: 'Beta Board', archivedAt: null }],
    };
    h.fetchQuery.mockImplementation((options: { queryKey?: unknown[] }) => {
      const input = options.queryKey?.[1] as { workspaceId?: string } | undefined;
      return Promise.resolve(h.boardListsByWorkspace[input?.workspaceId ?? ''] ?? []);
    });
  });

  it('renders workspace list entries and navigates to the selected workspace first active board', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    await user.click(await screen.findByRole('menuitem', { name: /Beta Workspace/ }));

    await waitFor(() => {
      expect(h.push).toHaveBeenCalledWith('/workspaces/w2/boards/b2');
    });
  });

  it('falls back to the workspace page when the selected workspace has no active boards', async () => {
    const user = userEvent.setup();
    h.boardListsByWorkspace = {
      w2: [{ id: 'archived-b2', title: 'Archived', archivedAt: new Date('2026-01-01') }],
    };
    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    await user.click(await screen.findByRole('menuitem', { name: /Beta Workspace/ }));

    await waitFor(() => {
      expect(h.push).toHaveBeenCalledWith('/workspaces/w2');
    });
  });

  it('shows the empty state and create CTA when there are no workspaces', async () => {
    const user = userEvent.setup();
    h.workspaceList = [];
    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));

    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: copy.create })).toBeInTheDocument();
  });

  it('marks the active workspace with data-active and a primary check icon', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1' };
    h.workspaceGet = {
      id: 'w1',
      name: 'Alpha Workspace',
      slug: 'alpha',
      icon: 'briefcase',
      role: 'owner',
      memberCount: 3,
      ownerId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    const activeItem = await screen.findByRole('menuitem', { name: /Alpha Workspace/ });

    expect(activeItem).toHaveAttribute('data-active', 'true');
    expect(activeItem.querySelector('svg.text-primary')).toBeInTheDocument();
  });

  it('does not jump to the first board when reselecting the active workspace on a board route', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1', boardId: 'b-current' };
    h.workspaceGet = {
      id: 'w1',
      name: 'Alpha Workspace',
      slug: 'alpha',
      icon: 'briefcase',
      role: 'owner',
      memberCount: 3,
      ownerId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    await user.click(await screen.findByRole('menuitem', { name: /Alpha Workspace/ }));

    expect(h.fetchQuery).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it('uses transparent board chrome styling on board routes', () => {
    h.params = { id: 'w1', boardId: 'b-current' };
    h.workspaceGet = {
      id: 'w1',
      name: 'Alpha Workspace',
      slug: 'alpha',
      icon: 'briefcase',
      role: 'owner',
      memberCount: 3,
      ownerId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    render(<WorkspaceSwitcher />);

    const trigger = screen.getByRole('button', { name: copy.ariaLabel });
    expect(trigger.className).not.toContain('bg-background');
    expect(trigger.className).toContain('text-[color:var(--board-chrome-fg)]');
  });

  it('renders the persisted workspace icon in the trigger and dropdown rows', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1' };
    h.workspaceGet = {
      id: 'w1',
      name: 'Alpha Workspace',
      slug: 'alpha',
      icon: 'briefcase',
      role: 'owner',
      memberCount: 3,
      ownerId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    render(<WorkspaceSwitcher />);

    expect(
      screen
        .getByRole('button', { name: copy.ariaLabel })
        .querySelector('[data-entity-icon="briefcase"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    const beta = await screen.findByRole('menuitem', { name: /Beta Workspace/ });
    expect(beta.querySelector('[data-entity-icon="rocket"]')).toBeInTheDocument();
  });
});
