import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { QuickNoteRow } from '../quick-note-row';
import type { QuickNote } from '../../lib/use-quick-note-mutations';

/**
 * DEM-231 — `QuickNoteRow` (Hızlı Notlar satırı, kaydırmalı aksiyonlar) birim
 * testleri. Satır-içi buton yerine `SwipeRow` ile açılan üç aksiyon doğrulanır.
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
  it('not metnini gösterir', () => {
    renderRow({ note: makeNote({ content: 'Süt al' }) });
    expect(screen.getByText('Süt al')).toBeTruthy();
  });

  it('kaydırmalı üç aksiyonu (düzenle / taşı / sil) sunar', () => {
    renderRow();
    expect(screen.getByLabelText('Notu düzenle')).toBeTruthy();
    expect(screen.getByLabelText('Panoya taşı')).toBeTruthy();
    expect(screen.getByLabelText('Notu sil')).toBeTruthy();
  });

  it('"Panoya taşı" aksiyonuna dokununca onConvert çağrılır', () => {
    const onConvert = vi.fn();
    renderRow({ onConvert });
    fireEvent.click(screen.getByLabelText('Panoya taşı'));
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it('geçici (tmp-) id\'li notta kaydırmalı aksiyon sunulmaz', () => {
    renderRow({ note: makeNote({ id: 'tmp-1', content: 'Henüz kaydedilmedi' }) });
    expect(screen.getByText('Henüz kaydedilmedi')).toBeTruthy();
    expect(screen.queryByLabelText('Notu sil')).toBeNull();
  });
});
