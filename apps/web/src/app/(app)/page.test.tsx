import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Hoisted so the mock factories below can reference them; also handed back to tests.
const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ key: 'workspace.list' }) },
    },
    board: {
      list: {
        queryOptions: ({ workspaceId }: { workspaceId: string }) => ({
          key: `board.list:${workspaceId}`,
        }),
      },
    },
  }),
}));

// Surface invitations are a separate concern; render an inert marker.
vi.mock('./_components/pending-invitations', () => ({
  PendingInvitations: () => <div data-testid="pending-invitations" />,
}));
vi.mock('./_components/onboarding-empty-state', () => ({
  OnboardingEmptyState: () => <div>{strings.onboarding.title}</div>,
}));

// The home layout components own their own tRPC queries / mutations; stub them
// so this page test focuses on the branching + workspace selection wiring.
vi.mock('./_components/home/home-hero', () => ({
  HomeHero: () => <div data-testid="home-hero" />,
}));
vi.mock('./_components/home/workspace-rail', () => ({
  WorkspaceRail: ({
    workspaces,
    selectedWorkspaceId,
    onSelect,
  }: {
    workspaces: { id: string; name: string }[];
    selectedWorkspaceId: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="workspace-rail">
      {workspaces.map((workspace) => (
        <button
          key={workspace.id}
          type="button"
          aria-pressed={workspace.id === selectedWorkspaceId}
          onClick={() => onSelect(workspace.id)}
        >
          {workspace.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('./_components/home/workspace-overview-header', () => ({
  WorkspaceOverviewHeader: ({ workspace }: { workspace: { name: string } }) => (
    <h1>{workspace.name}</h1>
  ),
}));
vi.mock('./_components/home/workspace-stat-strip', () => ({
  WorkspaceStatStrip: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="stat-strip">{workspaceId}</div>
  ),
}));
vi.mock('./_components/home/board-grid', () => ({
  BoardGrid: ({
    workspace,
    boards,
  }: {
    workspace: { id: string };
    boards: { title: string }[];
  }) => (
    <div data-testid="board-grid" data-workspace={workspace.id}>
      {boards.map((board) => (
        <span key={board.title}>{board.title}</span>
      ))}
    </div>
  ),
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

/** Wire `useQuery` so `workspace.list` yields `result`; board queries resolve from `boardResults`. */
function withWorkspaceHome(
  workspaceResult: QueryStub,
  boardResults: Record<string, QueryStub> = {},
) {
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
  boardCount: 0,
  memberCount: 1,
  lastActivityAt: null,
});

const board = (id: string, title: string) => ({
  id,
  title,
  role: 'admin' as const,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-05-01'),
  openCount: 0,
  doneCount: 0,
  members: [],
  favorited: false,
  lastActivityAt: null,
});

describe('<WorkspacesPage> - (app) landing', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pending -> shows the loading placeholder', () => {
    withWorkspaceHome(queryStub({ isPending: true }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.workspace.loading)).toBeInTheDocument();
  });

  it('error -> shows the error alert with the server message', () => {
    withWorkspaceHome(queryStub({ isError: true, error: { message: 'boom' } }));
    render(<WorkspacesPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(strings.workspace.loadErrorTitle);
    expect(alert).toHaveTextContent('boom');
  });

  it('0 workspaces -> renders the onboarding empty state', () => {
    withWorkspaceHome(queryStub({ isSuccess: true, data: [] }));
    render(<WorkspacesPage />);
    expect(screen.getByText(strings.onboarding.title)).toBeInTheDocument();
  });

  it('1+ workspaces -> renders the rail, overview header, stat strip and board grid', () => {
    withWorkspaceHome(queryStub({ isSuccess: true, data: [workspace('w1', 'Solo')] }), {
      w1: queryStub({ isSuccess: true, data: [board('b1', 'Sprint')] }),
    });
    render(<WorkspacesPage />);
    expect(screen.getByTestId('home-hero')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-rail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Solo' })).toBeInTheDocument();
    expect(screen.getByTestId('stat-strip')).toHaveTextContent('w1');
    expect(screen.getByTestId('board-grid')).toHaveTextContent('Sprint');
  });

  it('selecting another workspace in the rail swaps the overview + boards', async () => {
    const user = userEvent.setup();
    withWorkspaceHome(
      queryStub({ isSuccess: true, data: [workspace('w1', 'Alpha'), workspace('w2', 'Beta')] }),
      {
        w1: queryStub({ isSuccess: true, data: [board('b1', 'Backlog')] }),
        w2: queryStub({ isSuccess: true, data: [board('b3', 'Operations')] }),
      },
    );
    render(<WorkspacesPage />);
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByTestId('board-grid')).toHaveTextContent('Backlog');

    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByTestId('board-grid')).toHaveTextContent('Operations');
  });
});
