import { describe, expect, it } from 'vitest';
import { serializeForPublicApi } from './serialize';

describe('serializeForPublicApi', () => {
  it('converts a top-level Date to an ISO string', () => {
    const d = new Date('2026-07-13T10:20:30.000Z');
    expect(serializeForPublicApi(d)).toBe('2026-07-13T10:20:30.000Z');
  });

  it('converts nested Dates deep inside objects and arrays', () => {
    const input = {
      id: 'c1',
      createdAt: new Date('2026-07-13T00:00:00.000Z'),
      nested: {
        dueAt: new Date('2026-07-14T00:00:00.000Z'),
        items: [{ at: new Date('2026-07-15T00:00:00.000Z') }],
      },
    };
    expect(serializeForPublicApi(input)).toEqual({
      id: 'c1',
      createdAt: '2026-07-13T00:00:00.000Z',
      nested: {
        dueAt: '2026-07-14T00:00:00.000Z',
        items: [{ at: '2026-07-15T00:00:00.000Z' }],
      },
    });
  });

  it('drops undefined object fields but keeps null', () => {
    const input = { a: 1, b: undefined, c: null, d: 'x' };
    expect(serializeForPublicApi(input)).toEqual({ a: 1, c: null, d: 'x' });
  });

  it('drops undefined fields recursively', () => {
    const input = { outer: { keep: 1, drop: undefined } };
    expect(serializeForPublicApi(input)).toEqual({ outer: { keep: 1 } });
  });

  it('preserves primitives and booleans as-is', () => {
    expect(serializeForPublicApi('hello')).toBe('hello');
    expect(serializeForPublicApi(42)).toBe(42);
    expect(serializeForPublicApi(true)).toBe(true);
    expect(serializeForPublicApi(null)).toBe(null);
  });

  it('serializes arrays of primitives and Dates', () => {
    const input = [1, new Date('2026-01-01T00:00:00.000Z'), 'x'];
    expect(serializeForPublicApi(input)).toEqual([1, '2026-01-01T00:00:00.000Z', 'x']);
  });
});
