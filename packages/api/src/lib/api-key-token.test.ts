/**
 * `api-key-token` helper testleri — Public API + Bot Erişimi (2026-07-13, Task 2).
 *
 * `share-token` emsali (`packages/api/src/lib/share-token.ts`) birebir izlenir:
 * 32 byte plain → base64url + SHA-256 hex hash. Fark: bot key'i `psk_` önekiyle
 * taşınır ve `prefix` UI/lookup için `psk_` + gövdenin ilk 8 karakteridir
 * (toplam 12). Plain token DB'de **hiçbir zaman** saklanmaz; yalnız
 * `board.apiKeys.create` response'unda bir kerelik döner (Task 7).
 */
import { describe, expect, it } from 'vitest';
import { apiKeyTokenPrefix, generateApiKeyToken, hashApiKeyToken } from './api-key-token';

describe('generateApiKeyToken', () => {
  it('produces a `psk_`-prefixed token with a 43-character base64url body', () => {
    const { token } = generateApiKeyToken();
    expect(token).toMatch(/^psk_[A-Za-z0-9_-]{43}$/);
  });

  it('emits a deterministic 64-char SHA-256 hex hash equal to the `hash` field', () => {
    const { token, hash } = generateApiKeyToken();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKeyToken(token)).toBe(hash);
  });

  it('takes the first 12 characters (`psk_` + 8) as the prefix', () => {
    const { token, prefix } = generateApiKeyToken();
    expect(prefix).toBe(token.slice(0, 12));
    expect(prefix).toHaveLength(12);
    expect(prefix.startsWith('psk_')).toBe(true);
  });

  it('produces distinct tokens across calls (256-bit entropy)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i += 1) tokens.add(generateApiKeyToken().token);
    expect(tokens.size).toBe(100);
  });
});

describe('hashApiKeyToken', () => {
  it('is a pure function (same input → same output)', () => {
    expect(hashApiKeyToken('psk_hello')).toBe(hashApiKeyToken('psk_hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashApiKeyToken('psk_a')).not.toBe(hashApiKeyToken('psk_b'));
  });

  it('produces a 64-char lowercase hex output for any input', () => {
    expect(hashApiKeyToken('psk_Misafir')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKeyToken('')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('apiKeyTokenPrefix', () => {
  it('returns the first 12 characters of the token', () => {
    const { token, prefix } = generateApiKeyToken();
    expect(apiKeyTokenPrefix(token)).toBe(prefix);
    expect(apiKeyTokenPrefix(token)).toHaveLength(12);
  });
});
