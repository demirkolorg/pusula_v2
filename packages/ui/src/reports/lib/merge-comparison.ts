/**
 * Faz 13M (DEM-269) — comparison veri merge yardımcıları.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §13 + `docs/domain/
 * 09-raporlama-kurallari.md` §9.9. Saf TypeScript — UI bileşenleri
 * `current` ve `previous` veri kümelerini bir noktada birleştirir
 * (recharts `<Line dataKey="previous">` veya tablo Δ kolonu).
 *
 * Tasarım vaatleri:
 *   - Order: current array'inin sırası korunur (sıra UI'da nominal kategori
 *     olarak görünür — chart x-ekseni vs tablo sırası).
 *   - Sadece current'ta olan key → `previous = null` (UI "new" rozetiyle gösterir).
 *   - Sadece previous'ta olan key → array'e eklenir (current=null, previous değer).
 *     Tablo Δ kolonu bunlar için "yeni dönemde yok" davranışını sunabilir.
 *   - Eksik tarih → 0 default DEĞIL; null. UI consumer numerik kullanım için
 *     null'u 0'a düşürebilir (`current ?? 0`), ama default'ta semantik korunur
 *     (eksik = "veri yok", 0 ≠ "yok").
 */

import { computeDelta, type DeltaResult } from '@pusula/domain/reports';

/**
 * Time-axis merge için satır şekli — `series` adı current/previous değer
 * için generic key olarak kullanılır (chart `dataKey` esnekliği için
 * "current"/"previous" sabit).
 */
export interface TimeAxisPoint {
  /** ISO tarih/saat veya bucket key (chart x-ekseni). */
  bucket: string;
  current: number | null;
  previous: number | null;
}

/**
 * Time-bucket bazlı merge: current ve previous serileri ayrı bucket
 * setinden geldiklerini varsayar (örn. activity-timeline current: son 30
 * günün her günü, previous: önceki 30 günün her günü). UI tek line chart
 * çizmek için bucket sırasını **current'a göre** korur, previous'taki
 * fazla bucket'lar sona eklenir (sondaki çift "geçmiş kuyruğu" tooltip
 * görünmez ama veri kaybolmaz).
 *
 * Bucket key'i string — `Date.toISOString()` veya `YYYY-MM-DD` ya da
 * "12:00" gibi saat etiketi olabilir. Eşitlik string equality (caller
 * normalize etmelidir).
 */
export function mergeTimeSeries<TCurrent extends { bucket: string; value: number }>(
  current: ReadonlyArray<TCurrent>,
  previous: ReadonlyArray<TCurrent> | null | undefined,
): TimeAxisPoint[] {
  if (!previous || previous.length === 0) {
    return current.map((c) => ({ bucket: c.bucket, current: c.value, previous: null }));
  }
  const prevMap = new Map<string, number>();
  for (const p of previous) prevMap.set(p.bucket, p.value);
  const seen = new Set<string>();
  const out: TimeAxisPoint[] = current.map((c) => {
    seen.add(c.bucket);
    return {
      bucket: c.bucket,
      current: c.value,
      previous: prevMap.has(c.bucket) ? prevMap.get(c.bucket)! : null,
    };
  });
  // Previous'ta olup current'ta olmayan bucket'lar — tail append. Chart
  // sıralamasını bozar; consumer istemiyorsa kendi sort'unu uygular.
  for (const p of previous) {
    if (!seen.has(p.bucket)) {
      out.push({ bucket: p.bucket, current: null, previous: p.value });
    }
  }
  return out;
}

/**
 * Identity bazlı merge: row'larda `id` ile eşleme (örn. member-contribution
 * userId, label-distribution labelId). Çıktı `current`'ın sırasını korur;
 * `previous`'ta olup current'ta olmayan satırlar sona eklenir.
 *
 * @returns `{ row: TCurrent | null; previousValue: number | null;
 *   delta?: DeltaResult; rowKey: string }[]` — UI tablo doğrudan
 *   render eder; `delta` yalnız iki taraf da numerik ve `getValue`
 *   sağlanırsa.
 */
export interface IdentityMergedRow<TCurrent> {
  /** Current row (null = sadece previous'ta vardı). */
  row: TCurrent | null;
  /** Previous dönem değeri (null = current-only). */
  previousValue: number | null;
  /** Eğer her iki tarafta da değer varsa hesaplanmış delta. */
  delta?: DeltaResult;
  rowKey: string;
}

export function mergeByIdentity<TCurrent>(
  current: ReadonlyArray<TCurrent>,
  previous: ReadonlyArray<TCurrent> | null | undefined,
  options: {
    /** Row identity (örn. `(r) => r.userId`). */
    getKey: (row: TCurrent) => string;
    /** Numerik metrik (delta için); verilmezse `delta` undefined kalır. */
    getValue?: (row: TCurrent) => number;
  },
): IdentityMergedRow<TCurrent>[] {
  const { getKey, getValue } = options;
  if (!previous || previous.length === 0) {
    return current.map((row) => ({
      rowKey: getKey(row),
      row,
      previousValue: null,
      delta: getValue ? computeDelta(getValue(row), null) : undefined,
    }));
  }
  const prevByKey = new Map<string, TCurrent>();
  for (const p of previous) prevByKey.set(getKey(p), p);
  const seen = new Set<string>();
  const out: IdentityMergedRow<TCurrent>[] = current.map((row) => {
    const key = getKey(row);
    seen.add(key);
    const prevRow = prevByKey.get(key);
    const previousValue = prevRow && getValue ? getValue(prevRow) : null;
    const delta = getValue
      ? computeDelta(getValue(row), previousValue)
      : undefined;
    return { rowKey: key, row, previousValue, delta };
  });
  for (const prevRow of previous) {
    const key = getKey(prevRow);
    if (seen.has(key)) continue;
    const previousValue = getValue ? getValue(prevRow) : null;
    out.push({
      rowKey: key,
      row: null,
      previousValue,
      // Current=0 / previous>0 — "kayboldu" sinyali için down delta hesapla.
      delta: getValue
        ? computeDelta(0, previousValue)
        : undefined,
    });
  }
  return out;
}

/**
 * Skaler delta yardımcı — micro-report'ta tek metrik için. `previous`
 * null/undefined → DeltaResult `direction='new'`.
 */
export function scalarDelta(
  current: number,
  previous: number | null | undefined,
): DeltaResult {
  return computeDelta(current, previous);
}
