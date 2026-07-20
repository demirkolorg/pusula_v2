/**
 * Public API + Bot Erişimi (Task 5) — içerik REST adapter unit tests
 * (checklist + item + comment + label + kart üyesi/etiketi).
 *
 * `public-api.test.ts` (Task 4) mock disiplininin aynısı: `@pusula/db` `getDb`
 * state-driven fake (auth lookup + `cards` scope lookup), `../../public-api/caller`
 * in-memory fake caller (route→procedure MAP'ini yakalar; gerçek
 * `withClientMutationId` korunur), in-memory rate limit store. Bu seviye çağrı
 * MAP'ini doğrular; gerçek tRPC akışı packages/api entegrasyon testlerinde.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { type apiKeys, type users } from '@pusula/db';
import { plainTextToTiptap } from '@pusula/domain';
import {
  generateApiKeyToken,
  type GeneratedApiKeyToken,
} from '@pusula/api/lib/api-key-token';
import { richTextPreview } from '@pusula/api/lib/rich-text-preview';

type ApiKeyRow = typeof apiKeys.$inferSelect;
type UserRow = typeof users.$inferSelect;

// --- fake caller ------------------------------------------------------------

const callerMock = vi.hoisted(() => ({
  checklist: {
    list: vi.fn(),
    create: vi.fn(),
    bulkImport: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    delete: vi.fn(),
    item: {
      create: vi.fn(),
      update: vi.fn(),
      toggle: vi.fn(),
      reorder: vi.fn(),
      delete: vi.fn(),
    },
  },
  comment: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  label: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  card: {
    members: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
    labels: { add: vi.fn(), remove: vi.fn() },
  },
}));

vi.mock('../../public-api/caller', () => ({
  createPublicApiCaller: () => callerMock,
  withClientMutationId: (input: Record<string, unknown>, clientMutationId: string) => ({
    ...input,
    clientMutationId,
  }),
}));

// --- fake db (auth + card scope lookups) ------------------------------------

const { dbState, tableRefs } = vi.hoisted(() => ({
  dbState: {
    apiKeyRows: [] as unknown[],
    botUserRows: [] as unknown[],
    cardRows: [] as unknown[],
  },
  tableRefs: {} as { apiKeys?: unknown; users?: unknown; cards?: unknown },
}));

vi.mock('@pusula/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  tableRefs.apiKeys = actual.apiKeys;
  tableRefs.users = actual.users;
  tableRefs.cards = actual.cards;

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

/** The path card belongs to this key's board (scope check passes). */
function seedCardInBoard() {
  dbState.cardRows = [{ boardId: 'board-1' }];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimitBuckets(); // isolate the shared IP-limit buckets per test.
  dbState.apiKeyRows = [];
  dbState.botUserRows = [];
  dbState.cardRows = [];
});

// --- checklists -------------------------------------------------------------

