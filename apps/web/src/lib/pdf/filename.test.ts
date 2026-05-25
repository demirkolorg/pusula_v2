import { describe, expect, it } from 'vitest';
import {
  asciiSlug,
  contentDispositionFor,
  formatReportDate,
  makeClassicReportFilename,
} from './filename';

describe('asciiSlug', () => {
  it('Türkçe karakterleri ASCII karşılıklarıyla değiştirir', () => {
    expect(asciiSlug('Şirin Bayrampaşa Çorbacı İstanbul')).toBe(
      'sirin-bayrampasa-corbaci-istanbul',
    );
  });

  it('non-alphanumeric karakterleri tek tireye sıkıştırır + baş/son tire kırpar', () => {
    expect(asciiSlug('  Pano!!  ___ Adı 1  ')).toBe('pano-adi-1');
  });

  it('boş veya sadece özel karakterler → boş string', () => {
    expect(asciiSlug('')).toBe('');
    expect(asciiSlug('!!! ___ ???')).toBe('');
  });

  it('80 karakter ile sınırlandırır', () => {
    const long = 'a'.repeat(120);
    expect(asciiSlug(long)).toHaveLength(80);
  });
});

describe('formatReportDate', () => {
  it('Europe/Istanbul timezone\'da YYYY-MM-DD üretir', () => {
    // 2026-05-25 09:30 UTC → Istanbul'da +3 → aynı gün.
    expect(formatReportDate(new Date('2026-05-25T09:30:00Z'))).toBe('2026-05-25');
  });

  it('UTC günü farklı, Istanbul günü farklı → Istanbul günü kazanır', () => {
    // 2026-05-25 23:30 UTC → Istanbul'da 26 Mayıs 02:30 → 2026-05-26.
    expect(formatReportDate(new Date('2026-05-25T23:30:00Z'))).toBe('2026-05-26');
  });
});

describe('makeClassicReportFilename', () => {
  it('eski Pusula deseni: `{slug}-raporu-{tarih}.pdf` ASCII + UTF8 paralel', () => {
    const result = makeClassicReportFilename(
      'Bayrampaşa Belediyesi',
      new Date('2026-05-25T10:00:00Z'),
    );
    expect(result.ascii).toBe('bayrampasa-belediyesi-raporu-2026-05-25.pdf');
    expect(result.utf8).toBe('Bayrampaşa Belediyesi-raporu-2026-05-25.pdf');
  });

  it('boş başlık → "pano" fallback', () => {
    const result = makeClassicReportFilename('', new Date('2026-05-25T10:00:00Z'));
    expect(result.ascii).toBe('pano-raporu-2026-05-25.pdf');
    expect(result.utf8).toBe('Pano-raporu-2026-05-25.pdf');
  });
});

describe('contentDispositionFor', () => {
  it('RFC 5987 ASCII + filename*=UTF-8 her ikisini birlikte üretir', () => {
    const header = contentDispositionFor({
      ascii: 'pano-raporu-2026-05-25.pdf',
      utf8: 'Pano-raporu-2026-05-25.pdf',
    });
    expect(header).toBe(
      `attachment; filename="pano-raporu-2026-05-25.pdf"; filename*=UTF-8''Pano-raporu-2026-05-25.pdf`,
    );
  });

  it('UTF-8 başlığındaki Türkçe karakter encode edilir (boşluk → %20, ş → %C5%9F)', () => {
    const header = contentDispositionFor({
      ascii: 'bayrampasa-belediyesi-raporu-2026-05-25.pdf',
      utf8: 'Bayrampaşa Belediyesi-raporu-2026-05-25.pdf',
    });
    expect(header).toContain('%20'); // boşluk
    expect(header).toContain('%C5%9F'); // ş
    expect(header).toContain(`filename="bayrampasa-belediyesi-raporu-2026-05-25.pdf"`);
  });
});
