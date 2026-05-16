import { describe, expect, it } from 'vitest';
import { hashUserAgent, normalizeUserAgent, subnetFor } from './known-devices';

describe('normalizeUserAgent', () => {
  it('lower-cases and trims whitespace', () => {
    expect(normalizeUserAgent('  Mozilla/5.0 (Windows)  ')).toBe('mozilla/5.0 (windows)');
  });

  it('collapses patch-level browser version differences', () => {
    const a = normalizeUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
    );
    const b = normalizeUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.71 Safari/537.36',
    );
    expect(a).toBe(b);
    expect(a).toContain('chrome/120.0');
  });

  it('treats different majors as different devices', () => {
    const a = normalizeUserAgent('Chrome/120.0.6099.130');
    const b = normalizeUserAgent('Chrome/121.0.6099.130');
    expect(a).not.toBe(b);
  });

  it('returns "unknown" for missing or blank UA', () => {
    expect(normalizeUserAgent(null)).toBe('unknown');
    expect(normalizeUserAgent(undefined)).toBe('unknown');
    expect(normalizeUserAgent('')).toBe('unknown');
    expect(normalizeUserAgent('   ')).toBe('unknown');
  });
});

describe('hashUserAgent', () => {
  it('is deterministic for the same normalized UA', () => {
    expect(hashUserAgent('Chrome/120.0.6099.130')).toBe(hashUserAgent('Chrome/120.0.6099.71'));
  });

  it('differs for different majors', () => {
    expect(hashUserAgent('Chrome/120.0.6099.130')).not.toBe(hashUserAgent('Chrome/121.0.6099.130'));
  });

  it('returns 64-character hex (sha256)', () => {
    const hash = hashUserAgent('Chrome/120');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('subnetFor', () => {
  it('returns /24 for IPv4', () => {
    expect(subnetFor('203.0.113.7')).toBe('203.0.113.0/24');
    expect(subnetFor('10.0.0.255')).toBe('10.0.0.0/24');
  });

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(subnetFor('::ffff:203.0.113.7')).toBe('203.0.113.0/24');
  });

  it('returns /48 for IPv6 with three or more hextets', () => {
    expect(subnetFor('2001:db8:abcd:0012::1')).toBe('2001:db8:abcd::/48');
  });

  it('returns "unknown" for missing or unrecognisable input', () => {
    expect(subnetFor(null)).toBe('unknown');
    expect(subnetFor(undefined)).toBe('unknown');
    expect(subnetFor('')).toBe('unknown');
    expect(subnetFor('not-an-ip')).toBe('unknown');
  });

  it('lower-cases IPv6 hex', () => {
    expect(subnetFor('2001:DB8:ABCD:0012::1')).toBe('2001:db8:abcd::/48');
  });
});
