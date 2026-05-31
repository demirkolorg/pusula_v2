import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: { list: { queryOptions: () => ({ queryKey: ['workspace.list'] }) } },
    board: {
      list: { queryOptions: () => ({ queryKey: ['board.list'] }) },
      get: { queryOptions: () => ({ queryKey: ['board.get'] }) },
    },
  }),
}));

vi.mock('@/lib/realtime/use-board-realtime', () => ({
  useBoardRealtime: () => ({ connected: true, joined: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
}));

// Heavy children — sayfanın dallanma davranışını test ettiğimiz için stub'la.
vi.mock('./_components/onboarding-empty-state', () => ({
  OnboardingEmptyState: () => <div>onboarding-empty-state</div>,
}));
vi.mock('./_components/pending-invitations', () => ({
  PendingInvitations: () => <div>pending-invitations</div>,
}));
vi.mock('./_components/home/workspaces-column', () => ({
  WorkspacesColumn: ({ workspaces }: { workspaces: { id: string; name: string }[] }) => (
    <div data-testid="workspaces-column">
      {workspaces.map((w) => (
        <div key={w.id}>{w.name}</div>
      ))}
    </div>
  ),
}));
vi.mock('./_components/home/boards-column', () => ({
  BoardsColumn: () => <div data-testid="boards-column" />,
}));
vi.mock('./_components/home/lists-column', () => ({
  ListsColumn: () => <div data-testid="lists-column" />,
}));
vi.mock('./_components/home/cards-column', () => ({
  CardsColumn: () => <div data-testid="cards-column" />,
}));
vi.mock('./_components/home/home-breadcrumb', () => ({
  HomeBreadcrumb: () => <div data-testid="home-breadcrumb" />,
}));

import { useQuery } from '@tanstack/react-query';
import WorkspacesPage from './page';

const useQueryMock = vi.mocked(useQuery);

type QueryState = Partial<{
  data: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: { message: string } | undefined;
}>;

function mkQuery(state: QueryState) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isSuccess: !state.isPending && !state.isError,
    error: undefined,
    ...state,
  };
}

/**
 * Tek bir render için 3 ardışık `useQuery` çağrısı yapılır:
 * 1) workspaces.list, 2) boards.list, 3) board.get. Her teste ihtiyaç duyduğu
 * yere kadar implementation set'leniyor, gerisi default'a düşer.
 */
function setQueries(states: QueryState[]) {
  states.forEach((s, i) => {
    if (i === 0) useQueryMock.mockReturnValueOnce(mkQuery(s) as never);
    else useQueryMock.mockReturnValueOnce(mkQuery(s) as never);
  });
  // Kalan ardışık çağrılar default (idle).
  useQueryMock.mockReturnValue(mkQuery({ isSuccess: false }) as never);
}

describe('<WorkspacesPage>', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('renders a spinner while workspaces are loading', () => {
    setQueries([{ isPending: true }]);
    render(<WorkspacesPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error alert when workspace.list fails', () => {
    setQueries([{ isError: true, error: { message: 'down' } }]);
    render(<WorkspacesPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('down')).toBeInTheDocument();
  });

  it('renders the onboarding empty state when the viewer has no workspaces', () => {
    setQueries([{ data: [], isSuccess: true }]);
    render(<WorkspacesPage />);
    expect(screen.getByText('onboarding-empty-state')).toBeInTheDocument();
    expect(screen.getByText('pending-invitations')).toBeInTheDocument();
  });

  it('renders the 4-column grid when the viewer has workspaces', () => {
    setQueries([
      // workspaces.list
      { data: [{ id: 'w1', name: 'Pazarlama' }], isSuccess: true },
      // boards.list (workspace seçili, enabled true)
      { data: [], isSuccess: true },
      // board.get (board seçili değil)
      { data: undefined, isSuccess: false },
    ]);
    render(<WorkspacesPage />);
    // lg+ ekran 4 sütunu yan yana, <lg en derin sütunu accordion'da render eder —
    // her test-id JSDOM'da iki kez bulunur, ikisi de mount olduğu için
    // getAllByTestId kullanıp uzunluğu doğrula.
    expect(screen.getAllByTestId('workspaces-column').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('boards-column').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('lists-column').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('cards-column').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pazarlama').length).toBeGreaterThanOrEqual(1);
  });
});