describe('/api/v1 — checklists', () => {
  it('GET /cards/:cardId/checklists → 200; caller.checklist.list with cardId', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    callerMock.checklist.list.mockResolvedValueOnce([]);
    const res = await buildApp().request('/cards/card-1/checklists', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.list).toHaveBeenCalledWith({ cardId: 'card-1' });
  });

  it('POST /cards/:cardId/checklists → 201; input carries cardId + title + cmid', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.create.mockResolvedValueOnce({ id: 'cl-1', title: 'Hazırlık' });
    const res = await buildApp().request('/cards/card-1/checklists', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ title: 'Hazırlık' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      title: 'Hazırlık',
      clientMutationId: UUID,
    });
  });

  it('POST /cards/:cardId/checklists without Idempotency-Key → 400 (caller not called)', async () => {
    seedValidKey();
    seedCardInBoard();
    const res = await buildApp().request('/cards/card-1/checklists', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Hazırlık' }),
    });
    expect(res.status).toBe(400);
    expect(callerMock.checklist.create).not.toHaveBeenCalled();
  });

  it('POST /cards/:cardId/checklists in another board → 403 (caller not called)', async () => {
    seedValidKey();
    dbState.cardRows = [{ boardId: 'board-OTHER' }];
    const res = await buildApp().request('/cards/card-x/checklists', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ title: 'Hazırlık' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.checklist.create).not.toHaveBeenCalled();
  });

  it('POST /cards/:cardId/checklists for a missing card → 404', async () => {
    seedValidKey();
    dbState.cardRows = [];
    const res = await buildApp().request('/cards/card-missing/checklists', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ title: 'Hazırlık' }),
    });
    expect(res.status).toBe(404);
    expect(callerMock.checklist.create).not.toHaveBeenCalled();
  });

  it('POST /cards/:cardId/checklists/bulk-import → passes the checklists array through', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.bulkImport.mockResolvedValueOnce({ checklistCount: 1, itemCount: 2 });
    const checklists = [{ title: 'Sprint', items: ['Madde 1', 'Madde 2'] }];
    const res = await buildApp().request('/cards/card-1/checklists/bulk-import', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ checklists }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.bulkImport).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklists,
      clientMutationId: UUID,
    });
  });

  it('PATCH /cards/:cardId/checklists/:checklistId → only supplied keys forwarded', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.update.mockResolvedValueOnce({ id: 'cl-1', changed: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ title: 'Yeni ad' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.update).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      title: 'Yeni ad',
      clientMutationId: UUID,
    });
  });

  it('POST …/checklists/:checklistId/archive → restore { archived:false } passes through', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.archive.mockResolvedValueOnce({ id: 'cl-1', changed: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/archive', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ archived: false }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.archive).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      archived: false,
      clientMutationId: UUID,
    });
  });

  it('DELETE …/checklists/:checklistId → caller.checklist.delete with ids + cmid', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.delete.mockResolvedValueOnce({ id: 'cl-1', deleted: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.delete).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      clientMutationId: UUID,
    });
  });
});

describe('/api/v1 — checklist items', () => {
  it('POST …/items with a plain string content → converted to a Tiptap JSON string', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.create.mockResolvedValueOnce({ id: 'it-1' });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ content: 'Alt görev' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.item.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      content: JSON.stringify(plainTextToTiptap('Alt görev')),
      clientMutationId: UUID,
    });
  });

  it('POST …/items with a Tiptap JSON object content → serialized (passthrough)', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.create.mockResolvedValueOnce({ id: 'it-1' });
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] };
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ content: doc, parentItemId: 'it-parent' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.item.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      content: JSON.stringify(doc),
      parentItemId: 'it-parent',
      clientMutationId: UUID,
    });
  });

  // Regresyon: bot GET'ten okuduğu ham içeriği geri gönderdiğinde (oku → değiştir
  // → PATCH) değer ikinci kez adaptörden geçer. Guard olmadan serialize doc dış
  // bir doc'un text düğümüne gömülür ve web/mobil maddeyi ham JSON gösterirdi.
  it('POST …/items with an already serialized Tiptap doc string → passed through (idempotent)', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.create.mockResolvedValueOnce({ id: 'it-1' });
    const stored = JSON.stringify(plainTextToTiptap('Ana ekranda kayan yazılar var.'));
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ content: stored }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.item.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      content: stored,
      clientMutationId: UUID,
    });
  });

  it('PATCH …/items/:itemId with an already serialized Tiptap doc string → passed through', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.update.mockResolvedValueOnce({ id: 'it-1' });
    const stored = JSON.stringify(plainTextToTiptap('Güncellenmiş madde'));
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items/it-1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ content: stored }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: stored }),
    );
  });

  // Düz metnin `{` ile başlaması guard'ı tetiklememeli — yalnız `type: 'doc'`
  // çözülen string kanonik sayılır.
  it('POST …/items with a plain string that merely starts with "{" → still wrapped', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.create.mockResolvedValueOnce({ id: 'it-1' });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ content: '{ bozuk json değil ama süslü ile başlıyor' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.checklist.item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify(plainTextToTiptap('{ bozuk json değil ama süslü ile başlıyor')),
      }),
    );
  });

  it('POST …/items/:itemId/toggle → caller.checklist.item.toggle with completed', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.toggle.mockResolvedValueOnce({ id: 'it-1', completed: true, changed: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items/it-1/toggle', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.item.toggle).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      itemId: 'it-1',
      completed: true,
      clientMutationId: UUID,
    });
  });

  it('POST …/items/:itemId/reorder → forwards neighbour ids', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.reorder.mockResolvedValueOnce({ id: 'it-1', changed: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items/it-1/reorder', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ beforeItemId: 'it-0', afterItemId: 'it-2' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.item.reorder).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      itemId: 'it-1',
      beforeItemId: 'it-0',
      afterItemId: 'it-2',
      clientMutationId: UUID,
    });
  });

  it('DELETE …/items/:itemId → caller.checklist.item.delete', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.checklist.item.delete.mockResolvedValueOnce({ id: 'it-1', deleted: true });
    const res = await buildApp().request('/cards/card-1/checklists/cl-1/items/it-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.checklist.item.delete).toHaveBeenCalledWith({
      cardId: 'card-1',
      checklistId: 'cl-1',
      itemId: 'it-1',
      clientMutationId: UUID,
    });
  });
});

