import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { Button } from '../button';

/** Faz 7N — `Button` (NativeWind buton) bileşen birim testleri. */

describe('Button', () => {
  it('etiketini gösterir ve button rolünde render edilir', () => {
    render(<Button label="Kaydet" onPress={() => {}} />);
    expect(screen.getByText('Kaydet')).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('basıldığında onPress çağrılır', () => {
    const onPress = vi.fn();
    render(<Button label="Gönder" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled iken basış onPress tetiklemez', () => {
    const onPress = vi.fn();
    render(<Button label="Pasif" onPress={onPress} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('pending iken basış onPress tetiklemez (iş sürerken kilitli)', () => {
    const onPress = vi.fn();
    render(<Button label="Yükleniyor" onPress={onPress} pending />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ghost varyantı da etiketini gösterir', () => {
    render(<Button label="İptal" onPress={() => {}} variant="ghost" />);
    expect(screen.getByText('İptal')).toBeTruthy();
  });
});
