import { describe, expect, it } from 'vitest';
import {
  attachmentIconName,
  formatBytes,
  isAllowedAttachmentMime,
  mimeFromFileName,
  resolveAttachmentMime,
  safeCacheFileName,
  uploadPercent,
  validatePickedFile,
} from '../lib/attachment-format';

/**
 * Faz 7J — kart eki saf biçimleme/doğrulama birim testleri. Yükleme öncesi
 * istemci doğrulaması backend allowlist (8 MIME) + 50 MiB sınırını yansıtmalı.
 */

describe('isAllowedAttachmentMime', () => {
  it('allowlisted MIME tiplerini kabul eder', () => {
    expect(isAllowedAttachmentMime('image/png')).toBe(true);
    expect(isAllowedAttachmentMime('application/pdf')).toBe(true);
    expect(
      isAllowedAttachmentMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('allowlist dışı tipleri ve boş değeri reddeder', () => {
    expect(isAllowedAttachmentMime('image/svg+xml')).toBe(false);
    expect(isAllowedAttachmentMime('application/zip')).toBe(false);
    expect(isAllowedAttachmentMime(null)).toBe(false);
    expect(isAllowedAttachmentMime(undefined)).toBe(false);
  });
});

describe('mimeFromFileName', () => {
  it('uzantıdan allowlisted MIME türetir (büyük/küçük harf duyarsız)', () => {
    expect(mimeFromFileName('rapor.PDF')).toBe('application/pdf');
    expect(mimeFromFileName('foto.jpeg')).toBe('image/jpeg');
    expect(mimeFromFileName('sunum.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('uzantı yoksa / desteklenmiyorsa null döner', () => {
    expect(mimeFromFileName('uzantisiz')).toBeNull();
    expect(mimeFromFileName('arsiv.zip')).toBeNull();
    expect(mimeFromFileName('nokta.')).toBeNull();
    expect(mimeFromFileName(null)).toBeNull();
  });
});

describe('resolveAttachmentMime', () => {
  it('picker MIME geçerliyse onu kullanır', () => {
    expect(resolveAttachmentMime('image/webp', 'a.bin')).toBe('image/webp');
  });

  it('picker MIME geçersizse dosya adından türetir', () => {
    expect(resolveAttachmentMime(undefined, 'belge.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(resolveAttachmentMime('application/octet-stream', 'foto.png')).toBe('image/png');
  });

  it('ikisi de çözülemezse null döner', () => {
    expect(resolveAttachmentMime('application/octet-stream', 'dosya')).toBeNull();
  });
});

describe('validatePickedFile', () => {
  it('geçerli dosyayı çözülen MIME ile kabul eder', () => {
    expect(
      validatePickedFile({ mimeType: 'image/png', fileName: 'a.png', size: 1024 }),
    ).toEqual({ ok: true, mimeType: 'image/png' });
  });

  it('MIME çözülemezse mime sebebiyle reddeder', () => {
    expect(
      validatePickedFile({ mimeType: 'application/zip', fileName: 'a.zip', size: 1024 }),
    ).toEqual({ ok: false, reason: 'mime' });
  });

  it('50 MiB üstünü size sebebiyle reddeder', () => {
    const tooBig = 50 * 1024 * 1024 + 1;
    expect(
      validatePickedFile({ mimeType: 'application/pdf', fileName: 'a.pdf', size: tooBig }),
    ).toEqual({ ok: false, reason: 'size' });
  });

  it('tam 50 MiB sınırını kabul eder', () => {
    expect(
      validatePickedFile({
        mimeType: 'application/pdf',
        fileName: 'a.pdf',
        size: 50 * 1024 * 1024,
      }).ok,
    ).toBe(true);
  });

  it('boş / okunamayan boyutu empty sebebiyle reddeder', () => {
    expect(
      validatePickedFile({ mimeType: 'image/png', fileName: 'a.png', size: 0 }),
    ).toEqual({ ok: false, reason: 'empty' });
    expect(
      validatePickedFile({ mimeType: 'image/png', fileName: 'a.png', size: null }),
    ).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('formatBytes', () => {
  it('birimleri 1024 tabanıyla ölçekler', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('geçersiz / sıfır boyut için 0 B döner', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('attachmentIconName', () => {
  it('kind değerini Feather ikon adına eşler', () => {
    expect(attachmentIconName('image')).toBe('image');
    expect(attachmentIconName('pdf')).toBe('file-text');
    expect(attachmentIconName('office')).toBe('file-text');
    expect(attachmentIconName(null)).toBe('file');
  });
});

describe('safeCacheFileName', () => {
  it('yol ayıracı ve güvensiz karakterleri sadeleştirir', () => {
    expect(safeCacheFileName('alt/üst dosya.pdf')).toBe('alt-st-dosya.pdf');
    expect(safeCacheFileName('  ')).toBe('ek-dosyasi');
  });
});

describe('uploadPercent', () => {
  it('gönderilen/beklenen oranını 0–100 tamsayıya çevirir', () => {
    expect(uploadPercent(0, 100)).toBe(0);
    expect(uploadPercent(50, 100)).toBe(50);
    expect(uploadPercent(100, 100)).toBe(100);
    expect(uploadPercent(1, 3)).toBe(33);
  });

  it('beklenen boyut bilinmiyorsa 0 döner', () => {
    expect(uploadPercent(10, 0)).toBe(0);
    expect(uploadPercent(10, -1)).toBe(0);
    expect(uploadPercent(10, Number.NaN)).toBe(0);
  });

  it('sınır dışı değerleri kırpar', () => {
    // Beklenenden fazla bayt bildirilse de 100'ü aşmaz.
    expect(uploadPercent(150, 100)).toBe(100);
    // Negatif gönderim 0'a sabitlenir.
    expect(uploadPercent(-5, 100)).toBe(0);
    expect(uploadPercent(Number.NaN, 100)).toBe(0);
  });
});