// --- comments ---------------------------------------------------------------

describe('/api/v1 — comments', () => {
  it('POST /cards/:cardId/comments → 201; body string → Tiptap; response has previewText', async () => {
    seedValidKey();
    seedCardInBoard();
    const storedBody = JSON.stringify(plainTextToTiptap('Merhaba dünya'));
    callerMock.comment.create.mockResolvedValueOnce({
      id: 'cm-1',
      cardId: 'card-1',
      body: storedBody,
    });
    const res = await buildApp().request('/cards/card-1/comments', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ body: 'Bir yorum' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.comment.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      body: JSON.stringify(plainTextToTiptap('Bir yorum')),
      clientMutationId: UUID,
    });
    const json = (await res.json()) as { previewText: string; body: string };
    expect(json.previewText).toBe('Merhaba dünya');
    expect(json.previewText).toBe(richTextPreview(storedBody));
    // Raw body is preserved alongside the preview.
    expect(json.body).toBe(storedBody);
  });

  it('POST /cards/:cardId/comments with checklistItemId thread target passes it through', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.comment.create.mockResolvedValueOnce({ id: 'cm-1', cardId: 'card-1', body: 'x' });
    const res = await buildApp().request('/cards/card-1/comments', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ body: 'Madde yorumu', checklistItemId: 'it-9' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.comment.create).toHaveBeenCalledWith({
      cardId: 'card-1',
      body: JSON.stringify(plainTextToTiptap('Madde yorumu')),
      checklistItemId: 'it-9',
      clientMutationId: UUID,
    });
  });

  it('GET /cards/:cardId/comments → each comment gets a previewText', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    const b1 = JSON.stringify(plainTextToTiptap('Birinci'));
    callerMock.comment.list.mockResolvedValueOnce([
      { id: 'cm-1', body: b1 },
      { id: 'cm-2', body: '' }, // soft-deleted → empty preview
    ]);
    const res = await buildApp().request('/cards/card-1/comments', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.comment.list).toHaveBeenCalledWith({ cardId: 'card-1' });
    const json = (await res.json()) as Array<{ previewText: string }>;
    expect(json[0]!.previewText).toBe('Birinci');
    expect(json[1]!.previewText).toBe('');
  });

  it('PATCH /cards/:cardId/comments/:commentId — someone else’s comment → procedure FORBIDDEN → 403', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.comment.update.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Bu yorumu düzenleyemezsiniz.' }),
    );
    const res = await buildApp().request('/cards/card-1/comments/cm-9', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ body: 'değişiklik' }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('DELETE /cards/:cardId/comments/:commentId → caller.comment.delete with cmid', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.comment.delete.mockResolvedValueOnce({ id: 'cm-1', deletedAt: null, changed: true });
    const res = await buildApp().request('/cards/card-1/comments/cm-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.comment.delete).toHaveBeenCalledWith({
      cardId: 'card-1',
      commentId: 'cm-1',
      clientMutationId: UUID,
    });
  });
});

// --- labels -----------------------------------------------------------------

