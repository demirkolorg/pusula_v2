/**
 * Faz 13G (DEM-263) + Faz 13Q (DEM-273) — i18n key resolver hook'u.
 *
 * 13Q öncesi resolver `strings.reports.*` (TS) üzerinden yapıyordu; 13Q
 * raporlama modülünün TR/EN locale dosyalarını ayrı JSON dosyalarına
 * (`apps/web/src/locales/{tr,en}/reports.json`) çıkardı. Bu hook hâlâ
 * dot-notation key resolver (`reports.composer.title.create`) sunuyor;
 * sadece kaynak değişti. UI bileşenleri (`@pusula/ui/reports`)
 * `MicroReportProps.t` prop'u alır — değişiklik yok.
 *
 * V1 davranışı:
 *  - Workspace locale `tr-TR` sabit (Pusula şu an tek dil).
 *  - EN locale dosyası eklendi (Faz 14+ için, bu hook'tan çağrılmıyor).
 *  - Eksik key → key string'i ekrana (debug için görünür kalır).
 *  - Placeholder formatı `{count}` (single brace). 13I print sayfası
 *    `makeTranslator` da single-brace ile uyumlu.
 */
'use client';

import { useMemo } from 'react';
import trReports from '@/locales/tr/reports.json';

/**
 * `reports.*` JSON locale'inin tipi — JSON `Record<string, unknown>`
 * olarak gelir, lookup için yeterli (`any` cursor pattern).
 */
type LocaleTree = Record<string, unknown>;
const LOCALE_TREE: LocaleTree = trReports as LocaleTree;

export interface UseReportI18nResult {
  /**
   * i18n key resolver. Dot-notation key (`reports.composer.title.create`)
   * → string. Eksik key → key string'i ekrana (debug için görünür).
   *
   * `params` placeholder map'i: `t('reports.foo', { count: 3 })` →
   * `'... {count} ...'` template'inde `{count}` → 3.
   *
   * Params tipi `Record<string, unknown>` — `@pusula/ui/reports` UI
   * primitive'lerinin `MicroReportProps.t` signature'ı ile uyumlu (recharts/
   * KpiCard formatlanmış değer olarak Date/BigInt vs. geçirebilir).
   */
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Workspace locale — V1 sabit `tr-TR`; Faz 14+'da workspace meta'sından gelecek. */
  locale: string;
}

/**
 * Dot-notation key (`reports.foo.bar`) JSON locale ağacında lookup.
 * `reports.` prefix'i strip edilir — JSON kökü doğrudan `composer`,
 * `list`, ... taşır. Eksik path → undefined.
 */
function resolveKey(key: string): string | undefined {
  if (!key.startsWith('reports.')) return undefined;
  const parts = key.slice('reports.'.length).split('.');
  let cursor: unknown = LOCALE_TREE;
  for (const part of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{\s*(\w+)\s*\}/g, (_, name) => {
    const value = params[name as keyof typeof params];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function useReportI18n(): UseReportI18nResult {
  return useMemo<UseReportI18nResult>(
    () => ({
      t: (key, params) => {
        const template = resolveKey(key);
        if (template === undefined) return key; // debug fallback.
        return interpolate(template, params);
      },
      locale: 'tr-TR',
    }),
    [],
  );
}
