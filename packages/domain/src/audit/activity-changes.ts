/**
 * `buildActivityChanges` — bir `activity_events` satırının `payload`'ını
 * yapılandırılmış "önce → sonra" (diff) ve tekil "değer" satırlarına çevirir.
 * Bildirim detay / audit ekranının paylaşılan çekirdeği: hem web
 * (`apps/web` ActivityDetailDialog) hem mobil detay ekranı aynı saf mantığı
 * kullanır.
 *
 * Saf TypeScript: React, DOM, tRPC veya hardcode kullanıcı metni YOK
 * (`@pusula/domain` sözleşmesi). Platforma özgü iki şey — alan **etiketleri**
 * (Türkçe başlık metinleri) ve **byte biçimleme** — `options` ile enjekte
 * edilir; varsayılanlar etiketsiz / ham sayı üretir. Web tarafı kendi
 * `strings`/`formatBytes`'ını verir, mobil kendi `strings`'ini.
 *
 * Detay → `docs/architecture/06-bildirim-altyapisi.md` "Bildirim detay / audit
 * ekranı" → "Paylaşılan audit lib".
 */

import type { TruncatedAuditText } from './truncate';

/**
 * Detay ekranının "Değişiklikler" bölümündeki tek bir satır.
 *
 * - `field`  payload'tan türeyen kararlı alan anahtarı (küçük harf suffix/key,
 *   örn. `title`, `color`, `role`, `sizebytes`; eşsiz from/to için `''`). Etiket
 *   çözümünü platforma bırakmak için her satırda taşınır; `label` ile birlikte
 *   gelir (etiket enjekte edilmezse `field`'a eşittir).
 * - `truncated` yalnızca kaynak alan 2KB sınırını aşıp kırpıldıysa `true`; UI
 *   "(kırpıldı)" işaretini bu bayrağa göre gösterir.
 */
export type ActivityChange =
  | {
      kind: 'diff';
      field: string;
      label: string;
      from: string;
      to: string;
      truncated?: true;
    }
  | {
      kind: 'value';
      field: string;
      label: string;
      value: string;
      truncated?: true;
    };

/**
 * Platforma özgü enjeksiyon noktaları. Hepsi opsiyonel; verilmezse domain
 * etiketsiz (anahtar = etiket) ve ham byte sayısı üretir.
 */
export interface ActivityChangesOptions {
  /**
   * Bir diff çiftinin alan etiketini çöz. `suffix` `from`/`to` (veya
   * `old`/`new`) sonrası gelen ham parça (örn. `Title`, `Color`); eşsiz
   * `from`/`to` çiftinde `''`. Döndürülen string `label` olur.
   */
  fieldLabel?: (suffix: string) => string;
  /** Tekil skaler bir alanın etiketini çöz (örn. `fileName` → "Dosya"). */
  valueLabel?: (key: string) => string;
  /** Byte sayısını biçimle (örn. `2048` → "2 KB"). Verilmezse `String(bytes)`. */
  formatBytes?: (bytes: number) => string;
  /**
   * Skaler hücreyi biçimle (boolean / rol gibi platforma özgü Türkçeleştirme).
   * `name` alanın (suffix veya key) adı, `raw` ham değer. `undefined` dönerse
   * dahili varsayılan biçimleme uygulanır.
   */
  formatCell?: (name: string, raw: unknown) => string | undefined;
}

/** Bir değerin `{ value, truncated? }` (TruncatedAuditText) şeklinde olup olmadığı. */
function asTruncated(raw: unknown): TruncatedAuditText | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.value !== 'string') return null;
  if ('truncated' in obj && obj.truncated !== true) return null;
  // Yalnızca audit-text şekline benzeyenleri kabul et (value + opsiyonel truncated).
  const keys = Object.keys(obj);
  const onlyKnown = keys.every((k) => k === 'value' || k === 'truncated');
  if (!onlyKnown) return null;
  return { value: obj.value, truncated: obj.truncated === true ? true : undefined };
}

/** Anahtarların kimlik (id) niteliğinde olup olmadığı — diff/değer dışı bırakılır. */
function isIdLike(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === 'id' || lower.endsWith('id');
}

