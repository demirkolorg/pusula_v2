import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardMemberRow, type BoardMemberRowMember } from './board-member-row';

const copy = strings.board.settings;

const explicitAdmin: BoardMemberRowMember = {
  userId: 'u-admin',
  name: 'Ada Yönetici',
  role: 'admin',
  inherited: false,
};
const explicitMember: BoardMemberRowMember = {
  userId: 'u-member',
  name: 'Bora Üye',
  role: 'member',
  inherited: false,
};
const inheritedAdmin: BoardMemberRowMember = {
  userId: 'u-ws-owner',
  name: 'Cem Workspace Sahibi',
  role: 'admin',
  inherited: true,
};

describe('<BoardMemberRow>', () => {
  it('manager viewer, other explicit member: role select + remove button are shown', () => {
    render(
      <BoardMemberRow
        member={explicitMember}
        viewerUserId="u-admin"
        canManage
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: copy.roleLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.remove })).toBeInTheDocument();
    expect(screen.queryByText(copy.youBadge)).not.toBeInTheDocument();
  });

  it('inherited (workspace owner/admin) row: no role select / remove, shows the inherited note', () => {
    render(
      <BoardMemberRow
        member={inheritedAdmin}
        viewerUserId="u-admin"
        canManage
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.inheritedNote)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.remove })).not.toBeInTheDocument();
    // Role is shown as a static badge.
    expect(screen.getByText('Yönetici')).toBeInTheDocument();
  });

  it('the last explicit admin: locked — no role select / remove, shows the last-admin note', () => {
    render(
      <BoardMemberRow
        member={explicitAdmin}
        viewerUserId="u-someone-else"
        canManage
        isLastAdmin
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.lastAdminNote)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.remove })).not.toBeInTheDocument();
  });

  it("the viewer's own explicit (non-last-admin) row: leave button, no role select", () => {
    render(
      <BoardMemberRow
        member={{ ...explicitMember, userId: 'u-self' }}
        viewerUserId="u-self"
        canManage
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.youBadge)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.leave })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('non-manager viewer: no actions on other rows, role shown as a badge', () => {
    render(<BoardMemberRow member={explicitMember} viewerUserId="u-other" canManage={false} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.remove })).not.toBeInTheDocument();
    expect(screen.getByText('Üye')).toBeInTheDocument();
  });

  it('falls back to the user id when the member has no name', () => {
    render(<BoardMemberRow member={{ ...explicitMember, name: null }} viewerUserId="u-other" canManage={false} />);
    expect(screen.getByText('u-member')).toBeInTheDocument();
  });

  it('role select change calls onRoleChange with the chosen board role', async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();
    render(
      <BoardMemberRow member={explicitMember} viewerUserId="u-admin" canManage onRoleChange={onRoleChange} />,
    );
    await user.click(screen.getByRole('combobox', { name: copy.roleLabel }));
    await user.click(screen.getByRole('option', { name: 'İzleyici' }));
    expect(onRoleChange).toHaveBeenCalledWith('viewer');
  });

  it('remove → confirm dialog → onConfirm calls onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<BoardMemberRow member={explicitMember} viewerUserId="u-admin" canManage onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: copy.remove }));
    await user.click(screen.getByRole('button', { name: copy.removeConfirm }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('surfaces an inline error for the row', () => {
    render(
      <BoardMemberRow
        member={explicitMember}
        viewerUserId="u-admin"
        canManage
        error="Son board admini rolden düşürülemez."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Son board admini rolden düşürülemez.');
  });
});
