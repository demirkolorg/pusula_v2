/**
 * Faz 13G (DEM-263) — PermissionGatedButton primitive testleri.
 *
 * Davranış:
 *  - `can=true` → buton normal render
 *  - `can=false, hide=true` → tamamen gizli
 *  - `can=false, hide=false` → disabled + tooltip reason
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@pusula/ui';
import { PermissionGatedButton } from '../shared/permission-gated-button';

function renderButton(props: React.ComponentProps<typeof PermissionGatedButton>) {
  return render(
    <TooltipProvider>
      <PermissionGatedButton {...props} />
    </TooltipProvider>,
  );
}

describe('PermissionGatedButton', () => {
  it('can=true → buton normal render edilir, disabled değil', () => {
    renderButton({ can: true, children: 'Kaydet' });
    const btn = screen.getByRole('button', { name: 'Kaydet' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('can=false + hide=true → DOM\'a girmez', () => {
    renderButton({ can: false, hide: true, children: 'Kaydet' });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('can=false + hide=false + reason → aria-disabled görünür (klavye erişimi korunur)', () => {
    // A11y S3: HTML `disabled` yerine `aria-disabled` — focusable kalsın
    // ki klavye kullanıcısı tooltip reason'ı görebilsin.
    renderButton({
      can: false,
      hide: false,
      reason: 'Sadece yöneticiler kaydedebilir',
      children: 'Kaydet',
    });
    const btn = screen.getByRole('button', { name: 'Kaydet' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('data-permission-denied');
  });

  it('can=false + hide=false + reason yok → standart disabled (eski davranış)', () => {
    renderButton({
      can: false,
      hide: false,
      children: 'Kaydet',
    });
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('explicit disabled=true ile can=true → buton hâlâ disabled', () => {
    renderButton({ can: true, disabled: true, children: 'Kaydet' });
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });
});
