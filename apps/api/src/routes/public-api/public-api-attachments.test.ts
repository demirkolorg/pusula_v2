/**
 * Public API + Bot Erişimi (Task 6) — attachment REST adapter unit tests.
 *
 * `public-api.test.ts` mock disiplini + `attachments` scope lookup'ı: iki fazlı
 * commit akışı (`initiate` → `commit`), `list`/`download-url`, viewer key
 * `initiate` → 403, ve **cross-key commit invariant**'ı (`uploaderId ===
 * session.user.id`; farklı bot'un initiate ettiği eki commit'lemek procedure
 * `FORBIDDEN` → 403). Çağrı MAP seviyesi; gerçek MinIO/presign akışı packages/api
 * entegrasyon testlerinde.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { type apiKeys, type users } from '@pusula/db';
import {
  generateApiKeyToken,
  type GeneratedApiKeyToken,
} from '@pusula/api/lib/api-key-token';

type ApiKeyRow = typeof apiKeys.$inferSelect;
type UserRow = typeof users.$inferSelect;

// --- fake caller ------------------------------------------------------------

const callerMock = vi.hoisted(() => ({
  attachment: {
    initiate: vi.fn(),
    commit: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getDownloadUrl: vi.fn(),
  },
}));

vi.mock('../../public-api/caller', () => ({
  createPublicApiCaller: () => callerMock,
  withClientMutationId: (input: Record<string, unknown>, clientMutationId: string) => ({
    ...input,
    clientMutationId,
  }),
}));

// --- fake db (auth + card + attachment scope lookups) -----------------------

const { dbState, tableRefs } = vi.hoisted(() => ({
  dbState: {
    apiKeyRows: [] as unknown[],
    botUserRows: [] as unknown[],
    cardRows: [] as unknown[],
    attachmentRows: [] as unknown[],
  },
  tableRefs: {} as { apiKeys?: unknown; users?: unknown; cards?: unknown; attachments?: unknown },
}));

vi.mock('@pusula/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  tableRefs.apiKeys = actual.apiKeys;
  tableRefs.users = actual.users;
  tableRefs.cards = actual.cards;
  tableRefs.attachments = actual.attachments;

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
    if (table === tableRefs.attachments) return dbState.attachmentRows;
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
import { clearRateLimitBuckets } from '../../middleware/rate-limit';

// --- fixtures ---------------------------------------------------------------

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

function fakeRedis() {
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

function jsonHeaders(): Record<string, string> {
  return auth({ 'Content-Type': 'application/json', 'Idempotency-Key': UUID });
}

function seedValidKey(overrides: Partial<ApiKeyRow> = {}) {
  token = generateApiKeyToken();
  dbState.apiKeyRows = [makeApiKeyRow(token, overrides)];
  dbState.botUserRows = [makeBotUser()];
}

function seedCardInBoard() {
  dbState.cardRows = [{ boardId: 'board-1' }];
}

function seedAttachmentInBoard() {
  dbState.attachmentRows = [{ boardId: 'board-1' }];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimitBuckets(); // isolate the shared IP-limit buckets per test.
  dbState.apiKeyRows = [];
  dbState.botUserRows = [];
  dbState.cardRows = [];
  dbState.attachmentRows = [];
});

// --- tests ------------------------------------------------------------------

describe('/api/v1 — attachments', () => {
  it('POST /cards/:cardId/attachments/initiate → 201; metadata + cmid forwarded', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.attachment.initiate.mockResolvedValueOnce({
      attachmentId: 'att-1',
      upload: { url: 'https://minio/put', method: 'PUT', headers: {} },
      expiresAt: new Date('2026-01-01T00:10:00.000Z'),
    });
    const res = await buildApp().request('/cards/card-1/attachments/initiate', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ fileName: 'rapor.pdf', mimeType: 'application/pdf', size: 1024 }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.attachment.initiate).toHaveBeenCalledWith({
      cardId: 'card-1',
      fileName: 'rapor.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      clientMutationId: UUID,
    });
    const json = (await res.json()) as { expiresAt: string };
    // Date → ISO via serializeForPublicApi.
    expect(json.expiresAt).toBe('2026-01-01T00:10:00.000Z');
  });

  it('POST …/initiate — viewer key → procedure FORBIDDEN → 403', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    callerMock.attachment.initiate.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Dosya yukleme yetkiniz yok.' }),
    );
    const res = await buildApp().request('/cards/card-1/attachments/initiate', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ fileName: 'x.pdf', mimeType: 'application/pdf', size: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it('POST …/initiate without Idempotency-Key → 400 (caller not called)', async () => {
    seedValidKey();
    seedCardInBoard();
    const res = await buildApp().request('/cards/card-1/attachments/initiate', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fileName: 'x.pdf', mimeType: 'application/pdf', size: 1 }),
    });
    expect(res.status).toBe(400);
    expect(callerMock.attachment.initiate).not.toHaveBeenCalled();
  });

  it('POST /cards/:cardId/attachments/commit → attachmentId from body + cmid', async () => {
    seedValidKey();
    seedCardInBoard();
    seedAttachmentInBoard();
    callerMock.attachment.commit.mockResolvedValueOnce({ id: 'att-1', committedAt: new Date() });
    const res = await buildApp().request('/cards/card-1/attachments/commit', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ attachmentId: 'att-1' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.attachment.commit).toHaveBeenCalledWith({
      attachmentId: 'att-1',
      clientMutationId: UUID,
    });
  });

  it('POST …/commit for an attachment uploaded by a different bot → procedure FORBIDDEN → 403', async () => {
    // Same board (scope passes), but the uploaderId != this bot session → the
    // `attachment.commit` invariant throws FORBIDDEN, which maps to 403.
    seedValidKey();
    seedCardInBoard();
    seedAttachmentInBoard();
    callerMock.attachment.commit.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Sadece yukleyen kullanici onaylayabilir.' }),
    );
    const res = await buildApp().request('/cards/card-1/attachments/commit', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ attachmentId: 'att-other-bot' }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('POST …/commit for an attachment in another board → 403 (scope; caller not called)', async () => {
    seedValidKey();
    seedCardInBoard();
    dbState.attachmentRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/cards/card-1/attachments/commit', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ attachmentId: 'att-x' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.attachment.commit).not.toHaveBeenCalled();
  });

  it('GET /cards/:cardId/attachments → caller.attachment.list with cardId', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    callerMock.attachment.list.mockResolvedValueOnce([]);
    const res = await buildApp().request('/cards/card-1/attachments', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.attachment.list).toHaveBeenCalledWith({ cardId: 'card-1' });
  });

  it('PATCH /cards/:cardId/attachments/:attachmentId → description forwarded', async () => {
    seedValidKey();
    seedCardInBoard();
    seedAttachmentInBoard();
    callerMock.attachment.update.mockResolvedValueOnce({ id: 'att-1' });
    const res = await buildApp().request('/cards/card-1/attachments/att-1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ description: 'Sözleşme' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.attachment.update).toHaveBeenCalledWith({
      attachmentId: 'att-1',
      description: 'Sözleşme',
      clientMutationId: UUID,
    });
  });

  it('PATCH …/:attachmentId for an attachment in another board → 403 (caller not called)', async () => {
    seedValidKey();
    seedCardInBoard();
    dbState.attachmentRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/cards/card-1/attachments/att-x', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ description: 'x' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.attachment.update).not.toHaveBeenCalled();
  });

  it('DELETE /cards/:cardId/attachments/:attachmentId → caller.attachment.delete', async () => {
    seedValidKey();
    seedCardInBoard();
    seedAttachmentInBoard();
    callerMock.attachment.delete.mockResolvedValueOnce({ id: 'att-1', ok: true });
    const res = await buildApp().request('/cards/card-1/attachments/att-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.attachment.delete).toHaveBeenCalledWith({
      attachmentId: 'att-1',
      clientMutationId: UUID,
    });
  });

  it('DELETE …/:attachmentId for a missing attachment → 404 (caller not called)', async () => {
    seedValidKey();
    seedCardInBoard();
    dbState.attachmentRows = [];
    const res = await buildApp().request('/cards/card-1/attachments/att-missing', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(404);
    expect(callerMock.attachment.delete).not.toHaveBeenCalled();
  });

  it('GET …/:attachmentId/download-url → caller.attachment.getDownloadUrl (no idempotency)', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    seedAttachmentInBoard();
    callerMock.attachment.getDownloadUrl.mockResolvedValueOnce({ url: 'https://minio/get' });
    const res = await buildApp().request('/cards/card-1/attachments/att-1/download-url', {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect(callerMock.attachment.getDownloadUrl).toHaveBeenCalledWith({ attachmentId: 'att-1' });
  });
});
