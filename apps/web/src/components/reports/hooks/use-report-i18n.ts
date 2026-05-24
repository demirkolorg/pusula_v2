/**
 * Faz 13G (DEM-263) — i18n key resolver hook'u.
 *
 * Pusula şu an `strings.reports.*` (hardcoded TR — `apps/web/src/lib/
 * strings.ts`) kullanıyor; 13Q (DEM-266) `next-intl` provider'ı getirir.
 * Bu hook iki sistem arasında köprü:
 *  - Mevcut: `strings.reports.<path>` lookup'u dot-notation key'i çözümler.
 *  - 13Q sonrası: `useTranslations('reports')` ile değişir, signature aynı.
 *
 * UI bileşenleri (`@pusula/ui/reports`) `t(key, params)` prop'u alır
 * (`MicroReportProps.t`). Bu hook composer + panel + entity tab girişleri
 * için aynı resolver'ı çıkarır — kod tekrarı yok, drift-proof.
 *
 * Placeholder interpolation: `{count}` → params.count. `{{count}}`
 * alternatifi 13I print sayfası `makeTranslator` ile uyumlu — Pusula
 * standart `{name}` single brace.
 */
'use client';

import { useMemo } from 'react';
import { strings } from '@/lib/strings';

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
  /** Workspace locale — 13Q'da workspace meta'sından gelecek. */
  locale: string;
}

/**
 * Dot-notation key (`reports.foo.bar`) lookup. `strings` objesi `reports`
 * dalını taşır; eksik path → undefined → key kendi adıyla dön.
 */
function resolveKey(key: string): string | undefined {
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = strings;
  for (const part of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[part];
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
        if (!template) return key; // debug fallback — key görünür kalır.
        return interpolate(template, params);
      },
      // V1: workspace locale'i hardcoded `tr-TR` (Pusula şu an tek dil);
      // 13Q dynamic workspace meta'sından gelecek.
      locale: 'tr-TR',
    }),
    [],
  );
}
