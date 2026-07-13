import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BoardSettingsDropdown, type BoardSettingsTab } from './board-settings-dropdown';

vi.mock('./background-picker', () => ({
  BoardBackgroundPicker: () => <div>background picker</div>,
}));

vi.mock('./board-icon-picker', () => ({
  BoardIconPicker: () => <div>board icon picker</div>,
}));

vi.mock('./board-api-keys-section', () => ({
  BoardApiKeysSection: () => <div>board api keys section</div>,
}));

function renderDropdown(activeTab: BoardSettingsTab, canManage = true) {
  render(
    <BoardSettingsDropdown
      boardId="b1"
      workspaceId="w1"
      currentIcon="layout-grid"
      currentBackground={null}
      canManage={canManage}
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

/**
 * DEM-154 — bu dropdown artık yalnız "ayar" sekmelerini taşır (arka plan / pano
 * işlemleri). Üyelik bağlamı `BoardMembersDropdown`'a, etiket paleti
 * `BoardLabelsDropdown`'a taşındı.
 */
describe('<BoardSettingsDropdown>', () => {
  it('renders the background picker on the background tab', () => {
    renderDropdown('background');
    expect(screen.getByText('background picker')).toBeInTheDocument();
  });

  it('renders the board icon picker on the actions tab', () => {
    renderDropdown('actions');
    expect(screen.getByText('board icon picker')).toBeInTheDocument();
  });

  it('no longer exposes the membership or labels tabs', () => {
    renderDropdown('background');
    expect(screen.queryByRole('tab', { name: /Üyeler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Davetler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Talepler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Etiketler/ })).not.toBeInTheDocument();
  });

  it('renders the API keys section on the apiKeys tab (admin)', () => {
    renderDropdown('apiKeys');
    expect(screen.getByText('board api keys section')).toBeInTheDocument();
  });

  it('hides the API keys tab from non-admins', () => {
    renderDropdown('background', false);
    expect(screen.queryByRole('tab', { name: /API/ })).not.toBeInTheDocument();
    expect(screen.queryByText('board api keys section')).not.toBeInTheDocument();
  });
});
