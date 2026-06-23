import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { QuickNoteRow } from '../quick-note-row';
import type { QuickNote } from '../../lib/use-quick-note-mutations';

/**
 * `QuickNoteRow` ("Saved Messages" baloncuk tasarımı) birim testleri. Aksiyonlar
 * (düzenle / taşı / sil) baloncuğa dokununca açılan `QuickNoteActionsSheet` ile
 * sunulur — eski kaydırmalı (`SwipeRow`) desen kaldırıldı.
 */

const now = new Date('2026-05-19T00:00:00.000Z');

/** `quickNote.list` satırına uygun minimal not fixture'ı. */
function makeNote(over: Partial<QuickNote> = {}): QuickNote {
  return { id: 'n1', content: 'Örnek not', createdAt: now, updatedAt: now, ...over };
}

/** Zorunlu callback prop'larını no-op ile dolduran render yardımcısı. */
function renderRow(props: Partial<Parameters<typeof QuickNoteRow>[0]> = {}) {
  return render(
    <QuickNoteRow
      note={makeNote()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onConvert={vi.fn()}
      {...props}
    />,
  );
}

describe('QuickNoteRow', () => {
  it('not metnini baloncukta gösterir', () => {
    renderRow({ note: makeNote({ content: 'Süt al' }) });
    expect(screen.getByText('Süt al')).toBeTruthy();
  });

  it('baloncuğa dokununca üç aksiyonu (düzenle / taşı / sil) açar', () => {
    renderRow({ note: makeNote({ content: 'Süt al' }) });
    // Menü kapalıyken aksiyonlar yok.
    expect(screen.queryByLabelText('Notu sil')).toBeNull();
    // Baloncuğa dokun → aksiyon sheet'i açılır.
    fireEvent.click(screen.getByText('Süt al'));
    expect(screen.getByLabelText('Notu düzenle')).toBeTruthy();
    expect(screen.getByLabelText('Panoya taşı')).toBeTruthy();
    expect(screen.getByLabelText('Notu sil')).toBeTruthy();
  });

  it('"Panoya taşı" aksiyonuna dokununca onConvert çağrılır', () => {
    const onConvert = vi.fn();
    renderRow({ note: makeNote({ content: 'Süt al' }), onConvert });
    fireEvent.click(screen.getByText('Süt al'));
    fireEvent.click(screen.getByLabelText('Panoya taşı'));
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it('geçici (tmp-) id\'li notta baloncuğa dokunmak menü açmaz', () => {
    renderRow({ note: makeNote({ id: 'tmp-1', content: 'Henüz kaydedilmedi' }) });
    expect(screen.getByText('Henüz kaydedilmedi')).toBeTruthy();
    fireEvent.click(screen.getByText('Henüz kaydedilmedi'));
    expect(screen.queryByLabelText('Notu sil')).toBeNull();
  });
});
