import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { RoleBadge } from '../role-badge';

/** Faz 7N — `RoleBadge` (üye satırı rol rozeti) bileşen birim testleri. */

describe('RoleBadge', () => {
  it('verilen rol etiketini gösterir', () => {
    render(<RoleBadge label="Yönetici" />);
    expect(screen.getByText('Yönetici')).toBeTruthy();
  });

  it('farklı etiketler ayrı render edilir', () => {
    const { rerender } = render(<RoleBadge label="Üye" />);
    expect(screen.getByText('Üye')).toBeTruthy();
    rerender(<RoleBadge label="Gözlemci" />);
    expect(screen.getByText('Gözlemci')).toBeTruthy();
    expect(screen.queryByText('Üye')).toBeNull();
  });
});