/** Varsayılan skaler biçimleme: boolean/sayı/string'i okunur metne çevir. */
function defaultFormatCell(
  name: string,
  raw: unknown,
  formatBytes: (bytes: number) => string,
): string {
  const lower = name.toLowerCase();
  if (raw == null) return '';
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (typeof raw === 'number') {
    if (lower.includes('size') || lower.includes('bytes')) return formatBytes(raw);
    return String(raw);
  }
  if (typeof raw === 'string') return raw;
  return '';
}

type DetectedPair = { fromKey: string; toKey: string; suffix: string };

/** Bir payload anahtarı için `from*`/`to*` veya `old*`/`new*` eşini tespit et. */
function detectPair(key: string, entries: Record<string, unknown>): DetectedPair | null {
  if (key.startsWith('from')) {
    const suffix = key.slice(4);
    const toKey = `to${suffix}`;
    if (toKey in entries) return { fromKey: key, toKey, suffix };
  }
  if (key.startsWith('old')) {
    const suffix = key.slice(3);
    const newKey = `new${suffix}`;
    if (newKey in entries) return { fromKey: key, toKey: newKey, suffix };
  }
  return null;
}

/**
 * Bir aktivite payload'ı için yapılandırılmış değişiklik listesini üret.
 * `from`/`to` ve `old`/`new` çiftleri `diff` satırı; kalan kimlik-dışı skaler
 * alanlar `value` satırı olur. `{ value, truncated? }` (audit-text) şeklindeki
 * alanlar açılır, `truncated` bayrağı satıra taşınır. Düz obje olmayan girdi
 * (`null`, string, sayı) boş liste döndürür.
 *
 * Etiketler ve byte biçimleme `options` ile enjekte edilir; verilmezse
 * `label === field` (ham anahtar) ve byte = `String(n)`.
 */
export function buildActivityChanges(
  payload: unknown,
  options: ActivityChangesOptions = {},
): ActivityChange[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const entries = payload as Record<string, unknown>;

  const formatBytes = options.formatBytes ?? ((n: number) => String(n));
  const cell = (name: string, raw: unknown): string => {
    const custom = options.formatCell?.(name, raw);
    if (custom !== undefined) return custom;
    return defaultFormatCell(name, raw, formatBytes);
  };
  const labelForField = (suffix: string): string => options.fieldLabel?.(suffix) ?? suffix;
  const labelForValue = (key: string): string => options.valueLabel?.(key) ?? key;

  const consumed = new Set<string>();
  const changes: ActivityChange[] = [];

  for (const key of Object.keys(entries)) {
    if (consumed.has(key)) continue;
    const pair = detectPair(key, entries);
    if (!pair) continue;
    consumed.add(pair.fromKey);
    consumed.add(pair.toKey);

    const fromRaw = entries[pair.fromKey];
    const toRaw = entries[pair.toKey];
    const fromTrunc = asTruncated(fromRaw);
    const toTrunc = asTruncated(toRaw);
    const truncated = fromTrunc?.truncated === true || toTrunc?.truncated === true;

    const change: ActivityChange = {
      kind: 'diff',
      field: pair.suffix.toLowerCase(),
      label: labelForField(pair.suffix),
      from: cell(pair.suffix, fromTrunc ? fromTrunc.value : fromRaw),
      to: cell(pair.suffix, toTrunc ? toTrunc.value : toRaw),
    };
    if (truncated) change.truncated = true;
    changes.push(change);
  }

  for (const key of Object.keys(entries)) {
    if (consumed.has(key) || isIdLike(key)) continue;
    const raw = entries[key];

    const trunc = asTruncated(raw);
    if (trunc) {
      const value = cell(key, trunc.value);
      if (value === '') continue;
      const change: ActivityChange = {
        kind: 'value',
        field: key.toLowerCase(),
        label: labelForValue(key),
        value,
      };
      if (trunc.truncated) change.truncated = true;
      changes.push(change);
      continue;
    }

    if (raw == null || typeof raw === 'object') continue;
    const value = cell(key, raw);
    if (value === '') continue;
    changes.push({ kind: 'value', field: key.toLowerCase(), label: labelForValue(key), value });
  }

  return changes;
}
