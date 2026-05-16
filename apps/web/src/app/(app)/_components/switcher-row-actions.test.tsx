import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@pusula/ui';

import { SwitcherRowActions } from './switcher-row-actions';

/**
 * DEM-155 — switcher dropdown satır hover/odak aksiyonları. "Ayarlar" + "Üyeler"
 * gerçek `DropdownMenuItem`'lardır; verilen etiketlerle çizilir ve seçildiğinde
 * ilgili handler'ı çağırır. Dropdown context'i gerektirir.
 */
describe('<SwitcherRowActions>', () => {
  function setup() {
    const onSettings = vi.fn();
    const onMembers = vi.fn();
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <SwitcherRowActions
            settingsLabel="Çalışma Alanım ayarları"
            membersLabel="Çalışma Alanım üyeleri"
            onSettings={onSettings}
            onMembers={onMembers}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    return { onSettings, onMembers };
  }

  it('renders the settings and members actions with their accessible labels', () => {
    setup();
    expect(
      screen.getByRole('menuitem', { name: 'Çalışma Alanım ayarları' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Çalışma Alanım üyeleri' }),
    ).toBeInTheDocument();
  });

  it('calls onSettings when the settings action is selected', async () => {
    const { onSettings, onMembers } = setup();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Çalışma Alanım ayarları' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onMembers).not.toHaveBeenCalled();
  });

  it('calls onMembers when the members action is selected', async () => {
    const { onSettings, onMembers } = setup();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Çalışma Alanım üyeleri' }));
    expect(onMembers).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
  });
});
