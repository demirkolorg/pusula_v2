import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../lib/auth-errors';
import { strings } from '../lib/strings';

/**
 * Faz 7B — `authErrorMessage` saf hata-eşleme birim testleri.
 */
describe('authErrorMessage', () => {
  it('Better Auth result.error nesnesinin mesajını döndürür', () => {
    expect(authErrorMessage({ message: 'E-posta veya parola hatalı', code: 'INVALID' })).toBe(
      'E-posta veya parola hatalı',
    );
  });

  it('yakalanan Error örneğinin mesajını döndürür', () => {
    expect(authErrorMessage(new Error('Ağ hatası'))).toBe('Ağ hatası');
  });

  it('mesaj boş/whitespace ise genel hata metnine düşer', () => {
    expect(authErrorMessage({ message: '   ' })).toBe(strings.common.unknownError);
    expect(authErrorMessage({ message: null })).toBe(strings.common.unknownError);
  });

  it('null / undefined / mesajsız değerlerde genel hata metnine düşer', () => {
    expect(authErrorMessage(null)).toBe(strings.common.unknownError);
    expect(authErrorMessage(undefined)).toBe(strings.common.unknownError);
    expect(authErrorMessage('ham metin')).toBe(strings.common.unknownError);
    expect(authErrorMessage({ code: 'NO_MESSAGE' })).toBe(strings.common.unknownError);
  });

  it('mesajı baştan/sondan kırpar', () => {
    expect(authErrorMessage({ message: '  Oturum süresi doldu  ' })).toBe('Oturum süresi doldu');
  });
});
