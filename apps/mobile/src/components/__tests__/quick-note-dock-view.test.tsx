import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { QuickNoteDockView } from '../quick-note-dock-view';

/**
 * DEM-230 — `QuickNoteDockView` (anasayfa hızlı-not dock'u sunum katmanı)
 * birim testleri. Saf presentational: butonsuz tam-satır metin alanının
 * render'ı, değer gösterimi ve `onChangeText` callback'i doğrulanır.
 *
 * DEM-236 2. tur (2026-05-21): inline send butonu davranışı (görünür/disabled,
 * onPress, başarı sonrası "Kaydedildi" feedback'i) testlere eklendi.
 */

/** Zorunlu callback prop'larını no-op ile dolduran render yardımcısı. */
function renderDock(props: Partial<Parameters<typeof QuickNoteDockView>[0]> = {}) {
  return render(
    <QuickNoteDockView
      value=""
      onChangeText={vi.fn()}
      onSubmit={vi.fn()}
      canSubmit={false}
      onHeightChange={vi.fn()}
      {...props}
    />,
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

  it('send butonunu canSubmit=false iken disabled render eder (DEM-236 2. tur)', () => {
    renderDock({ canSubmit: false });
    const sendButton = screen.getByLabelText('Ekle');
    expect(sendButton).toBeTruthy();
    // Disabled durumda accessibility props yansır — web bridge `aria-disabled`.
    expect(sendButton.getAttribute('aria-disabled')).toBe('true');
  });

  it('send butonu canSubmit=true iken aktif olur (DEM-236 2. tur)', () => {
    renderDock({ canSubmit: true, value: 'Yapılacak iş' });
    const sendButton = screen.getByLabelText('Ekle');
    // RN Pressable `disabled={false}` durumunda `aria-disabled` attribute'u
    // atlayabilir — `'true'` olmamasına bakmak yeterli.
    expect(sendButton.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('canSubmit=true ile send butonuna basılınca onSubmit çağrılır (DEM-236 2. tur)', () => {
    const onSubmit = vi.fn();
    renderDock({ canSubmit: true, value: 'Yapılacak iş', onSubmit });
    fireEvent.click(screen.getByLabelText('Ekle'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('canSubmit=false iken send butonuna basılsa bile onSubmit çağrılmaz (DEM-236 2. tur)', () => {
    const onSubmit = vi.fn();
    renderDock({ canSubmit: false, onSubmit });
    fireEvent.click(screen.getByLabelText('Ekle'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('başarılı submit sonrası "Kaydedildi" feedback metni görünür (DEM-236 2. tur)', () => {
    renderDock({ canSubmit: true, value: 'Yapılacak iş' });
    expect(screen.queryByText('Kaydedildi')).toBeNull();
    fireEvent.click(screen.getByLabelText('Ekle'));
    expect(screen.getByText('Kaydedildi')).toBeTruthy();
  });
});