describe('/api/v1 — labels', () => {
  it('GET /labels → caller.label.list with key.boardId', async () => {
    seedValidKey({ role: 'viewer' });
    callerMock.label.list.mockResolvedValueOnce([]);
    const res = await buildApp().request('/labels', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.label.list).toHaveBeenCalledWith({ boardId: 'board-1' });
  });

  it('POST /labels → 201; boardId injected, colour + name forwarded', async () => {
    seedValidKey();
    callerMock.label.create.mockResolvedValueOnce({ id: 'lbl-1' });
    const res = await buildApp().request('/labels', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ color: 'green', name: 'Acil' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.label.create).toHaveBeenCalledWith({
      boardId: 'board-1',
      color: 'green',
      name: 'Acil',
      clientMutationId: UUID,
    });
  });

  it('POST /labels — viewer key → procedure FORBIDDEN → 403', async () => {
    seedValidKey({ role: 'viewer' });
    callerMock.label.create.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Etiket oluşturma yetkiniz yok.' }),
    );
    const res = await buildApp().request('/labels', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ color: 'green' }),
    });
    expect(res.status).toBe(403);
    expect(callerMock.label.create).toHaveBeenCalled();
  });

  it('PATCH /labels/:labelId → boardId + labelId + supplied fields', async () => {
    seedValidKey();
    callerMock.label.update.mockResolvedValueOnce({ id: 'lbl-1' });
    const res = await buildApp().request('/labels/lbl-1', {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ name: 'Yeni' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.label.update).toHaveBeenCalledWith({
      boardId: 'board-1',
      labelId: 'lbl-1',
      name: 'Yeni',
      clientMutationId: UUID,
    });
  });

  it('DELETE /labels/:labelId → caller.label.delete', async () => {
    seedValidKey();
    callerMock.label.delete.mockResolvedValueOnce({ id: 'lbl-1', deleted: true });
    const res = await buildApp().request('/labels/lbl-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.label.delete).toHaveBeenCalledWith({
      boardId: 'board-1',
      labelId: 'lbl-1',
      clientMutationId: UUID,
    });
  });
});

// --- card members + card labels ---------------------------------------------

describe('/api/v1 — card members', () => {
  it('GET /cards/:cardId/members → caller.card.members.list with cardId', async () => {
    seedValidKey({ role: 'viewer' });
    seedCardInBoard();
    callerMock.card.members.list.mockResolvedValueOnce([]);
    const res = await buildApp().request('/cards/card-1/members', { headers: auth() });
    expect(res.status).toBe(200);
    expect(callerMock.card.members.list).toHaveBeenCalledWith({ cardId: 'card-1' });
  });

  it('POST /cards/:cardId/members → 201; userId + role forwarded', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.card.members.add.mockResolvedValueOnce({ cardId: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1/members', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ userId: 'user-9', role: 'assignee' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.card.members.add).toHaveBeenCalledWith({
      cardId: 'card-1',
      userId: 'user-9',
      role: 'assignee',
      clientMutationId: UUID,
    });
  });

  it('POST /cards/:cardId/members — self-add → procedure FORBIDDEN → 403 (DEM-298)', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.card.members.add.mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Kendinizi karta ekleyemezsiniz.' }),
    );
    const res = await buildApp().request('/cards/card-1/members', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ userId: 'bot-1', role: 'assignee' }),
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /cards/:cardId/members/:userId → role taken from body', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.card.members.remove.mockResolvedValueOnce({ cardId: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1/members/user-9', {
      method: 'DELETE',
      headers: jsonHeaders(),
      body: JSON.stringify({ role: 'watcher' }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.members.remove).toHaveBeenCalledWith({
      cardId: 'card-1',
      userId: 'user-9',
      role: 'watcher',
      clientMutationId: UUID,
    });
  });

  it('POST /cards/:cardId/labels → labelId forwarded', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.card.labels.add.mockResolvedValueOnce({ cardId: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1/labels', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ labelId: 'lbl-1' }),
    });
    expect(res.status).toBe(201);
    expect(callerMock.card.labels.add).toHaveBeenCalledWith({
      cardId: 'card-1',
      labelId: 'lbl-1',
      clientMutationId: UUID,
    });
  });

  it('DELETE /cards/:cardId/labels/:labelId → caller.card.labels.remove', async () => {
    seedValidKey();
    seedCardInBoard();
    callerMock.card.labels.remove.mockResolvedValueOnce({ cardId: 'card-1', changed: true });
    const res = await buildApp().request('/cards/card-1/labels/lbl-1', {
      method: 'DELETE',
      headers: auth({ 'Idempotency-Key': UUID }),
    });
    expect(res.status).toBe(200);
    expect(callerMock.card.labels.remove).toHaveBeenCalledWith({
      cardId: 'card-1',
      labelId: 'lbl-1',
      clientMutationId: UUID,
    });
  });
});
