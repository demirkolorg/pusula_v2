import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberRow, type MemberRowMember } from './member-row';

const owner: MemberRowMember = {
  userId: 'u-owner',
  name: 'Ayşe Sahip',
  email: 'ayse@example.com',
  role: 'owner',
};
const admin: MemberRowMember = {
  userId: 'u-admin',
  name: 'Mehmet Yönetici',
  email: 'mehmet@example.com',
  role: 'admin',
};
const member: MemberRowMember = {
  userId: 'u-member',
  name: 'Zeynep Üye',
  email: 'zeynep@example.com',
  role: 'member',
};

describe('<MemberRow>', () => {
  it('owner row: shows the owner badge and no actions, even for a manager viewer', () => {
    render(<MemberRow member={owner} viewerUserId="u-admin" canManage />);
    expect(screen.getByText('Sahip')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Çıkar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspace’ten ayrıl' })).not.toBeInTheDocument();
  });

  it('manager viewer, other non-owner member: role select + remove button are shown', () => {
    render(
      <MemberRow
        member={member}
        viewerUserId="u-admin"
        canManage
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // Radix Select's trigger has role="combobox".
    expect(screen.getByRole('combobox', { name: 'Rol' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çıkar' })).toBeInTheDocument();
    // It's not the viewer's own row.
    expect(screen.queryByText('Bu sizsiniz')).not.toBeInTheDocument();
  });

  it("the viewer's own (non-owner) row: leave button, no role select", () => {
    render(<MemberRow member={admin} viewerUserId="u-admin" canManage onLeave={vi.fn()} />);
    expect(screen.getByText('Bu sizsiniz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workspace’ten ayrıl' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // Own role shown as a static badge.
    expect(screen.getByText('Yönetici')).toBeInTheDocument();
  });

  it('non-manager viewer: no actions on other people rows', () => {
    render(<MemberRow member={member} viewerUserId="u-someone-else" canManage={false} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Çıkar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspace’ten ayrıl' })).not.toBeInTheDocument();
    expect(screen.getByText('Üye')).toBeInTheDocument();
  });

  it('falls back to the e-mail when the member has no name', () => {
    render(
      <MemberRow
        member={{ ...member, name: null }}
        viewerUserId="u-someone-else"
        canManage={false}
      />,
    );
    expect(screen.getAllByText('zeynep@example.com').length).toBeGreaterThan(0);
  });

  it('surfaces an inline error for the row', () => {
    render(
      <MemberRow
        member={member}
        viewerUserId="u-admin"
        canManage
        error="Owner rolü değiştirilemez."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Owner rolü değiştirilemez.');
  });
});
