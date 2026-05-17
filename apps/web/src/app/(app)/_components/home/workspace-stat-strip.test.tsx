import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({ useQuery: h.useQuery }));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: { stats: { queryOptions: () => ({ key: 'workspace.stats' }) } },
  }),
}));

import { WorkspaceStatStrip } from './workspace-stat-strip';

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

const stats = {
  openCount: 38,
  completedThisWeek: 24,
  completedLastWeek: 18,
  overdueCount: 3,
  assignedToMeOpen: 11,
  assignedToMeDueToday: 2,
};

describe('<WorkspaceStatStrip>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
  });

  it('shows a loading placeholder while the stats query is pending', () => {
    h.useQuery.mockReturnValue(queryStub({ isPending: true }));
    render(<WorkspaceStatStrip workspaceId="w1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error alert when the stats query fails', () => {
    h.useQuery.mockReturnValue(queryStub({ isError: true, error: { message: 'boom' } }));
    render(<WorkspaceStatStrip workspaceId="w1" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(strings.home.stats.loadErrorTitle);
    expect(alert).toHaveTextContent('boom');
  });

  it('renders the four metric tiles with the workspace stats', () => {
    h.useQuery.mockReturnValue(queryStub({ isSuccess: true, data: stats }));
    render(<WorkspaceStatStrip workspaceId="w1" />);
    expect(screen.getByText(strings.home.stats.openTasks.label)).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('shows a positive week-over-week delta for completed tasks', () => {
    h.useQuery.mockReturnValue(queryStub({ isSuccess: true, data: stats }));
    render(<WorkspaceStatStrip workspaceId="w1" />);
    expect(
      screen.getByText(strings.home.stats.completedThisWeek.deltaUp(6)),
    ).toBeInTheDocument();
  });

  it('shows the empty overdue sub line when there are no overdue tasks', () => {
    h.useQuery.mockReturnValue(
      queryStub({ isSuccess: true, data: { ...stats, overdueCount: 0 } }),
    );
    render(<WorkspaceStatStrip workspaceId="w1" />);
    expect(screen.getByText(strings.home.stats.overdue.subEmpty)).toBeInTheDocument();
  });
});
