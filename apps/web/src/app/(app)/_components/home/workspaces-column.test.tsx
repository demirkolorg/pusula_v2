import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacesColumn } from './workspaces-column';
import type { WorkspaceRow } from './types';

vi.mock('../create-workspace-dialog', () => ({
  CreateWorkspaceDialog: () => null,
}));

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
    render(
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
    render(
      <WorkspacesColumn
        workspaces={workspaces}
        selectedWorkspaceId="w1"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Pazarlama')).toBeInTheDocument();
    expect(screen.getByText('Geliştirme')).toBeInTheDocument();
    // Her satırın meta bilgisi farklı — iki kez bulunmasın diye doğrudan sayıya bak.
    expect(screen.getByText(/3 pano · 5 üye/)).toBeInTheDocument();
    expect(screen.getByText(/7 pano · 12 üye/)).toBeInTheDocument();
  });

  it('marks the selected workspace with aria-pressed=true', () => {
    const workspaces: WorkspaceRow[] = [
      baseWorkspace,
      { ...baseWorkspace, id: 'w2', name: 'Geliştirme' },
    ];
    render(
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
    render(
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
    render(
      <WorkspacesColumn
        workspaces={[baseWorkspace, { ...baseWorkspace, id: 'w2', name: 'B' }]}
        selectedWorkspaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('2 çalışma alanı')).toBeInTheDocument();
  });
});
