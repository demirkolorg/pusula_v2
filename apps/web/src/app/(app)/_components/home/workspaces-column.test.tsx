import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacesColumn } from './workspaces-column';
import type { WorkspaceRow } from './types';

vi.mock('../create-workspace-dialog', () => ({
  CreateWorkspaceDialog: () => null,
}));

// useTRPC için minimum cevap: `workspace.list.queryKey()` cache anahtarı +
// `update` / `archive` için no-op `mutationOptions`. Mutation render path'i
// ContextMenu görünür ama testler tetiklemediği için no-op yeterli.
vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryKey: () => ['workspace.list'] },
      update: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      archive: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const baseWorkspace: WorkspaceRow = {
  id: 'w1',
  name: 'Pazarlama',
  slug: 'pazarlama',
  icon: null,
  role: 'owner',
  createdAt: new Date('2026-01-01'),
  boardCount: 3,
  memberCount: 5,
  lastActivityAt: null,
};

describe('<WorkspacesColumn>', () => {
  it('renders empty state when no workspaces', () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Çalışma alanı yok')).toBeInTheDocument();
  });

  it('renders each workspace name + meta', () => {
    const workspaces: WorkspaceRow[] = [
      baseWorkspace,
      {
        ...baseWorkspace,
        id: 'w2',
        name: 'Geliştirme',
        role: 'member',
        boardCount: 7,
        memberCount: 12,
      },
    ];
    renderWithProviders(
      <WorkspacesColumn
        workspaces={workspaces}
        selectedWorkspaceId="w1"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Pazarlama')).toBeInTheDocument();
    expect(screen.getByText('Geliştirme')).toBeInTheDocument();
    expect(screen.getByText(/3 pano · 5 üye/)).toBeInTheDocument();
    expect(screen.getByText(/7 pano · 12 üye/)).toBeInTheDocument();
  });

  it('marks the selected workspace with aria-pressed=true', () => {
    const workspaces: WorkspaceRow[] = [
      baseWorkspace,
      { ...baseWorkspace, id: 'w2', name: 'Geliştirme' },
    ];
    renderWithProviders(
      <WorkspacesColumn
        workspaces={workspaces}
        selectedWorkspaceId="w2"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Geliştirme');
  });

  it('calls onSelect when a workspace row is clicked', async () => {
    const onSelect = vi.fn();
    const workspaces: WorkspaceRow[] = [
      baseWorkspace,
      { ...baseWorkspace, id: 'w2', name: 'Geliştirme' },
    ];
    renderWithProviders(
      <WorkspacesColumn
        workspaces={workspaces}
        selectedWorkspaceId="w1"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Geliştirme/ }));
    expect(onSelect).toHaveBeenCalledWith('w2');
  });

  it('shows count in the header', () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[baseWorkspace, { ...baseWorkspace, id: 'w2', name: 'B' }]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('2 çalışma alanı')).toBeInTheDocument();
  });

  it('omits last-activity suffix when lastActivityAt is null', () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[baseWorkspace]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText(/aktif/)).not.toBeInTheDocument();
  });

  it('exposes a rename + archive context menu for an owner', async () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[baseWorkspace]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    // Sağ tık tetikleyicisi satır button'u; Radix `onContextMenu` ile açılır.
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Pazarlama/ }),
    });
    expect(
      await screen.findByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Arşivle' }),
    ).toBeInTheDocument();
  });

  it('hides the archive item for non-owners', async () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[{ ...baseWorkspace, role: 'admin' }]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Pazarlama/ }),
    });
    expect(
      await screen.findByRole('menuitem', { name: 'Yeniden adlandır' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Arşivle' }),
    ).not.toBeInTheDocument();
  });

  it('omits the context menu entirely for a guest viewer', async () => {
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[{ ...baseWorkspace, role: 'guest' }]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Pazarlama/ }),
    });
    // Misafir hiçbir eylem alamaz — ContextMenuTrigger disabled.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('appends a relative "aktif" suffix when lastActivityAt is set', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    renderWithProviders(
      <WorkspacesColumn
        workspaces={[
          {
            ...baseWorkspace,
            lastActivityAt: twoHoursAgo,
          },
        ]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/aktif/)).toBeInTheDocument();
  });
});
