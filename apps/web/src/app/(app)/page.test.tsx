import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ key: 'workspace.list' }), queryFilter: () => ({}) },
      create: { mutationOptions: (o: unknown) => o },
      invitations: {
        mine: { queryOptions: () => ({ key: 'workspace.invitations.mine' }), queryFilter: () => ({}) },
        accept: { mutationOptions: (o: unknown) => o },
        decline: { mutationOptions: (o: unknown) => o },
      },
    },
    board: {
      list: { queryFilter: () => ({}) },
      invitations: {
        mine: { queryOptions: () => ({ key: 'board.invitations.mine' }), queryFilter: () => ({}) },
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

const workspace = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  role: 'owner' as const,
  createdAt: new Date('2026-01-01'),
});

describe('<WorkspacesPage> — (app) landing', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.routerReplace.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pending → shows the loading placeholder, no redirect', () => {
    withWorkspaceList(queryStub({ isPending: true }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.workspace.loading)).toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('error → shows the error alert with the server message', () => {
    withWorkspaceList(queryStub({ isError: true, error: { message: 'boom' } }));
    render(<WorkspacesPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(strings.workspace.loadErrorTitle);
    expect(alert).toHaveTextContent('boom');
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('0 workspaces → renders the onboarding empty state, no redirect', () => {
    withWorkspaceList(queryStub({ isSuccess: true, data: [] }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.onboarding.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.onboarding.createCta })).toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });

  it('exactly 1 workspace → redirects straight to that workspace', () => {
    withWorkspaceList(queryStub({ isSuccess: true, data: [workspace('w1', 'Solo')] }));
    render(<WorkspacesPage />);
    expect(h.routerReplace).toHaveBeenCalledWith('/workspaces/w1');
    expect(screen.getByText(strings.workspace.redirecting)).toBeInTheDocument();
  });

  it('2+ workspaces → renders the workspace list, no redirect', () => {
    withWorkspaceList(
      queryStub({ isSuccess: true, data: [workspace('w1', 'Alpha'), workspace('w2', 'Beta')] }),
    );
    render(<WorkspacesPage />);
    expect(screen.getByRole('heading', { name: strings.workspace.listTitle })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(h.routerReplace).not.toHaveBeenCalled();
  });
});
