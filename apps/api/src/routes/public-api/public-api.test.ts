/**
 * Public API + Bot Erişimi (Task 4) — `/api/v1` REST adapter unit tests.
 *
 * Bu test seviyesi route→procedure çağrı MAP'ini doğrular; gerçek tRPC
 * procedure akışı (transaction/activity/realtime/outbox) bir sonraki seviyede
 * (packages/api `public-api-caller.integration.test.ts`, gerçek Postgres)
 * doğrulanır (plan Task 4 §5b).
 *
 * Mock disiplini (Task 3 `api-key-auth.test.ts` deseni):
 *  - `@pusula/db` `getDb` → state-driven fake (apiKeys/users auth lookup'ı +
 *    cards/lists scope lookup'ı).
 *  - `../../public-api/caller` `createPublicApiCaller` → in-memory fake caller
 *    (route'un hangi procedure'ü hangi input'la çağırdığını yakalar). Gerçek
 *    `withClientMutationId` korunur.
 *  - Rate limit store in-memory fake (production ioredis store Redis yokken
 *    hang eder — enjekte edilir).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { type apiKeys, type users } from '@pusula/db';
import { plainTextToTiptap } from '@pusula/domain';
import {
  generateApiKeyToken,
  type GeneratedApiKeyToken,
} from '@pusula/api/lib/api-key-token';

type ApiKeyRow = typeof apiKeys.$inferSelect;
type UserRow = typeof users.$inferSelect;

// --- fake caller (hoisted so the vi.mock factory can close over it) ---------

const callerMock = vi.hoisted(() => ({
  board: { get: vi.fn(), activity: { list: vi.fn() }, members: { list: vi.fn() } },
  list: { create: vi.fn(), update: vi.fn(), move: vi.fn(), archive: vi.fn() },
  card: {
    create: vi.fn(),
    get: vi.fn(),
    listArchived: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    moveToList: vi.fn(),
    copy: vi.fn(),
    archive: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    activity: { list: vi.fn() },
  },
}));

// Mock WITHOUT `importOriginal`: the real caller module imports `../trpc` →
// `./app`, and re-entering that chain here (mid `publicApiRoute` construction)
// breaks the app's circular import. `withClientMutationId` is a trivial pure
// merge, reimplemented inline so handlers keep working.
vi.mock('../../public-api/caller', () => ({
  createPublicApiCaller: () => callerMock,
  withClientMutationId: (input: Record<string, unknown>, clientMutationId: string) => ({
    ...input,
    clientMutationId,
  }),
}));

// --- fake db (auth + scope lookups) -----------------------------------------
//
// `dbState` + `tableRefs` live in `vi.hoisted` so the hoisted `vi.mock`
// factory can read them without a TDZ error (a plain module-level `let` is
// still uninitialised when the hoisted factory runs).
const { dbState, tableRefs } = vi.hoisted(() => ({
  dbState: {
    apiKeyRows: [] as unknown[],
    botUserRows: [] as unknown[],
    cardRows: [] as unknown[],
    listRows: [] as unknown[],
  },
  tableRefs: {} as { apiKeys?: unknown; users?: unknown; cards?: unknown; lists?: unknown },
}));

vi.mock('@pusula/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  tableRefs.apiKeys = actual.apiKeys;
  tableRefs.users = actual.users;
  tableRefs.cards = actual.cards;
  tableRefs.lists = actual.lists;

  const thenableRows = (rows: unknown[]) => ({
    limit: async (_n: number) => rows,
    then: (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onF, onR),
    catch: (onR: (e: unknown) => unknown) => Promise.resolve(rows).catch(onR),
  });
  const rowsFor = (table: unknown): unknown[] => {
    if (table === tableRefs.apiKeys) return dbState.apiKeyRows;
    if (table === tableRefs.users) return dbState.botUserRows;
    if (table === tableRefs.cards) return dbState.cardRows;
    if (table === tableRefs.lists) return dbState.listRows;
    return [];
  };
  const fakeDb = () => ({
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({ where: (_cond: unknown) => thenableRows(rowsFor(table)) }),
    }),
    update: (_table: unknown) => ({
      set: (_v: unknown) => ({ where: (_c: unknown) => Promise.resolve(undefined) }),
    }),
  });

  return { ...actual, getDb: () => fakeDb() };
});

import { createPublicApiRoute } from './index';
import type { ApiKeyRateLimitStore } from '../../middleware/api-key-auth';
import { clearRateLimitBuckets } from '../../middleware/rate-limit';
import type { IdempotencyRecord, IdempotencyStore } from '../../public-api/idempotency-store';

// --- fixtures ----------------------------------------------------------------

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

function makeApiKeyRow(token: GeneratedApiKeyToken, overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
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
    lastUsedAt: new Date(),
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as ApiKeyRow;
}

/** In-memory fixed-window store standing in for ioredis (never hangs). */
function fakeRedis(): ApiKeyRateLimitStore {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
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

/** In-memory idempotency dedup store standing in for ioredis. */
function fakeIdempotencyStore(): IdempotencyStore & { map: Map<string, IdempotencyRecord> } {
  const map = new Map<string, IdempotencyRecord>();
  return {
    map,
    get: async (key: string) => map.get(key) ?? null,
    set: async (key: string, record: IdempotencyRecord) => {
      map.set(key, record);
    },
  };
}

// Dedup disabled by default (`idempotencyStore: null`) so the MAP-verification
// tests keep their 1-request-per-call semantics; the dedup suite opts in below.
function buildApp() {
  return createPublicApiRoute({
    rateLimitStore: fakeRedis(),
    idempotencyStore: null,
    reportError: vi.fn(),
  });
}

const UUID = '11111111-1111-4111-8111-111111111111';

let token: GeneratedApiKeyToken;

function auth(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token.token}`, ...extra };
}

/** Seed a valid `member`-role key + bot user for the happy path. */
function seedValidKey(overrides: Partial<ApiKeyRow> = {}) {
  token = generateApiKeyToken();
  dbState.apiKeyRows = [makeApiKeyRow(token, overrides)];
  dbState.botUserRows = [makeBotUser()];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimitBuckets(); // isolate the shared IP-limit buckets per test.
  dbState.apiKeyRows = [];
  dbState.botUserRows = [];
  dbState.cardRows = [];
  dbState.listRows = [];
});

// --- tests -------------------------------------------------------------------

describe('/api/v1 — auth + GET /me', () => {
  it('missing Authorization → 401', async () => {
    seedValidKey();
    const res = await buildApp().request('/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /me → 200 with bot/board/role/expiry/createdAt + Cache-Control no-store', async () => {
    seedValidKey({ role: 'viewer', expiresAt: new Date('2099-01-01T00:00:00.000Z') });
    const res = await buildApp().request('/me', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      bot: { id: 'bot-1', name: 'Deploy Bot' },
      boardId: 'board-1',
      role: 'viewer',
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('/api/v1 — board reads', () => {
  it('GET /board → 200; caller.board.get called with key.boardId (viewer key allowed)', async () => {
    seedValidKey({ role: 'viewer' });
    callerMock.board.get.mockResolvedValueOnce({
      board: { id: 'board-1', title: 'B', createdAt: new Date('2026-02-02T00:00:00.000Z') },
      lists: [],
      cards: [],
    });
    const res = await buildApp().request('/board', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.board.get).toHaveBeenCalledWith({ boardId: 'board-1' });
    const body = (await res.json()) as { board: { createdAt: string } };
    // Date → ISO string via serializeForPublicApi.
    expect(body.board.createdAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('GET /board/activity → maps query params to the procedure input', async () => {
    seedValidKey();
    callerMock.board.activity.list.mockResolvedValueOnce({ items: [], nextCursor: null });
    const res = await buildApp().request('/board/activity?limit=5&type=card.created', {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect(callerMock.board.activity.list).toHaveBeenCalledWith({
      boardId: 'board-1',
      limit: 5,
      type: 'card.created',
    });
  });

  it('GET /board/members → caller.board.members.list with key.boardId', async () => {
    seedValidKey();
    callerMock.board.members.list.mockResolvedValueOnce([]);
    const res = await buildApp().request('/board/members', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.board.members.list).toHaveBeenCalledWith({ boardId: 'board-1' });
  });

  it('GET /board/members → strips PII: no `email` key in the response (M1)', async () => {
    seedValidKey();
    callerMock.board.members.list.mockResolvedValueOnce([
      {
        userId: 'u-1',
        role: 'member',
        name: 'İnsan Üye',
        email: 'human@example.test',
        image: null,
        isBot: false,
        inherited: false,
      },
    ]);
    const res = await buildApp().request('/board/members', { headers: auth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    // e-mail is stripped; the bot-safe identity fields survive.
    expect(body[0]).not.toHaveProperty('email');
    expect(body[0]).toMatchObject({
      userId: 'u-1',
      role: 'member',
      name: 'İnsan Üye',
      image: null,
      isBot: false,
    });
    // no stray e-mail anywhere in the serialized body.
    expect(JSON.stringify(body)).not.toContain('human@example.test');
  });
});

describe('/api/v1 — lists', () => {
  it('POST /lists without Idempotency-Key → 400 (caller not called)', async () => {
    seedValidKey();
    const res = await buildApp().request('/lists', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Backlog' }),
    });
    expect(res.status).toBe(400);
    expect(callerMock.list.create).not.toHaveBeenCalled();
  });

  it('POST /lists with a non-UUID Idempotency-Key → 400', async () => {
    seedValidKey();
    const res = await buildApp().request('/lists', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': 'not-a-uuid' }),
      body: JSON.stringify({ title: 'Backlog' }),
    });
    expect(res.status).toBe(400);
    expect(callerMock.list.create).not.toHaveBeenCalled();
  });

  it('POST /lists — member key → 201; input carries boardId + clientMutationId', async () => {
    seedValidKey();
    callerMock.list.create.mockResolvedValueOnce({ id: 'list-1', title: 'Backlog' });
    const res = await buildApp().request('/lists', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ title: 'Backlog' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.list.create).toHaveBeenCalledWith({
      boardId: 'board-1',
      title: 'Backlog',
      clientMutationId: UUID,
    });
  });

  it('POST /lists — a FORBIDDEN from the procedure (viewer role) maps to 403', async () => {
    seedValidKey({ role: 'viewer' });
    callerMock.list.create.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Liste oluşturma yetkiniz yok.' }),
    );
    const res = await buildApp().request('/lists', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ title: 'Backlog' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /lists/:listId in another board → 403 (caller not called)', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/lists/list-x', {
      method: 'PATCH',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.list.update).not.toHaveBeenCalled();
  });

  it('POST /lists/:listId/archive → restore body { archived:false } passes through', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.list.archive.mockResolvedValueOnce({ id: 'list-1', archivedAt: null, changed: true });
    const res = await buildApp().request('/lists/list-1/archive', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ archived: false }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.list.archive).toHaveBeenCalledWith({
      boardId: 'board-1',
      listId: 'list-1',
      archived: false,
      clientMutationId: UUID,
    });
  });
});

describe('/api/v1 — cards', () => {
  it('POST /cards → 201; list scope resolved to key board; input carries listId + cmid', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.card.create.mockResolvedValueOnce({ id: 'card-1', boardId: 'board-1' });
    const res = await buildApp().request('/cards', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ listId: 'list-1', title: 'Task' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.card.create).toHaveBeenCalledWith({
      listId: 'list-1',
      title: 'Task',
      clientMutationId: UUID,
    });
  });

  it('POST /cards into another board list → 403', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/cards', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ listId: 'list-x', title: 'Task' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.card.create).not.toHaveBeenCalled();
  });

  it('GET /cards/:cardId in another board → 403', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/cards/card-x', { headers: auth() });
    expect(res.status).toBe(403);
    expect(callerMock.card.get).not.toHaveBeenCalled();
  });

  it('GET /cards/:cardId that does not exist → 404', async () => {
    seedValidKey();
    dbState.cardRows = [];
    const res = await buildApp().request('/cards/card-missing', { headers: auth() });
    expect(res.status).toBe(404);
    expect(callerMock.card.get).not.toHaveBeenCalled();
  });

  it('GET /cards/:cardId in this board → 200; caller.card.get with cardId', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.get.mockResolvedValueOnce({ card: { id: 'card-1' }, relations: [] });
    const res = await buildApp().request('/cards/card-1', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.card.get).toHaveBeenCalledWith({ cardId: 'card-1' });
  });

  it('PATCH /cards/:cardId → only supplied keys are forwarded (dueAt:null clears)', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.update.mockResolvedValueOnce({ id: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1', {
      method: 'PATCH',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ dueAt: null }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.update).toHaveBeenCalledWith({
      cardId: 'card-1',
      dueAt: null,
      clientMutationId: UUID,
    });
    // `title` was NOT sent → must not appear on the input.
    const arg = callerMock.card.update.mock.calls[0]![0] as Record<string, unknown>;
    expect('title' in arg).toBe(false);
  });

  it('PATCH /cards/:cardId → a plain string description is normalized to a Tiptap JSON string', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.update.mockResolvedValueOnce({ id: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1', {
      method: 'PATCH',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ description: 'Yeni açıklama' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.update).toHaveBeenCalledWith({
      cardId: 'card-1',
      description: JSON.stringify(plainTextToTiptap('Yeni açıklama')),
      clientMutationId: UUID,
    });
  });

  it('PATCH /cards/:cardId → a Tiptap JSON object description is serialized (passthrough)', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.update.mockResolvedValueOnce({ id: 'card-1', changed: true });
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] };
    const res = await buildApp().request('/cards/card-1', {
      method: 'PATCH',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ description: doc, title: 'Başlık' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.update).toHaveBeenCalledWith({
      cardId: 'card-1',
      title: 'Başlık',
      description: JSON.stringify(doc),
      clientMutationId: UUID,
    });
  });

  it('PATCH /cards/:cardId → description absent stays absent (no normalization applied)', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.update.mockResolvedValueOnce({ id: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1', {
      method: 'PATCH',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ title: 'Sadece başlık' }),
    });
    expect(res.status).toBe(200);
    const arg = callerMock.card.update.mock.calls[0]![0] as Record<string, unknown>;
    expect('description' in arg).toBe(false);
  });

  it('POST /cards/:cardId/move-to-list with a cross-board target → 403', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }]; // source card OK
    dbState.listRows = [{ boardId: 'board-OTHER' }]; // target list in another board
    const res = await buildApp().request('/cards/card-1/move-to-list', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ toListId: 'list-other' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.card.moveToList).not.toHaveBeenCalled();
  });

  it('POST /cards/:cardId/complete → caller.card.complete with cardId + cmid', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.complete.mockResolvedValueOnce({ id: 'card-1', completed: true, changed: true });
    const res = await buildApp().request('/cards/card-1/complete', {
      method: 'POST',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.complete).toHaveBeenCalledWith({ cardId: 'card-1', clientMutationId: UUID });
  });
});

// --- M2: pre-identity IP rate limit ------------------------------------------

describe('/api/v1 — pre-identity IP rate limit', () => {
  // Per-key (apiKeyAuth) limiter is disabled here (rateLimitStore: null) so the
  // IP limiter is the one under test; dedup is off too.
  function buildIpLimitedApp() {
    return createPublicApiRoute({
      rateLimitStore: null,
      idempotencyStore: null,
      reportError: vi.fn(),
    });
  }

  it('throttles the 241st request per IP within the window (429)', async () => {
    seedValidKey();
    const app = buildIpLimitedApp();
    // 240 requests inside the minute window are allowed…
    for (let i = 0; i < 240; i += 1) {
      const ok = await app.request('/me', { headers: auth() });
      expect(ok.status).toBe(200);
    }
    // …the 241st is throttled before the auth/DB layer.
    const limited = await app.request('/me', { headers: auth() });
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    // The 429 body uses the public API envelope ({ error: { code, message } }),
    // consistent with the per-key apiKeyAuth limiter — NOT the `/share`-style
    // `{ error: "message" }` the shared rate-limit helper emits.
    const body = (await limited.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it('rejects at the IP layer before authentication (no key needed to hit 429)', async () => {
    // No seeded key: unauthenticated floods are still capped by IP.
    const app = buildIpLimitedApp();
    for (let i = 0; i < 240; i += 1) {
      const res = await app.request('/me');
      expect(res.status).toBe(401); // IP budget not spent yet → auth rejects.
    }
    const limited = await app.request('/me');
    expect(limited.status).toBe(429); // IP budget exhausted → throttled pre-auth.
    // Same envelope shape as the per-key limiter (not the `/share` string body).
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

// --- MAJOR-2: Idempotency-Key dedup (best-effort) ----------------------------

describe('/api/v1 — Idempotency-Key dedup', () => {
  function buildDedupApp(store: IdempotencyStore, reportError = vi.fn()) {
    return createPublicApiRoute({ rateLimitStore: fakeRedis(), idempotencyStore: store, reportError });
  }

  it('replays the first 2xx response for a repeated key + identical body (caller runs once)', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.card.create.mockResolvedValueOnce({ id: 'card-1', boardId: 'board-1' });
    const app = buildDedupApp(fakeIdempotencyStore());
    const body = JSON.stringify({ listId: 'list-1', title: 'Task' });
    const headers = auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID });

    const first = await app.request('/cards', { method: 'POST', headers, body });
    expect(first.status).toBe(201);
    expect(first.headers.get('Idempotency-Replayed')).toBeNull();
    const firstJson = await first.json();

    const second = await app.request('/cards', { method: 'POST', headers, body });
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await second.json()).toEqual(firstJson);

    // The caller (and thus the tRPC round-trip) ran exactly once…
    expect(callerMock.card.create).toHaveBeenCalledTimes(1);
    // …and the body survived the middleware's `c.req.text()` read (no double
    // consumption): the handler still parsed listId + title from the same body.
    expect(callerMock.card.create).toHaveBeenCalledWith({
      listId: 'list-1',
      title: 'Task',
      clientMutationId: UUID,
    });
  });

  it('returns 409 IDEMPOTENCY_KEY_REUSED for the same key with a different body (caller runs once)', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.card.create.mockResolvedValueOnce({ id: 'card-1', boardId: 'board-1' });
    const app = buildDedupApp(fakeIdempotencyStore());
    const headers = auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID });

    const first = await app.request('/cards', {
      method: 'POST',
      headers,
      body: JSON.stringify({ listId: 'list-1', title: 'Task A' }),
    });
    expect(first.status).toBe(201);

    const second = await app.request('/cards', {
      method: 'POST',
      headers,
      body: JSON.stringify({ listId: 'list-1', title: 'Task B' }),
    });
    expect(second.status).toBe(409);
    const json = (await second.json()) as { error: { code: string } };
    expect(json.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(callerMock.card.create).toHaveBeenCalledTimes(1);
  });

  it('does not dedup across different Idempotency-Keys (caller runs twice)', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.card.create
      .mockResolvedValueOnce({ id: 'card-1' })
      .mockResolvedValueOnce({ id: 'card-2' });
    const app = buildDedupApp(fakeIdempotencyStore());
    const body = JSON.stringify({ listId: 'list-1', title: 'Task' });
    const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

    const a = await app.request('/cards', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body,
    });
    const b = await app.request('/cards', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': OTHER_UUID }),
      body,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get('Idempotency-Replayed')).toBeNull();
    expect(callerMock.card.create).toHaveBeenCalledTimes(2);
  });

  it('fails open (request processes, reportError called) when the store.get throws', async () => {
    seedValidKey();
    dbState.listRows = [{ boardId: 'board-1' }];
    callerMock.card.create.mockResolvedValueOnce({ id: 'card-1' });
    const reportError = vi.fn();
    const brokenStore: IdempotencyStore = {
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => undefined,
    };
    const res = await buildDedupApp(brokenStore, reportError).request('/cards', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID }),
      body: JSON.stringify({ listId: 'list-1', title: 'Task' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.card.create).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalled();
  });

  it('does not dedup GET requests even when an Idempotency-Key header is present', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-1' }];
    callerMock.card.get
      .mockResolvedValueOnce({ card: { id: 'card-1' }, relations: [] })
      .mockResolvedValueOnce({ card: { id: 'card-1' }, relations: [] });
    const store = fakeIdempotencyStore();
    const app = buildDedupApp(store);
    const headers = auth({ 'Idempotency-Key': UUID });

    await app.request('/cards/card-1', { headers });
    await app.request('/cards/card-1', { headers });
    // Both GETs reached the caller; nothing was cached.
    expect(callerMock.card.get).toHaveBeenCalledTimes(2);
    expect(store.map.size).toBe(0);
  });
});
