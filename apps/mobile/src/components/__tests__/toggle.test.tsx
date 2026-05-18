import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { Toggle } from '../toggle';

/** Faz 7N — `Toggle` (RN `Switch` sarmalayıcısı) bileşen birim testleri. */

describe('Toggle', () => {
  it('verilen erişilebilirlik etiketiyle switch rolünde render edilir', () => {
    render(<Toggle value={false} onValueChange={() => {}} accessibilityLabel="Bildirimler" />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeTruthy();
    expect(sw.getAttribute('aria-label')).toBe('Bildirimler');
  });

  it('etikete göre sorgulanabilir', () => {
    render(<Toggle value onValueChange={() => {}} accessibilityLabel="Sessiz saatler" />);
    expect(screen.getByLabelText('Sessiz saatler')).toBeTruthy();
  });

  it('dokunulduğunda onValueChange çağrılır', () => {
    const onChange = vi.fn();
    render(<Toggle value={false} onValueChange={onChange} accessibilityLabel="Tıkla" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disabled iken devre dışı durum taşır ve dokunma callback tetiklemez', () => {
    const onChange = vi.fn();
    render(<Toggle value={false} onValueChange={onChange} disabled accessibilityLabel="Kapalı" />);
    const sw = screen.getByRole('switch') as HTMLInputElement;
    expect(sw.disabled).toBe(true);
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});
