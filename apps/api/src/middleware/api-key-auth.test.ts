/**
 * apiKeyAuth Hono middleware unit tests (Public API + Bot Erişimi — Task 3).
 *
 * Live DB is mocked (same discipline as `routes/board-report.test.ts`): a
 * state-driven fake `getDb` returns the seeded `api_keys` / bot `users` rows so
 * the middleware exercises the real prefix lookup → `timingSafeEqual` hash
 * compare → revoked/expired → bot check → Redis rate limit → last_used_at
 * throttle path without a database. The rate-limit Redis client is injected
 * (middleware factory parameter) as an in-memory fake.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { apiKeys, type users } from '@pusula/db';
import { generateApiKeyToken, apiKeyTokenPrefix, hashApiKeyToken } from '@pusula/api/lib/api-key-token';

type ApiKeyRow = typeof apiKeys.$inferSelect;
type UserRow = typeof users.$inferSelect;

const dbState = {
  apiKeyRows: [] as ApiKeyRow[],
  botUserRows: [] as UserRow[],
  updateCalls: [] as unknown[],
};

/** Thenable that also carries a `.limit()` — the middleware awaits the api_keys
 *  query directly (no limit) but uses `.limit(1)` for the bot user lookup. */
function thenableRows(rows: unknown[]) {
  return {
    limit: async (_n: number) => rows,
    then: (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onF, onR),
    catch: (onR: (e: unknown) => unknown) => Promise.resolve(rows).catch(onR),
  };
}

function fakeDb() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) =>
          thenableRows(table === apiKeys ? dbState.apiKeyRows : dbState.botUserRows),
      }),
    }),
    update: (_table: unknown) => ({
      set: (values: unknown) => ({
        where: (_cond: unknown) => {
          dbState.updateCalls.push(values);
          return Promise.resolve(undefined);
        },
      }),
    }),
  };
}

vi.mock('@pusula/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getDb: () => fakeDb() };
});

import { apiKeyAuth, type ApiKeyAuthEnv, type ApiKeyRateLimitStore } from './api-key-auth';

// --- fixtures -------------------------------------------------------------

function makeBotUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'bot-1',
    name: 'Deploy Bot',
    email: 'bot+key1@bots.pusula.internal',
    emailVerified: false,
    image: null,
    isBot: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as UserRow;
}

function makeApiKeyRow(
  token: { hash: string; prefix: string },
  overrides: Partial<ApiKeyRow> = {},
): ApiKeyRow {
  return {
    id: 'key-1',
    name: 'Deploy Bot',
    tokenHash: token.hash,
    tokenPrefix: token.prefix,
    botUserId: 'bot-1',
    boardId: 'board-1',
    role: 'member',
    createdBy: 'human-1',
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as ApiKeyRow;
}

/** In-memory fixed-window store standing in for ioredis. */
function fakeRedis(): ApiKeyRateLimitStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    counts,
    incr: async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    expire: async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    },
    ttl: async (key: string) => ttls.get(key) ?? -1,
  };
}

function buildApp(store?: ApiKeyRateLimitStore | null, reportError = vi.fn()) {
  const app = new Hono<ApiKeyAuthEnv>();
  app.use(
    '*',
    apiKeyAuth({ rateLimitStore: store ?? null, reportError }),
  );
  app.get('/', (c) => {
    const auth = c.get('apiKeyAuth');
    return c.json({ apiKeyId: auth.apiKey.id, botUserId: auth.botUser.id });
  });
  return app;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  dbState.apiKeyRows = [];
  dbState.botUserRows = [];
  dbState.updateCalls = [];
});

// --- tests ----------------------------------------------------------------

