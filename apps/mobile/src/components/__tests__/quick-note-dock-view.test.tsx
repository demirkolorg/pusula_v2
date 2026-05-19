import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { QuickNoteDockView } from '../quick-note-dock-view';

/**
 * DEM-230 — `QuickNoteDockView` (anasayfa hızlı-not dock'u sunum katmanı)
 * birim testleri. Saf presentational: butonsuz tam-satır metin alanının
 * render'ı, değer gösterimi ve `onChangeText` callback'i doğrulanır.
 */

/** Zorunlu callback prop'larını no-op ile dolduran render yardımcısı. */
function renderDock(props: Partial<Parameters<typeof QuickNoteDockView>[0]> = {}) {
  return render(
    <QuickNoteDockView value="" onChangeText={vi.fn()} onHeightChange={vi.fn()} {...props} />,
  );
}

describe('QuickNoteDockView', () => {
  it('hızlı-not metin alanını gösterir', () => {
    renderDock();
    expect(screen.getByLabelText('Hızlı bir not yaz…')).toBeTruthy();
  });

  it('verilen taslak değerini metin alanında gösterir', () => {
    renderDock({ value: 'Yarım kalan not' });
    expect(screen.getByDisplayValue('Yarım kalan not')).toBeTruthy();
  });

  it('metin değişince onChangeText yeni metinle çağrılır', () => {
    const onChangeText = vi.fn();
    renderDock({ onChangeText });
    fireEvent.change(screen.getByLabelText('Hızlı bir not yaz…'), {
      target: { value: 'Süt al' },
    });
    expect(onChangeText).toHaveBeenCalledWith('Süt al');
  });
});
