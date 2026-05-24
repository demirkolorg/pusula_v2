/**
 * Faz 13Q (DEM-273) — TR locale dosyası ile `REPORT_I18N_KEYS` sync
 * doğrulaması. CI script (`check-i18n-keys.ts`) ile aynı invariant'ı
 * vitest seviyesinde garanti eder — fail erken görünür.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §12.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_I18N_KEYS } from '../i18n-keys';

const REPO_ROOT = resolve(__dirname, '../../../../..');

type LocaleTree = Record<string, unknown>;

function loadTree(relPath: string): LocaleTree {
  const raw = readFileSync(resolve(REPO_ROOT, relPath), 'utf-8');
  return JSON.parse(raw) as LocaleTree;
}

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

function flattenLocaleKeys(tree: LocaleTree, prefix = 'reports'): Set<string> {
  const out = new Set<string>();
  function walk(node: unknown, path: string): void {
    if (typeof node === 'string') {
      out.add(path);
      return;
    }
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, `${path}.${k}`);
      }
    }
  }
  for (const [k, v] of Object.entries(tree)) {
    walk(v, `${prefix}.${k}`);
  }
  return out;
}

describe('Faz 13Q — i18n locale sync', () => {
  const trWeb = loadTree('apps/web/src/locales/tr/reports.json');
  const enWeb = loadTree('apps/web/src/locales/en/reports.json');
  const trApi = loadTree('packages/api/src/lib/locales/tr-reports.json');

  const canonicalKeys = new Set<string>();
  collectLeafStrings(REPORT_I18N_KEYS, canonicalKeys);

  const trKeys = flattenLocaleKeys(trWeb);
  const enKeys = flattenLocaleKeys(enWeb);
  const trApiKeys = flattenLocaleKeys(trApi);

  it('REPORT_I18N_KEYS\'in tüm leaf\'leri TR locale\'de var', () => {
    const missing = [...canonicalKeys].filter((k) => !trKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('Web TR locale ile API server-side mirror byte-identical', () => {
    expect(JSON.stringify(trWeb)).toEqual(JSON.stringify(trApi));
  });

  it('EN locale TR ile aynı key ağacını taşır (placeholder + shape parity)', () => {
    const onlyInTr = [...trKeys].filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !trKeys.has(k));
    expect(onlyInTr).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('Print stub kapsamı: tüm REPORT_I18N_KEYS API mirror\'da da var (print pipeline garanti)', () => {
    const missing = [...canonicalKeys].filter((k) => !trApiKeys.has(k));
    expect(missing).toEqual([]);
  });
});
