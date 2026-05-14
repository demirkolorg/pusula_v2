import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Hoisted so the mock factories below can reference them; also handed back to tests.
const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.routerReplace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ key: 'workspace.list' }), queryFilter: () => ({}) },
      create: { mutationOptions: (o: unknown) => o },
      invitations: {
        mine: {
          queryOptions: () => ({ key: 'workspace.invitations.mine' }),
          queryFilter: () => ({}),
        },
        accept: { mutationOptions: (o: unknown) => o },
        decline: { mutationOptions: (o: unknown) => o },
      },
    },
    board: {
      list: {
        queryOptions: ({ workspaceId }: { workspaceId: string }) => ({
          key: `board.list:${workspaceId}`,
        }),
        queryFilter: () => ({}),
      },
      create: { mutationOptions: (o: unknown) => o },
      invitations: {
        mine: {
          queryOptions: () => ({ key: 'board.invitations.mine' }),
          queryFilter: () => ({}),
        },
        accept: { mutationOptions: (o: unknown) => o },
        decline: { mutationOptions: (o: unknown) => o },
      },
    },
  }),
}));

// Imported after the mocks above are registered (vi.mock/vi.hoisted are hoisted).
import WorkspacesPage from './page';

type QueryStub = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: unknown;
  error?: { message: string };
};

const queryStub = (over: Partial<QueryStub>): QueryStub => ({
  isPending: false,
  isError: false,
  isSuccess: false,
  data: undefined,
  ...over,
});

/** Wire `useQuery` so the `workspace.list` query yields `result`; every other query resolves empty. */
function withWorkspaceList(result: QueryStub) {
  h.useQuery.mockImplementation((opts: { key?: string }) =>
    opts?.key === 'workspace.list' ? result : queryStub({ isSuccess: true, data: [] }),
  );
}

function withWorkspaceHome(workspaceResult: QueryStub, boardResults: Record<string, QueryStub>) {
  h.useQuery.mockImplementation((opts: { key?: string }) => {
    if (opts?.key === 'workspace.list') return workspaceResult;
    if (opts?.key?.startsWith('board.list:')) {
      const workspaceId = opts.key.slice('board.list:'.length);
      return boardResults[workspaceId] ?? queryStub({ isSuccess: true, data: [] });
    }
    return queryStub({ isSuccess: true, data: [] });
  });
}

const workspace = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  role: 'owner' as const,
  createdAt: new Date('2026-01-01'),
});

const board = (id: string, title: string) => ({
  id,
  title,
  role: 'admin' as const,
  archivedAt: null,
});

describe('<WorkspacesPage> - (app) landing', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.routerReplace.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pending -> shows the loading placeholder, no redirect', () => {
    withWorkspaceList(queryStub({ isPending: true }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.workspace.loading)).toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('error -> shows the error alert with the server message', () => {
    withWorkspaceList(queryStub({ isError: true, error: { message: 'boom' } }));
    render(<WorkspacesPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(strings.workspace.loadErrorTitle);
    expect(alert).toHaveTextContent('boom');
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('0 workspaces -> renders the onboarding empty state, no redirect', () => {
    withWorkspaceList(queryStub({ isSuccess: true, data: [] }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.onboarding.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.onboarding.createCta })).toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('exactly 1 workspace -> renders its boards instead of redirecting to settings', () => {
    withWorkspaceHome(queryStub({ isSuccess: true, data: [workspace('w1', 'Solo')] }), {
      w1: queryStub({ isSuccess: true, data: [board('b1', 'Sprint')] }),
    });
    render(<WorkspacesPage />);
    expect(screen.getByRole('button', { name: /Solo/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sprint' })).toHaveAttribute(
      'href',
      '/workspaces/w1/boards/b1',
    );
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('2+ workspaces -> renders a workspace sidebar and the selected workspace boards, no redirect', async () => {
    const user = userEvent.setup();
    withWorkspaceHome(
      queryStub({ isSuccess: true, data: [workspace('w1', 'Alpha'), workspace('w2', 'Beta')] }),
      {
        w1: queryStub({
          isSuccess: true,
          data: [board('b1', 'Backlog'), board('b2', 'Roadmap')],
        }),
        w2: queryStub({ isSuccess: true, data: [board('b3', 'Operations')] }),
      },
    );
    render(<WorkspacesPage />);
    expect(screen.getByRole('heading', { name: strings.workspace.listTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha.*ayar/i })).toHaveAttribute(
      'href',
      '/workspaces/w1',
    );
    expect(screen.getByRole('link', { name: 'Backlog' })).toHaveAttribute(
      'href',
      '/workspaces/w1/boards/b1',
    );
    expect(
      screen.getByRole('link', { name: `Backlog ${strings.board.settings.dropdownTitle}` }),
    ).toHaveAttribute('href', '/workspaces/w1/boards/b1/settings');
    expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute(
      'href',
      '/workspaces/w1/boards/b2',
    );

    await user.click(screen.getByRole('button', { name: /Beta/ }));
    expect(screen.getByRole('link', { name: 'Operations' })).toHaveAttribute(
      'href',
      '/workspaces/w2/boards/b3',
    );
    expect(screen.queryByRole('link', { name: 'Backlog' })).not.toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });
});
