import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { MemberActionSheet } from '../member-action-sheet';
import { strings } from '../../lib/strings';

/** DEM-210 — `MemberActionSheet` (üye aksiyon yüzeyi) bileşen birim testleri. */

const ROLES = [
  { value: 'admin', label: strings.members.roleAdmin },
  { value: 'member', label: strings.members.roleMember },
  { value: 'guest', label: strings.members.roleGuest },
] as const;

function renderSheet(overrides: Partial<Parameters<typeof MemberActionSheet>[0]> = {}) {
  const props = {
    visible: true,
    memberName: 'Ahmet Yılmaz',
    roleOptions: ROLES,
    currentRole: 'member' as const,
    onChangeRole: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    pending: false,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<MemberActionSheet {...props} />);
  return props;
}

describe('MemberActionSheet', () => {
  it('üye adını ve rol seçeneklerini gösterir', () => {
    renderSheet();
    expect(screen.getByText('Ahmet Yılmaz')).toBeTruthy();
    expect(screen.getByText(strings.members.roleAdmin)).toBeTruthy();
    expect(screen.getByText(strings.members.changeRoleSubmit)).toBeTruthy();
    expect(screen.getByText(strings.members.removeMember)).toBeTruthy();
  });

  it('rol değişmeden "Rolü güncelle" basışı yalnız sheet kapatır', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(strings.members.changeRoleSubmit));
    expect(props.onChangeRole).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('farklı rol seçilip güncellenince onChangeRole yeni rolle çağrılır', async () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(strings.members.roleAdmin));
    fireEvent.click(screen.getByText(strings.members.changeRoleSubmit));
    expect(props.onChangeRole).toHaveBeenCalledWith('admin');
  });

  it('pending=true iken güncelle butonu "Güncelleniyor…" gösterir', () => {
    renderSheet({ pending: true });
    expect(screen.getByText(strings.members.changeRoleSubmitting)).toBeTruthy();
  });
});
