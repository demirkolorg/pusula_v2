/**
 * Faz 13C — Period-over-period delta hesabı (DEM-259). Saf fonksiyon —
 * I/O yok, side-effect yok. Spec: `docs/domain/09-raporlama-kurallari.md`
 * §9.9 + `docs/architecture/16-raporlama-mimarisi.md` §16.13.
 */

/** Trend yönü etiketi — UI rozeti (`↑`/`↓`/`─`/`yeni`) bunu kullanır. */
export type DeltaDirection = 'up' | 'down' | 'neutral' | 'new';

export interface DeltaResult {
  /** `current - previous`; previous undefined ise `null`. */
  abs: number | null;
  /**
   * `(current - previous) / previous * 100`. Üç durumda `null`:
   *   1. previous undefined/null → "geçmiş yok"
   *   2. previous === 0 → "yeni" (sıfır bölme)
   *   3. (yukarıdaki ikisinden hiçbiri değilse) sayısal değer döner.
   *   `direction='new'` her zaman `pct=null` taşır.
   */
  pct: number | null;
  direction: DeltaDirection;
}

/**
 * Nötr eşik (±%). `|delta_pct| ≤ NEUTRAL_THRESHOLD_PCT` ise rozet "─"
 * (nötr) gösterilir — false-positive trend gürültüsü engellenir
 * (§9.9 + §16.13).
 */
export const NEUTRAL_THRESHOLD_PCT = 1;

/**
 * Verilen `current` ve `previous` skaler değerleri için trend delta'sını
 * hesapla. `previous` `null`/`undefined` ise "yeni" rozeti, `0` ise yine
 * "yeni" (sıfır bölme tanımsız). Aksi halde yön eşiğe göre belirlenir.
 *
 * @example
 *   computeDelta(120, 100) // → { abs: 20, pct: 20, direction: 'up' }
 *   computeDelta(99, 100)  // → { abs: -1, pct: -1, direction: 'neutral' }
 *   computeDelta(42, 0)    // → { abs: 42, pct: null, direction: 'new' }
 *   computeDelta(7, null)  // → { abs: null, pct: null, direction: 'new' }
 */
export function computeDelta(
  current: number,
  previous: number | null | undefined,
): DeltaResult {
  if (previous === null || previous === undefined) {
    return { abs: null, pct: null, direction: 'new' };
  }
  if (previous === 0) {
    // current === 0 olsa bile "yeni" pratik bir adlandırma; UI sıfır bölmeyi
    // hata olarak göstermek zorunda kalmaz.
    return { abs: current, pct: null, direction: 'new' };
  }
  const abs = current - previous;
  const pct = (abs / previous) * 100;
  if (Math.abs(pct) <= NEUTRAL_THRESHOLD_PCT) {
    return { abs, pct, direction: 'neutral' };
  }
  return { abs, pct, direction: pct > 0 ? 'up' : 'down' };
}

/**
 * Verilen [from, to] aralığını **kendi süresi kadar** geri kaydırır
 * (önceki dönem = `[from - duration, from]`). Spec §9.9: "previous range
 * = current range uzunluğunda kaydırılmış".
 *
 * @example
 *   shiftRangeBack({ from: 2026-05-01, to: 2026-05-31 })
 *   // → { from: 2026-03-31..., to: 2026-05-01 }
 */
export function shiftRangeBack(range: { from: Date; to: Date }): {
  from: Date;
  to: Date;
} {
  const duration = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - duration),
    to: new Date(range.from.getTime()),
  };
}
