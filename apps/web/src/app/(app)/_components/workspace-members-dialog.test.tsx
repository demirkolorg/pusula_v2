import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceRole } from '@pusula/domain';

vi.mock('../workspaces/[id]/_components/member-list', () => ({
  MemberList: ({ canManage }: { workspaceId: string; canManage: boolean }) => (
    <div data-testid="member-list">member list · canManage={String(canManage)}</div>
  ),
}));

vi.mock('./invite-member-dialog', () => ({
  InviteMemberDialog: () => <div data-testid="invite-member-dialog">invite</div>,
}));

import { WorkspaceMembersDialog } from './workspace-members-dialog';

function renderDialog(role: WorkspaceRole, open = true) {
  render(
    <WorkspaceMembersDialog
      workspaceId="w1"
      workspaceName="Çalışma Alanım"
      role={role}
      open={open}
      onOpenChange={() => {}}
    />,
  );
}

/**
 * DEM-155 — workspace switcher satırından açılan üye yönetimi modalı. Mevcut
 * `MemberList` bileşenini sarmalar; davet kontrolü yalnız `admin+` rollerde.
 */
describe('<WorkspaceMembersDialog>', () => {
  it('shows the workspace name and member list when open', () => {
    renderDialog('owner');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Çalışma Alanım')).toBeInTheDocument();
    expect(screen.getByTestId('member-list')).toBeInTheDocument();
  });

  it('grants management controls to owners and admins', () => {
    renderDialog('admin');
    expect(screen.getByTestId('invite-member-dialog')).toBeInTheDocument();
    expect(screen.getByText(/canManage=true/)).toBeInTheDocument();
  });

  it('hides the invite control for members and guests', () => {
    renderDialog('member');
    expect(screen.queryByTestId('invite-member-dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/canManage=false/)).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDialog('owner', false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument();
  });
});
