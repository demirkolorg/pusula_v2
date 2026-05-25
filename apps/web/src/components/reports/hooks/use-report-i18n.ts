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
 * `reports.` prefix'i strip edilir. Locale JSON'da bazı leaf key'ler
 * (özellikle `activity.types.card.due_set`, `comment.deleted` gibi
 * domain event kodları) tek string key'inde nokta taşır — onları
 * hiyerarşi olarak parse etmek hatalı. Bu yüzden her node'da önce
 * "kalan path tam key olarak var mı?" sorulur; yoksa ilk noktaya kadar
 * olan baş segmente düş ve alt traverse'i sürdür. Hem klasik nested
 * key'leri (`composer.title.create`) hem nokta-içeren leaf key'leri
 * (`activity.types.card.due_set`) tek geçişle çözer.
 */
function resolveKey(key: string): string | undefined {
  if (!key.startsWith('reports.')) return undefined;
  return walkPath(LOCALE_TREE, key.slice('reports.'.length));
}

function walkPath(node: unknown, path: string): string | undefined {
  if (node === null || node === undefined) return undefined;
  if (typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  // 1) Tam path leaf key olarak var mı?
  const direct = obj[path];
  if (typeof direct === 'string') return direct;
  // 2) Yoksa baş segmenti node key olarak alıp alt traverse et.
  const dot = path.indexOf('.');
  if (dot === -1) {
    return undefined;
  }
  const head = path.slice(0, dot);
  const rest = path.slice(dot + 1);
  return walkPath(obj[head], rest);
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
        // Faz 13R (DEM-274) E2E hot path — bazı micro-report manifest
        // satırları `labelKey`'i undefined geçirebiliyor (V1 13K backlog;
        // ayrı issue açılacak). Defensive guard: undefined/null/non-string
        // key fallback, downstream `startsWith` patlamasın.
        if (typeof key !== 'string' || key.length === 0) return '';
        const template = resolveKey(key);
        if (template === undefined) return key; // debug fallback.
        return interpolate(template, params);
      },
      locale: 'tr-TR',
    }),
    [],
  );
}
