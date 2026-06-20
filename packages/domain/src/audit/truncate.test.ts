import { describe, expect, it } from 'vitest';
import { AUDIT_TEXT_MAX, truncateForAudit } from './truncate';

describe('truncateForAudit', () => {
  it('returns null for null/undefined input', () => {
    expect(truncateForAudit(null)).toBeNull();
    expect(truncateForAudit(undefined)).toBeNull();
  });

  it('keeps empty string without truncated flag', () => {
    expect(truncateForAudit('')).toEqual({ value: '' });
  });

  it('passes through text at or below the limit without flag', () => {
    const text = 'a'.repeat(AUDIT_TEXT_MAX);
    expect(truncateForAudit(text)).toEqual({ value: text });
    expect(truncateForAudit('hello')).toEqual({ value: 'hello' });
  });

  it('truncates and flags text over the limit', () => {
    const text = 'a'.repeat(AUDIT_TEXT_MAX + 100);
    const result = truncateForAudit(text);
    expect(result).not.toBeNull();
    expect(result?.truncated).toBe(true);
    expect(result?.value).toHaveLength(AUDIT_TEXT_MAX);
    expect(result?.value).toBe('a'.repeat(AUDIT_TEXT_MAX));
  });

  it('honours a custom max', () => {
    expect(truncateForAudit('abcdef', 3)).toEqual({ value: 'abc', truncated: true });
    expect(truncateForAudit('ab', 3)).toEqual({ value: 'ab' });
  });

  it('treats a long Tiptap JSON string as opaque text (length-only)', () => {
    const json = JSON.stringify({ type: 'doc', content: 'x'.repeat(AUDIT_TEXT_MAX) });
    const result = truncateForAudit(json, 64);
    expect(result?.truncated).toBe(true);
    expect(result?.value).toHaveLength(64);
  });
});
