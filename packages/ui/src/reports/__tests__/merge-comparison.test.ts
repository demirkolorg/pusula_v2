/**
 * Faz 13M (DEM-269) — comparison merge helper unit testleri.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §13 + docs/domain/
 * 09-raporlama-kurallari.md §9.9. Saf fonksiyonlar; mocks/fixture'lar
 * gerek yok.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeByIdentity,
  mergeTimeSeries,
  scalarDelta,
} from '../lib/merge-comparison';

describe('mergeTimeSeries (time-axis bucket merge)', () => {
  it('previous null → all rows have previous=null, current preserved', () => {
    const merged = mergeTimeSeries(
      [
        { bucket: '2026-05-01', value: 10 },
        { bucket: '2026-05-02', value: 12 },
      ],
      null,
    );
    expect(merged).toEqual([
      { bucket: '2026-05-01', current: 10, previous: null },
      { bucket: '2026-05-02', current: 12, previous: null },
    ]);
  });

  it('previous empty array → same as null', () => {
    const merged = mergeTimeSeries(
      [{ bucket: 'a', value: 1 }],
      [],
    );
    expect(merged).toEqual([{ bucket: 'a', current: 1, previous: null }]);
  });

  it('merges matching buckets and preserves current order', () => {
    const merged = mergeTimeSeries(
      [
        { bucket: '2026-05-01', value: 10 },
        { bucket: '2026-05-02', value: 12 },
        { bucket: '2026-05-03', value: 8 },
      ],
      [
        { bucket: '2026-05-01', value: 5 },
        { bucket: '2026-05-03', value: 9 },
      ],
    );
    expect(merged).toEqual([
      { bucket: '2026-05-01', current: 10, previous: 5 },
      { bucket: '2026-05-02', current: 12, previous: null },
      { bucket: '2026-05-03', current: 8, previous: 9 },
    ]);
  });

  it('appends previous-only buckets to tail (current=null)', () => {
    const merged = mergeTimeSeries(
      [{ bucket: 'a', value: 1 }],
      [
        { bucket: 'a', value: 2 },
        { bucket: 'b', value: 3 },
      ],
    );
    expect(merged).toEqual([
      { bucket: 'a', current: 1, previous: 2 },
      { bucket: 'b', current: null, previous: 3 },
    ]);
  });
});

describe('mergeByIdentity (key-based row merge)', () => {
  type Row = { id: string; count: number };

  it('previous null → all rows have previousValue=null + new delta', () => {
    const merged = mergeByIdentity<Row>(
      [{ id: 'u1', count: 5 }],
      null,
      { getKey: (r) => r.id, getValue: (r) => r.count },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.rowKey).toBe('u1');
    expect(merged[0]?.row).toEqual({ id: 'u1', count: 5 });
    expect(merged[0]?.previousValue).toBeNull();
    expect(merged[0]?.delta?.direction).toBe('new');
  });

  it('matching keys → delta computed', () => {
    const merged = mergeByIdentity<Row>(
      [{ id: 'u1', count: 10 }],
      [{ id: 'u1', count: 5 }],
      { getKey: (r) => r.id, getValue: (r) => r.count },
    );
    expect(merged[0]?.previousValue).toBe(5);
    expect(merged[0]?.delta?.direction).toBe('up');
    expect(merged[0]?.delta?.pct).toBe(100);
  });

  it('current-only key → previousValue=null, direction=new', () => {
    const merged = mergeByIdentity<Row>(
      [{ id: 'u1', count: 4 }],
      [{ id: 'u2', count: 1 }],
      { getKey: (r) => r.id, getValue: (r) => r.count },
    );
    // current'tan u1 (previous=null) + previous-only u2 tail'e eklenir
    const u1 = merged.find((m) => m.rowKey === 'u1');
    const u2 = merged.find((m) => m.rowKey === 'u2');
    expect(u1?.row).not.toBeNull();
    expect(u1?.previousValue).toBeNull();
    expect(u1?.delta?.direction).toBe('new');
    expect(u2?.row).toBeNull();
    expect(u2?.previousValue).toBe(1);
    expect(u2?.delta?.direction).toBe('down'); // current=0, previous=1
  });

  it('preserves current row order; previous-only rows appended', () => {
    const merged = mergeByIdentity<Row>(
      [
        { id: 'a', count: 1 },
        { id: 'b', count: 2 },
      ],
      [
        { id: 'c', count: 3 },
        { id: 'a', count: 0 },
      ],
      { getKey: (r) => r.id, getValue: (r) => r.count },
    );
    expect(merged.map((m) => m.rowKey)).toEqual(['a', 'b', 'c']);
  });

  it('without getValue → delta undefined (row identity only)', () => {
    const merged = mergeByIdentity<Row>(
      [{ id: 'u1', count: 10 }],
      [{ id: 'u1', count: 5 }],
      { getKey: (r) => r.id },
    );
    expect(merged[0]?.delta).toBeUndefined();
    expect(merged[0]?.previousValue).toBeNull();
  });
});

describe('scalarDelta (re-export consistency check)', () => {
  it('previous null → direction=new, abs/pct=null', () => {
    expect(scalarDelta(10, null)).toEqual({
      abs: null,
      pct: null,
      direction: 'new',
    });
  });

  it('within ±1% threshold → neutral', () => {
    const d = scalarDelta(100.5, 100);
    expect(d.direction).toBe('neutral');
  });

  it('above +1% → up', () => {
    const d = scalarDelta(120, 100);
    expect(d.direction).toBe('up');
    expect(d.pct).toBe(20);
  });

  it('below -1% → down', () => {
    const d = scalarDelta(80, 100);
    expect(d.direction).toBe('down');
  });

  it('previous=0 → direction=new (sıfır bölme)', () => {
    expect(scalarDelta(42, 0).direction).toBe('new');
  });
});
