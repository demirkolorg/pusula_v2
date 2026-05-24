/**
 * Faz 13Q (DEM-273) — Reports modülü i18n key sync check.
 *
 * Doğrular:
 *  1) `apps/web/src/locales/tr/reports.json` (canonical) ⊇ `REPORT_I18N_KEYS`
 *     map'inin tüm leaf'leri — UI veya server hiç eksik key görmesin.
 *  2) `apps/web/src/locales/tr/reports.json` ↔ `packages/api/src/lib/locales/
 *     tr-reports.json` byte-identical — print pipeline server-side mirror'ı
 *     UI ile aynı içeriği gömer.
 *  3) `apps/web/src/locales/en/reports.json` aynı key ağacını taşır —
 *     EN tam çevrilmemiş olabilir (V1) ama key shape kayması yasak.
 *
 * Fail varsa exit code 1, stderr'a detaylı liste.
 *
 * Çağrı:
 *   pnpm --filter @pusula/domain check-i18n-keys
 *
 * CI: `pnpm lint` paralel adım olarak veya `pnpm test`'in öncesinde koşar.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §12 (i18n stratejisi)
 *       + `docs/domain/09-raporlama-kurallari.md` §9 (UI hardcode yasağı).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPORT_I18N_KEYS } from '../src/reports/i18n-keys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

const PATH_TR_WEB = resolve(REPO_ROOT, 'apps/web/src/locales/tr/reports.json');
const PATH_EN_WEB = resolve(REPO_ROOT, 'apps/web/src/locales/en/reports.json');
const PATH_TR_API = resolve(REPO_ROOT, 'packages/api/src/lib/locales/tr-reports.json');

type LocaleTree = Record<string, unknown>;

function loadJson(path: string): { raw: string; tree: LocaleTree } {
  const raw = readFileSync(path, 'utf-8');
  const tree = JSON.parse(raw) as LocaleTree;
  return { raw, tree };
}

/**
 * `REPORT_I18N_KEYS` nested objesinin **leaf değerlerini** (i18n key
 * string'lerini) toplar. Leaf değer her zaman `'reports.x.y'` formatında.
 */
function collectCanonicalKeys(obj: unknown, out: Set<string>): void {
  if (typeof obj === 'string') {
    out.add(obj);
    return;
  }
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      collectCanonicalKeys(v, out);
    }
  }
}

/**
 * Locale JSON ağacını flat path setine çevirir.
 * `composer.title.create: 'Yeni Rapor'` → `'reports.composer.title.create'`.
 */
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

/**
 * `setA` içinde olup `setB` içinde olmayan key'leri sıralı array olarak
 * döner. Boş array → tüm key'ler eşleşti.
 */
function diff(setA: Set<string>, setB: Set<string>): string[] {
  const out: string[] = [];
  for (const k of setA) if (!setB.has(k)) out.push(k);
  return out.sort();
}

let failed = false;

const tr = loadJson(PATH_TR_WEB);
const en = loadJson(PATH_EN_WEB);
const trApi = loadJson(PATH_TR_API);

const canonicalKeys = new Set<string>();
collectCanonicalKeys(REPORT_I18N_KEYS, canonicalKeys);

const trKeys = flattenLocaleKeys(tr.tree);
const enKeys = flattenLocaleKeys(en.tree);
const trApiKeys = flattenLocaleKeys(trApi.tree);

// 1) Canonical ⊆ TR
const missingInTr = diff(canonicalKeys, trKeys);
if (missingInTr.length > 0) {
  failed = true;
  console.error(
    `\n[FAIL] REPORT_I18N_KEYS'te tanımlı ${missingInTr.length} key TR locale'de eksik:`,
  );
  for (const k of missingInTr) console.error(`  - ${k}`);
}

// 2) Web TR === API TR (byte-identical)
// JSON.stringify ile normalize edip karşılaştırırız — boşluk/sıra
// farkları false-positive üretmesin diye yapısal eşleme yeterli.
const trWebNorm = JSON.stringify(tr.tree);
const trApiNorm = JSON.stringify(trApi.tree);
if (trWebNorm !== trApiNorm) {
  failed = true;
  console.error('\n[FAIL] Web TR locale ile API server-side mirror eşleşmiyor:');
  console.error(`  web: ${PATH_TR_WEB}`);
  console.error(`  api: ${PATH_TR_API}`);

  const onlyInWeb = diff(trKeys, trApiKeys);
  const onlyInApi = diff(trApiKeys, trKeys);
  if (onlyInWeb.length > 0) {
    console.error(`  Sadece web'de (${onlyInWeb.length}):`);
    for (const k of onlyInWeb.slice(0, 20)) console.error(`    + ${k}`);
    if (onlyInWeb.length > 20) console.error(`    … ve ${onlyInWeb.length - 20} tane daha`);
  }
  if (onlyInApi.length > 0) {
    console.error(`  Sadece api'de (${onlyInApi.length}):`);
    for (const k of onlyInApi.slice(0, 20)) console.error(`    + ${k}`);
    if (onlyInApi.length > 20) console.error(`    … ve ${onlyInApi.length - 20} tane daha`);
  }
}

// 3) EN shape == TR shape
const trOnly = diff(trKeys, enKeys);
const enOnly = diff(enKeys, trKeys);
if (trOnly.length > 0 || enOnly.length > 0) {
  failed = true;
  console.error('\n[FAIL] EN locale TR locale ile aynı key ağacını taşımıyor:');
  if (trOnly.length > 0) {
    console.error(`  TR'de var, EN'de yok (${trOnly.length}):`);
    for (const k of trOnly.slice(0, 20)) console.error(`    - ${k}`);
    if (trOnly.length > 20) console.error(`    … ve ${trOnly.length - 20} tane daha`);
  }
  if (enOnly.length > 0) {
    console.error(`  EN'de var, TR'de yok (${enOnly.length}):`);
    for (const k of enOnly.slice(0, 20)) console.error(`    - ${k}`);
    if (enOnly.length > 20) console.error(`    … ve ${enOnly.length - 20} tane daha`);
  }
}

if (failed) {
  console.error('\nFix: TR/EN locale dosyalarını veya REPORT_I18N_KEYS map\'ini güncelleyin.');
  process.exit(1);
}

// eslint-disable-next-line no-console -- CLI success çıktısı; stdout normal.
console.log(
  `OK — ${canonicalKeys.size} kanonik key TR locale'de, web/api TR mirror eşleşiyor, EN aynı shape (${trKeys.size} key).`,
);