describe('apiKeyAuth — auth failures', () => {
  it('missing Authorization header → 401 with UNAUTHORIZED body + Cache-Control no-store', async () => {
    const res = await buildApp().request('/');
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('malformed Authorization header (no Bearer) → 401', async () => {
    const res = await buildApp().request('/', { headers: { Authorization: 'psk_abc' } });
    expect(res.status).toBe(401);
  });

  it('malformed token (not psk_ format) → 401', async () => {
    const res = await buildApp().request('/', { headers: bearer('notatoken') });
    expect(res.status).toBe(401);
  });

  it('well-formed token with no matching prefix → 401', async () => {
    const { token } = generateApiKeyToken();
    // dbState.apiKeyRows stays empty → no candidate.
    const res = await buildApp().request('/', { headers: bearer(token) });
    expect(res.status).toBe(401);
  });

  it('prefix match but hash mismatch → 401 (timingSafeEqual rejects)', async () => {
    const sent = generateApiKeyToken();
    const other = generateApiKeyToken();
    // Same prefix as the sent token but the stored hash belongs to another token.
    dbState.apiKeyRows = [
      makeApiKeyRow({ prefix: apiKeyTokenPrefix(sent.token), hash: other.hash }),
    ];
    dbState.botUserRows = [makeBotUser()];
    const res = await buildApp().request('/', { headers: bearer(sent.token) });
    expect(res.status).toBe(401);
  });

  it('revoked key → 401', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t, { revokedAt: new Date('2026-06-01T00:00:00.000Z') })];
    dbState.botUserRows = [makeBotUser()];
    const res = await buildApp().request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(401);
  });

  it('expired key → 401', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t, { expiresAt: new Date('2020-01-01T00:00:00.000Z') })];
    dbState.botUserRows = [makeBotUser()];
    const res = await buildApp().request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(401);
  });

  it('bot user missing → 401', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = []; // no user row
    const res = await buildApp().request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(401);
  });

  it('resolved user is not a bot → 401', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser({ isBot: false })];
    const res = await buildApp().request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(401);
  });
});

describe('apiKeyAuth — success + context', () => {
  it('valid key → next() with apiKeyAuth in context', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser()];
    const res = await buildApp(fakeRedis()).request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ apiKeyId: 'key-1', botUserId: 'bot-1' });
  });

  it('confirms the stored hash equals hashApiKeyToken(sent token)', async () => {
    const t = generateApiKeyToken();
    expect(t.hash).toBe(hashApiKeyToken(t.token));
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser()];
    const res = await buildApp(fakeRedis()).request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(200);
  });

  it('fires a throttled last_used_at update when lastUsedAt is null', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t, { lastUsedAt: null })];
    dbState.botUserRows = [makeBotUser()];
    await buildApp(fakeRedis()).request('/', { headers: bearer(t.token) });
    // allow the fire-and-forget update to flush
    await Promise.resolve();
    expect(dbState.updateCalls.length).toBe(1);
  });

  it('skips the last_used_at update when it was written within the throttle window', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t, { lastUsedAt: new Date() })];
    dbState.botUserRows = [makeBotUser()];
    await buildApp(fakeRedis()).request('/', { headers: bearer(t.token) });
    await Promise.resolve();
    expect(dbState.updateCalls.length).toBe(0);
  });
});

describe('apiKeyAuth — rate limiting', () => {
  it('returns 429 + Retry-After once the per-key window limit is exceeded', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser()];
    const app = buildApp(fakeRedis());

    // 120 requests inside the window are allowed…
    for (let i = 0; i < 120; i += 1) {
      const ok = await app.request('/', { headers: bearer(t.token) });
      expect(ok.status).toBe(200);
    }
    // …the 121st is throttled.
    const limited = await app.request('/', { headers: bearer(t.token) });
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('fails open (request passes) when the Redis store throws, and reports the error', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser()];
    const reportError = vi.fn();
    const brokenStore: ApiKeyRateLimitStore = {
      incr: async () => {
        throw new Error('redis down');
      },
      expire: async () => 1,
      ttl: async () => -1,
    };
    const res = await buildApp(brokenStore, reportError).request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('re-applies EXPIRE when a throttled counter has lost its TTL (self-heal, no permanent 429 lock)', async () => {
    const t = generateApiKeyToken();
    dbState.apiKeyRows = [makeApiKeyRow(t)];
    dbState.botUserRows = [makeBotUser()];
    const expireCalls: Array<{ key: string; seconds: number }> = [];
    // Counter already over the 120 window limit AND without a TTL (EXPIRE was
    // lost) — the classic permanent-lock scenario the self-heal must break.
    const orphanedStore: ApiKeyRateLimitStore = {
      incr: async () => 121,
      expire: async (key: string, seconds: number) => {
        expireCalls.push({ key, seconds });
        return 1;
      },
      ttl: async () => -1,
    };
    const res = await buildApp(orphanedStore).request('/', { headers: bearer(t.token) });
    expect(res.status).toBe(429);
    // The window length is re-applied to the key so it can eventually reset.
    expect(expireCalls).toContainEqual({ key: 'ratelimit:apikey:key-1', seconds: 60 });
    // Retry-After reflects the re-applied window.
    expect(res.headers.get('Retry-After')).toBe('60');
  });
});
