import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { FormMessage } from '../form-message';

/** Faz 7N — `FormMessage` (form bilgi/hata kutusu) bileşen birim testleri. */

describe('FormMessage', () => {
  it('mesaj metnini gösterir', () => {
    render(<FormMessage>Bir şeyler ters gitti</FormMessage>);
    expect(screen.getByText('Bir şeyler ters gitti')).toBeTruthy();
  });

  it('alert rolüyle render edilir (ekran okuyucu duyurusu)', () => {
    render(<FormMessage>Hata oluştu</FormMessage>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('info tonu da mesajı gösterir', () => {
    render(<FormMessage tone="info">Doğrulama e-postası gönderildi</FormMessage>);
    expect(screen.getByText('Doğrulama e-postası gönderildi')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
