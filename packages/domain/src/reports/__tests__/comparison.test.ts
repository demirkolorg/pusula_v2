import { describe, expect, it } from 'vitest';
import {
  computeDelta,
  NEUTRAL_THRESHOLD_PCT,
  shiftRangeBack,
} from '../comparison';

describe('computeDelta', () => {
  it('returns direction=new when previous is null', () => {
    const d = computeDelta(42, null);
    expect(d).toEqual({ abs: null, pct: null, direction: 'new' });
  });

  it('returns direction=new when previous is undefined', () => {
    const d = computeDelta(42, undefined);
    expect(d).toEqual({ abs: null, pct: null, direction: 'new' });
  });

  it('returns direction=new with abs=current when previous is 0', () => {
    const d = computeDelta(42, 0);
    expect(d).toEqual({ abs: 42, pct: null, direction: 'new' });
  });

  it('returns direction=up when pct > NEUTRAL_THRESHOLD_PCT', () => {
    const d = computeDelta(120, 100);
    expect(d.direction).toBe('up');
    expect(d.abs).toBe(20);
    expect(d.pct).toBe(20);
  });

  it('returns direction=down when pct < -NEUTRAL_THRESHOLD_PCT', () => {
    const d = computeDelta(80, 100);
    expect(d.direction).toBe('down');
    expect(d.abs).toBe(-20);
    expect(d.pct).toBe(-20);
  });

  it('returns direction=neutral when pct is exactly threshold', () => {
    const d = computeDelta(101, 100); // pct = 1
    expect(d.direction).toBe('neutral');
    expect(d.pct).toBe(NEUTRAL_THRESHOLD_PCT);
  });

  it('returns direction=neutral when pct is negative-threshold', () => {
    const d = computeDelta(99, 100); // pct = -1
    expect(d.direction).toBe('neutral');
    expect(d.pct).toBe(-NEUTRAL_THRESHOLD_PCT);
  });

  it('returns direction=neutral when pct is within (-1, 1)', () => {
    const d = computeDelta(1005, 1000); // pct = 0.5
    expect(d.direction).toBe('neutral');
  });

  it('handles current = 0 with previous > 0 as a "down" trend', () => {
    const d = computeDelta(0, 50);
    expect(d.direction).toBe('down');
    expect(d.abs).toBe(-50);
    expect(d.pct).toBe(-100);
  });

  it('handles current = previous (no change)', () => {
    const d = computeDelta(100, 100);
    expect(d.direction).toBe('neutral');
    expect(d.abs).toBe(0);
    expect(d.pct).toBe(0);
  });

  it('handles fractional previous values', () => {
    const d = computeDelta(15, 10);
    expect(d.direction).toBe('up');
    expect(d.pct).toBe(50);
  });
});

describe('shiftRangeBack', () => {
  it('shifts a 30-day range exactly back 30 days', () => {
    const range = {
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-31T00:00:00Z'),
    };
    const back = shiftRangeBack(range);
    // [from - 30d, from] (yarı-açık: prev.to === current.from)
    expect(back.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(back.to.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('preserves zero-duration ranges as empty back-shift', () => {
    const range = {
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-01T00:00:00Z'),
    };
    const back = shiftRangeBack(range);
    expect(back.from.getTime()).toBe(back.to.getTime());
    expect(back.to.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('handles sub-second precision', () => {
    const range = {
      from: new Date('2026-05-01T00:00:00.123Z'),
      to: new Date('2026-05-01T00:00:01.456Z'),
    };
    const back = shiftRangeBack(range);
    const expectedDuration = 1456 - 123;
    expect(back.to.getTime() - back.from.getTime()).toBe(expectedDuration);
    expect(back.to.toISOString()).toBe(range.from.toISOString());
  });
});
