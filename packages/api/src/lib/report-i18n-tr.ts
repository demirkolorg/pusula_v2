/**
 * Faz 13Q (DEM-273) — Print pipeline için TR i18n flat map'i.
 *
 * Kanonik kaynak: `apps/web/src/locales/tr/reports.json` (UI). Bu paket
 * (`@pusula/api`) `apps/web`'e bağımlı olamayacağı için aynı JSON içeriği
 * `packages/api/src/lib/locales/tr-reports.json` altında server-side
 * kopya olarak tutulur. İki dosya CI sync check (`check-i18n-keys`) ile
 * **byte-identical** olarak doğrulanır.
 *
 * Bu modül JSON ağacını flat `Record<string, string>` map'ine çevirir
 * (`reports.composer.title.create` → 'Yeni Rapor Oluştur'). `report.print`
 * tRPC procedure dataset envelope'una `i18n` field'ı olarak bu map'i ekler;
 * `report-print-client.tsx` `payload.i18n[key] ?? key` ile resolve eder.
 *
 * Placeholder formatı **single-brace** `{name}` — `useReportI18n` ve
 * print client `makeTranslator` aynı format'ı destekler.
 *
 * Tarihçe: Önceki versiyon (13I/13K) manuel flat TS objesi + double-brace
 * `{{name}}` interpolation kullanıyordu. 13Q tek-kaynak (TR JSON) +
 * single-brace standardına geçti.
 */
import trReports from './locales/tr-reports.json' with { type: 'json' };

type LocaleTree = Record<string, unknown>;

/**
 * Nested JSON locale ağacını flat `Record<string, string>` map'ine çevirir.
 * `composer.title.create: 'Yeni Rapor'` → `'reports.composer.title.create': 'Yeni Rapor'`.
 * Top-level `reports.` prefix'i ekler (JSON kökü prefix taşımaz).
 */
export function flattenLocaleTree(
  tree: LocaleTree,
  prefix: string = 'reports',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const path = `${prefix}.${k}`;
    if (typeof v === 'string') {
      out[path] = v;
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenLocaleTree(v as LocaleTree, path));
    }
  }
  return out;
}

/**
 * TR locale ağacının flat key→string map'i. `report.print` procedure
 * envelope payload'ına gömülür; UI `t(key) = payload.i18n[key] ?? key`
 * ile resolve eder.
 */
export const REPORT_PRINT_I18N_TR: Readonly<Record<string, string>> = Object.freeze(
  flattenLocaleTree(trReports as LocaleTree),
);
