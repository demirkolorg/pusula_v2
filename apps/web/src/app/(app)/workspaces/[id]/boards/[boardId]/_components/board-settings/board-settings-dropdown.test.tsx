import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BoardSettingsDropdown } from './board-settings-dropdown';

vi.mock('./board-members-section', () => ({
  BoardMembersSection: () => <div>board members section</div>,
}));

vi.mock('./board-invitations-section', () => ({
  BoardInvitationsSection: () => <div>board invitations section</div>,
}));

vi.mock('./board-access-requests-section', () => ({
  BoardAccessRequestsSection: () => <div>board access requests section</div>,
}));

vi.mock('./background-picker', () => ({
  BoardBackgroundPicker: () => <div>background picker</div>,
}));

vi.mock('./board-icon-picker', () => ({
  BoardIconPicker: () => <div>board icon picker</div>,
}));

vi.mock('./board-labels-section', () => ({
  BoardLabelsSection: () => <div>board labels section</div>,
}));

function renderDropdown(activeTab: 'members' | 'invitations' | 'accessRequests') {
  render(
    <BoardSettingsDropdown
      boardId="b1"
      workspaceId="w1"
      currentIcon="layout-grid"
      currentBackground={null}
      canManage
      boardActive
      archived={false}
      open
      activeTab={activeTab}
      onOpenChange={vi.fn()}
      onActiveTabChange={vi.fn()}
      onRename={vi.fn()}
      onArchive={vi.fn()}
      onRestore={vi.fn()}
      restorePending={false}
    />,
  );
}

describe('<BoardSettingsDropdown>', () => {
  it('shows the board member role info button on the members tab', () => {
    renderDropdown('members');
    expect(screen.getByRole('button', { name: 'Pano rol bilgisi' })).toBeInTheDocument();
  });

  it('shows the board invitation info button on the invitations tab', () => {
    renderDropdown('invitations');
    expect(screen.getByRole('button', { name: 'Pano davet bilgisi' })).toBeInTheDocument();
  });

  it('shows the board access request info button on the access requests tab', () => {
    renderDropdown('accessRequests');
    expect(screen.getByRole('button', { name: 'Pano erişim talebi bilgisi' })).toBeInTheDocument();
  });
});
