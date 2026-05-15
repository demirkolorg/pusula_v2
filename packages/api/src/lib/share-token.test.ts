/**
 * `share-token` helper testleri — Faz 9B (DEM-128).
 *
 * Önce-belge: `docs/architecture/14-paylasim-linki-mimarisi.md` "Token üretimi
 * & doğrulama". 32 byte plain → base64url (43 karakter) + SHA-256 hex hash + 8
 * karakter prefix. Plain token DB'de **hiçbir zaman** saklanmaz; public endpoint
 * (9C) lookup'ında gelen token hash'lenip karşılaştırılır.
 */
import { describe, expect, it } from 'vitest';
import { generateShareToken, hashShareToken } from './share-token';

describe('generateShareToken', () => {
  it('produces a 43-character base64url plaintext token', () => {
    const { token } = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('emits a deterministic 64-char SHA-256 hex hash', () => {
    const { token, tokenHash } = generateShareToken();
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(token)).toBe(tokenHash);
  });

  it('takes the first 8 characters as the prefix', () => {
    const { token, tokenPrefix } = generateShareToken();
    expect(tokenPrefix).toBe(token.slice(0, 8));
    expect(tokenPrefix).toHaveLength(8);
  });

  it('produces distinct tokens across calls (256-bit entropy)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i += 1) tokens.add(generateShareToken().token);
    expect(tokens.size).toBe(100);
  });
});

describe('hashShareToken', () => {
  it('is a pure function (same input → same output)', () => {
    expect(hashShareToken('hello')).toBe(hashShareToken('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashShareToken('a')).not.toBe(hashShareToken('b'));
  });

  it('produces a 64-char lowercase hex output for any input', () => {
    expect(hashShareToken('Misafir')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken('')).toMatch(/^[a-f0-9]{64}$/);
  });
});
