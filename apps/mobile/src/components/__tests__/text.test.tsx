import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { Text } from '../text';

/** Faz 7N — `Text` (Poppins ağırlık eşleyici) bileşen birim testleri. */

describe('Text', () => {
  it('çocuk metni render eder', () => {
    render(<Text>Merhaba</Text>);
    expect(screen.getByText('Merhaba')).toBeTruthy();
  });

  it('weight verilmezse Poppins_400Regular ailesi uygulanır', () => {
    render(<Text>Varsayılan</Text>);
    expect(screen.getByText('Varsayılan').getAttribute('style')).toContain('Poppins_400Regular');
  });

  it('weight=semibold ile Poppins_600SemiBold ailesi uygulanır', () => {
    render(<Text weight="semibold">Kalınca</Text>);
    expect(screen.getByText('Kalınca').getAttribute('style')).toContain('Poppins_600SemiBold');
  });

  it('weight=bold ile Poppins_700Bold ailesi uygulanır', () => {
    render(<Text weight="bold">Kalın</Text>);
    expect(screen.getByText('Kalın').getAttribute('style')).toContain('Poppins_700Bold');
  });
});
