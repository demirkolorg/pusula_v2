import { describe, expect, it } from 'vitest';
import { parseIdempotencyKey, IDEMPOTENCY_HEADER } from './idempotency';

const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('parseIdempotencyKey', () => {
  it('exposes the canonical header name', () => {
    expect(IDEMPOTENCY_HEADER).toBe('Idempotency-Key');
  });

  it('accepts a well-formed UUID', () => {
    const result = parseIdempotencyKey(VALID_UUID);
    expect(result.ok).toBe(true);
    expect(result.key).toBe(VALID_UUID);
  });

  it('trims surrounding whitespace before validating', () => {
    const result = parseIdempotencyKey(`  ${VALID_UUID}  `);
    expect(result.ok).toBe(true);
    expect(result.key).toBe(VALID_UUID);
  });

  it('rejects a missing header (undefined) with a 400 code', () => {
    const result = parseIdempotencyKey(undefined);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BAD_REQUEST');
  });

  it('rejects a null header with a 400 code', () => {
    const result = parseIdempotencyKey(null);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BAD_REQUEST');
  });

  it('rejects an empty string', () => {
    const result = parseIdempotencyKey('');
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BAD_REQUEST');
  });

  it('rejects a non-UUID value', () => {
    const result = parseIdempotencyKey('not-a-uuid');
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('BAD_REQUEST');
    expect(result.key).toBeUndefined();
  });
});
