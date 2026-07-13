/**
 * Public API + Bot Erişimi (Task 4) — `/api/v1` CORS güvenlik testi.
 *
 * Plan "Güvenlik kontrol listesi": `/api/v1` server-to-server'dır; tarayıcıdan
 * key kullanımı istenmez. app.ts global `cors` yalnız `env.APP_URL`'i yansıtır —
 * asla `Access-Control-Allow-Origin: *` DÖNMEMELİDİR. Bu testi tetiklemek için
 * key'siz bir istek yeter (apiKeyAuth 401 döner; CORS header'ı yine app-level
 * middleware'den gelir, rate-limit store hiç çağrılmaz).
 */
import { describe, expect, it } from 'vitest';
import { app } from '../../app';

describe('/api/v1 — CORS is not wide open', () => {
  it('does not return Access-Control-Allow-Origin: * on a public API request', async () => {
    const res = await app.request('/api/v1/me', {
      headers: { Origin: 'https://evil.example' },
    });
    // No key → 401, but the CORS header (if any) must never be a wildcard, and
    // must never reflect an arbitrary browser origin.
    expect(res.status).toBe(401);
    const acao = res.headers.get('Access-Control-Allow-Origin');
    expect(acao).not.toBe('*');
    expect(acao).not.toBe('https://evil.example');
  });
});
