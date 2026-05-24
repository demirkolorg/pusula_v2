/**
 * Faz 13Q (DEM-273) — `report-i18n-tr.ts` flat map + flatten helper testleri.
 *
 * Print pipeline envelope payload'una gömülen i18n map'inin:
 *  - Nested JSON ağacını doğru flat key path'e dönüştürdüğünü
 *  - `reports.` prefix'ini eklediğini
 *  - REPORT_I18N_KEYS leaf'lerini eksiksiz içerdiğini
 * doğrular.
 */
import { describe, expect, it } from 'vitest';
import { REPORT_I18N_KEYS } from '@pusula/domain/reports';
import { flattenLocaleTree, REPORT_PRINT_I18N_TR } from './report-i18n-tr';

function collectLeafStrings(obj: unknown, out: Set<string>): void {
  if (typeof obj === 'string') {
    out.add(obj);
    return;
  }
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      collectLeafStrings(v, out);
    }
  }
}

describe('flattenLocaleTree', () => {
  it('düz nested objeyi `reports.x.y` flat key path\'e çevirir', () => {
    const flat = flattenLocaleTree({
      composer: { title: { create: 'Yeni' } },
    });
    expect(flat).toEqual({
      'reports.composer.title.create': 'Yeni',
    });
  });

  it('birden fazla leaf\'i aynı seviyede ele alır', () => {
    const flat = flattenLocaleTree({
      delta: { up: 'artış', down: 'azalış', neutral: 'değişim yok' },
    });
    expect(flat).toEqual({
      'reports.delta.up': 'artış',
      'reports.delta.down': 'azalış',
      'reports.delta.neutral': 'değişim yok',
    });
  });

  it('boş objeyi atlatır (recursion sonsuza gitmesin)', () => {
    expect(flattenLocaleTree({ presets: {} })).toEqual({});
  });

  it('array değerleri ignore eder (yapısal koruma)', () => {
    const flat = flattenLocaleTree({
      list: ['a', 'b'] as unknown as Record<string, unknown>,
      ok: 'değer',
    });
    expect(flat).toEqual({ 'reports.ok': 'değer' });
  });

  it('null/undefined leaf\'leri atlatır', () => {
    const flat = flattenLocaleTree({
      a: 'x',
      b: null as unknown as Record<string, unknown>,
    });
    expect(flat).toEqual({ 'reports.a': 'x' });
  });
});

describe('REPORT_PRINT_I18N_TR', () => {
  it('tüm REPORT_I18N_KEYS leaf\'leri flat map\'te mevcut', () => {
    const canonicalKeys = new Set<string>();
    collectLeafStrings(REPORT_I18N_KEYS, canonicalKeys);

    const missing = [...canonicalKeys].filter((k) => !(k in REPORT_PRINT_I18N_TR));
    expect(missing).toEqual([]);
  });

  it('preset title key\'leri camelCase ID kullanır (REPORT_I18N_KEYS ile uyumlu)', () => {
    expect(REPORT_PRINT_I18N_TR['reports.presets.cardOverview.title']).toBe('Kart Genel Bakış');
    expect(REPORT_PRINT_I18N_TR['reports.presets.boardHealth.title']).toBe('Pano Sağlık');
  });

  it('micro-report title + emptyState key\'leri TR string döner', () => {
    expect(REPORT_PRINT_I18N_TR['reports.microReports.activityTimeline.title']).toBe(
      'Etkinlik Zaman Çizelgesi',
    );
    expect(REPORT_PRINT_I18N_TR['reports.microReports.entitySummary.emptyState']).toBe(
      'Veri yok.',
    );
  });

  it('placeholder formatı single-brace `{name}` (mustache değil)', () => {
    expect(REPORT_PRINT_I18N_TR['reports.email.subject']).toContain('{title}');
    expect(REPORT_PRINT_I18N_TR['reports.email.subject']).not.toContain('{{title}}');
  });

  it('frozen object — runtime mutation guard', () => {
    expect(Object.isFrozen(REPORT_PRINT_I18N_TR)).toBe(true);
  });
});
