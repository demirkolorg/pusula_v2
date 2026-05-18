import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { RoleSelect } from '../role-select';

/** Faz 7N — `RoleSelect` (yatay rol çip grubu) bileşen birim testleri. */

const OPTIONS = [
  { value: 'admin', label: 'Yönetici' },
  { value: 'member', label: 'Üye' },
  { value: 'viewer', label: 'Gözlemci' },
] as const;

describe('RoleSelect', () => {
  it('grup etiketini ve tüm seçenekleri gösterir', () => {
    render(<RoleSelect label="Rol" options={OPTIONS} value="member" onChange={() => {}} />);
    expect(screen.getByText('Rol')).toBeTruthy();
    expect(screen.getByText('Yönetici')).toBeTruthy();
    expect(screen.getByText('Üye')).toBeTruthy();
    expect(screen.getByText('Gözlemci')).toBeTruthy();
  });

  it('bir çipe basıldığında onChange o değerle çağrılır', () => {
    const onChange = vi.fn();
    render(<RoleSelect label="Rol" options={OPTIONS} value="member" onChange={onChange} />);
    fireEvent.click(screen.getByText('Yönetici'));
    expect(onChange).toHaveBeenCalledWith('admin');
  });

  it('disabled iken çipe basış onChange tetiklemez', () => {
    const onChange = vi.fn();
    render(
      <RoleSelect label="Rol" options={OPTIONS} value="member" onChange={onChange} disabled />,
    );
    fireEvent.click(screen.getByText('Gözlemci'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('seçili çip metni semibold ağırlıkta, seçili olmayan regular render edilir', () => {
    render(<RoleSelect label="Rol" options={OPTIONS} value="viewer" onChange={() => {}} />);
    // Seçili çip `weight="semibold"` (Poppins_600SemiBold) — `text.tsx`
    // ağırlığı `fontFamily` ile uygular; seçili çip ayırt edici sinyal.
    expect(screen.getByText('Gözlemci').getAttribute('style')).toContain('Poppins_600SemiBold');
    expect(screen.getByText('Üye').getAttribute('style')).toContain('Poppins_400Regular');
  });
});
