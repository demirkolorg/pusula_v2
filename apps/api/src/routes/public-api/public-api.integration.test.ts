/**
 * Public API + Bot Erişimi (Task 11) — `/api/v1` REST yüzeyinin GERÇEK-DB
 * uçtan-uca entegrasyon testi.
 *
 * Diğer route testleri (`public-api.test.ts`, `public-api-content.test.ts`, …)
 * `@pusula/db`'yi ve `../../public-api/caller`'ı MOCK'lar; yalnız route→procedure
 * çağrı MAP'ini doğrularlar. Bu dosya ise HİÇBİR şeyi mock'lamaz: gerçek
 * `createPublicApiRoute` + gerçek `apiKeyAuth` (gerçek `getDb()` lookup) + gerçek
 * `createPublicApiCaller` → gerçek tRPC procedure → gerçek Postgres transaction
 * zinciri boyunca HTTP isteği koşar. Böylece botun yaptığı mutasyonun normal
 * kullanıcı mutasyonuyla AYNI DB + activity zincirinden geçtiği tam yol üzerinde
 * kanıtlanır.
 *
 * Test dosyası konumu kararı: apps/api. Buradaki vitest kurulumunda GLOBAL bir db
 * mock'u yoktur (`apps/api/vitest.config.ts` yalnız `include` tanımlar; her test
 * dosyası kendi `vi.mock('@pusula/db')`'sini bildirir). Bu dosya o mock'u HİÇ
 * bildirmediği için gerçek `@pusula/db` kullanılır — `vi.unmock`'a gerek yok.
 * `cors.test.ts` de aynı disiplinle gerçek `app`'i import eder. Rate limit +
 * idempotency store'ları in-memory fake enjekte edilir (production ioredis store
 * Redis yokken hang eder — bu yüzden asla çağrılmaz).
 *
 * DB ulaşılamazsa (`DATABASE_URL` yok / Postgres kapalı) suite `describe.runIf`
 * ile atlanır — `board-api-keys.test.ts` / `public-api-caller.integration.test.ts`
 * DB-probe deseni. Seed düzeni `board-api-keys.test.ts`'i izler: workspace + owner
 * insan + board + bot user + `workspace_members(guest)` + `board_members` +
 * `api_keys`. Her test taze id'lerle izole; temizlik `afterAll` workspace cascade.
 */
// IMPORTANT — side-effect import FIRST. The real caller chain
// (`./index` → route files → `../../public-api/caller` → `../trpc` → `../../app`)
// is circular: `app.ts` builds the production `publicApiRoute` from `./index`.
// Importing `./index` as the graph entry re-enters that cycle mid-construction
// (`publicApiRoute` still `undefined` → `app.route` throws). The other route
// tests dodge this by mocking `../../public-api/caller` WITHOUT `importOriginal`;
// this suite wants the REAL caller, so instead it seeds the graph via `../../app`
// (the production entry order, exactly like `cors.test.ts`) — after which
// `./index` is fully evaluated and `createPublicApiRoute` is safe to call.
import '../../app';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  apiKeys,
  boardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { appRouter, createCallerFactory, createContext, type SessionInfo } from '@pusula/api';
import {
  generateApiKeyToken,
  type GeneratedApiKeyToken,
} from '@pusula/api/lib/api-key-token';
import { richTextPreview } from '@pusula/api/lib/rich-text-preview';
import { plainTextToTiptap } from '@pusula/domain';
import { createPublicApiRoute } from './index';
import type { ApiKeyRateLimitStore } from '../../middleware/api-key-auth';
import { clearRateLimitBuckets } from '../../middleware/rate-limit';
import type { IdempotencyRecord, IdempotencyStore } from '../../public-api/idempotency-store';

// Probe the database at collection time so `describe.runIf` can react to it.
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
const emailOf = (id: string) => `${id}@example.test`;
const botEmailFor = (keyId: string) => `bot+${keyId}@bots.pusula.internal`;

// Human owner (workspace owner = inherited board admin) + three bot service
// accounts: a `member` key, a `viewer` key and a dedicated `revoke` key (isolated
// so revoking it never disturbs the other tests' key).
const ownerId = newId('u-pai-owner');
const memberBotId = newId('u-pai-mbot');
const viewerBotId = newId('u-pai-vbot');
const revokeBotId = newId('u-pai-rbot');
const memberKeyId = newId('key-pai-m');
const viewerKeyId = newId('key-pai-v');
const revokeKeyId = newId('key-pai-r');

const humanSession = (id: string): SessionInfo => ({ user: { id, email: emailOf(id), name: id } });

function humanCaller(id: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: humanSession(id), db: probe.db }));
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
function fakeIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, IdempotencyRecord>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    set: async (key: string, record: IdempotencyRecord) => {
      map.set(key, record);
    },
  };
}

type PublicApiApp = ReturnType<typeof createPublicApiRoute>;

/** A fresh `/api/v1` app; dedup off by default (each test opts in). */
function buildApp(opts: { idempotency?: IdempotencyStore | null } = {}): PublicApiApp {
  return createPublicApiRoute({
    rateLimitStore: fakeRedis(),
    idempotencyStore: opts.idempotency ?? null,
    reportError: vi.fn(),
  });
}

// Assigned in `beforeAll` — one plain token per key.
let memberToken: GeneratedApiKeyToken;
let viewerToken: GeneratedApiKeyToken;
let revokeToken: GeneratedApiKeyToken;

function bearer(token: GeneratedApiKeyToken, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token.token}`, ...extra };
}

/** Auth + JSON + a fresh (random UUID) Idempotency-Key; override via `extra`. */
function jsonHeaders(
  token: GeneratedApiKeyToken,
  extra: Record<string, string> = {},
): Record<string, string> {
  return bearer(token, {
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
    ...extra,
  });
}

async function createListViaApi(app: PublicApiApp, title = 'List'): Promise<string> {
  const res = await app.request('/lists', {
    method: 'POST',
    headers: jsonHeaders(memberToken),
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createCardViaApi(app: PublicApiApp, listId: string, title: string): Promise<string> {
  const res = await app.request('/cards', {
    method: 'POST',
    headers: jsonHeaders(memberToken),
    body: JSON.stringify({ listId, title }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe.runIf(dbAvailable)('/api/v1 route (real DB integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let board2Id: string;
  let board2CardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    // Human owner + three bot service accounts.
    await db()
      .insert(users)
      .values([
        { id: ownerId, name: ownerId, email: emailOf(ownerId) },
        { id: memberBotId, name: 'Member Bot', email: botEmailFor(memberKeyId), isBot: true },
        { id: viewerBotId, name: 'Viewer Bot', email: botEmailFor(viewerKeyId), isBot: true },
        { id: revokeBotId, name: 'Revoke Bot', email: botEmailFor(revokeKeyId), isBot: true },
      ]);

    const ws = await humanCaller(ownerId).workspace.create({
      name: 'Public API Co',
      slug: newSlug('public-api-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);

    const board = await humanCaller(ownerId).board.create({
      workspaceId,
      title: 'Public API Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;

    // A second board (+ list + card) the key is NOT scoped to — for the
    // cross-board scope-guard test.
    const otherBoard = await humanCaller(ownerId).board.create({
      workspaceId,
      title: 'Other Board',
      clientMutationId: crypto.randomUUID(),
    });
    board2Id = otherBoard.id;
    const otherList = await humanCaller(ownerId).list.create({
      boardId: board2Id,
      title: 'Other List',
      clientMutationId: crypto.randomUUID(),
    });
    const otherCard = await humanCaller(ownerId).card.create({
      listId: otherList.id,
      title: 'Foreign Card',
      clientMutationId: crypto.randomUUID(),
    });
    board2CardId = otherCard.id;

    // Bot memberships: workspace `guest` (opens the door) + board role. All three
    // bots are members of `boardId` only.
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberBotId, role: 'guest' },
        { workspaceId, userId: viewerBotId, role: 'guest' },
        { workspaceId, userId: revokeBotId, role: 'guest' },
      ]);
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: memberBotId, role: 'member' },
        { boardId, userId: viewerBotId, role: 'viewer' },
        { boardId, userId: revokeBotId, role: 'member' },
      ]);

    memberToken = generateApiKeyToken();
    viewerToken = generateApiKeyToken();
    revokeToken = generateApiKeyToken();
    await db()
      .insert(apiKeys)
      .values([
        {
          id: memberKeyId,
          name: 'Member Bot',
          tokenHash: memberToken.hash,
          tokenPrefix: memberToken.prefix,
          botUserId: memberBotId,
          boardId,
          role: 'member',
          createdBy: ownerId,
        },
        {
          id: viewerKeyId,
          name: 'Viewer Bot',
          tokenHash: viewerToken.hash,
          tokenPrefix: viewerToken.prefix,
          botUserId: viewerBotId,
          boardId,
          role: 'viewer',
          createdBy: ownerId,
        },
        {
          id: revokeKeyId,
          name: 'Revoke Bot',
          tokenHash: revokeToken.hash,
          tokenPrefix: revokeToken.prefix,
          botUserId: revokeBotId,
          boardId,
          role: 'member',
          createdBy: ownerId,
        },
      ]);
  });

  afterAll(async () => {
    // Delete workspaces first (cascades boards → lists/cards/activity/api_keys +
    // board/workspace members), then the (now unreferenced) bot + human rows.
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of [ownerId, memberBotId, viewerBotId, revokeBotId]) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  beforeEach(() => {
    clearRateLimitBuckets(); // isolate the shared IP-limit buckets per test.
  });

  // -------------------------------------------------------------- lists + cards

  it('POST /lists → 201 and persists a list on the key board', async () => {
    const app = buildApp();
    const res = await app.request('/lists', {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ title: 'Backlog' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; title: string };
    expect(body.title).toBe('Backlog');

    const [row] = await db()
      .select({ boardId: lists.boardId })
      .from(lists)
      .where(dbMod.eq(lists.id, body.id))
      .limit(1);
    expect(row!.boardId).toBe(boardId);
  });

  it('POST /cards → 201; persists a card and an activity_event whose actor is the bot', async () => {
    const app = buildApp();
    const listId = await createListViaApi(app);
    const res = await app.request('/cards', {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ listId, title: 'Bot Task' }),
    });
    expect(res.status).toBe(201);
    const card = (await res.json()) as { id: string; boardId: string; listId: string };
    expect(card).toMatchObject({ boardId, listId });

    const [row] = await db()
      .select({ title: cards.title, boardId: cards.boardId })
      .from(cards)
      .where(dbMod.eq(cards.id, card.id))
      .limit(1);
    expect(row).toMatchObject({ title: 'Bot Task', boardId });

    // The mutation went through the SAME activity chain — actor is the bot user.
    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.cardId, card.id));
    const created = acts.find((a) => a.type === 'card.created');
    expect(created).toBeDefined();
    expect(created!.actorId).toBe(memberBotId);
  });

  it('POST /cards dedup: same Idempotency-Key + body → one card; second reply is Idempotency-Replayed', async () => {
    const app = buildApp({ idempotency: fakeIdempotencyStore() });
    const listId = await createListViaApi(app);
    const key = crypto.randomUUID();
    const headers = bearer(memberToken, {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    });
    const body = JSON.stringify({ listId, title: 'Dedup Card' });

    const first = await app.request('/cards', { method: 'POST', headers, body });
    expect(first.status).toBe(201);
    expect(first.headers.get('Idempotency-Replayed')).toBeNull();
    const firstCard = (await first.json()) as { id: string };

    const second = await app.request('/cards', { method: 'POST', headers, body });
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    const secondCard = (await second.json()) as { id: string };
    expect(secondCard.id).toBe(firstCard.id);

    // Exactly ONE card was actually written for that (list, title).
    const rows = await db()
      .select({ id: cards.id })
      .from(cards)
      .where(dbMod.and(dbMod.eq(cards.listId, listId), dbMod.eq(cards.title, 'Dedup Card')));
    expect(rows).toHaveLength(1);
  });

  it('POST /cards/:id/move (same-list reorder, fromListId=toListId) → 200 and the position changes', async () => {
    const app = buildApp();
    const listId = await createListViaApi(app);
    const cardA = await createCardViaApi(app, listId, 'Card A');
    const cardB = await createCardViaApi(app, listId, 'Card B');

    const [before] = await db()
      .select({ position: cards.position })
      .from(cards)
      .where(dbMod.eq(cards.id, cardA))
      .limit(1);

    // Place cardA immediately AFTER cardB (same list). `beforeCardId` is the
    // lower-position neighbour of the new slot, so cardB going there pushes cardA
    // to the end (`positionBetween(cardB.position, null)`).
    const res = await app.request(`/cards/${cardA}/move`, {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ fromListId: listId, toListId: listId, beforeCardId: cardB }),
    });
    expect(res.status).toBe(200);

    const [after] = await db()
      .select({ position: cards.position, listId: cards.listId })
      .from(cards)
      .where(dbMod.eq(cards.id, cardA))
      .limit(1);
    expect(after!.listId).toBe(listId);
    expect(after!.position).not.toBe(before!.position);
  });

  // ------------------------------------------------------------------- comments

  it('POST /cards/:id/comments (plain text) → stores JSON.stringify(Tiptap) and replies with previewText', async () => {
    const app = buildApp();
    const listId = await createListViaApi(app);
    const cardId = await createCardViaApi(app, listId, 'Comment Card');

    const res = await app.request(`/cards/${cardId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ body: 'Merhaba dünya' }),
    });
    // Route contract for POST comment is 201 (created).
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; body: string; previewText: string };

    const expectedStored = JSON.stringify(plainTextToTiptap('Merhaba dünya'));
    expect(json.body).toBe(expectedStored);
    expect(json.previewText).toBe('Merhaba dünya');
    expect(json.previewText).toBe(richTextPreview(expectedStored));

    const [row] = await db()
      .select({ body: comments.body, authorId: comments.authorId })
      .from(comments)
      .where(dbMod.eq(comments.id, json.id))
      .limit(1);
    expect(row!.body).toBe(expectedStored);
    expect(row!.authorId).toBe(memberBotId);
  });

  // ----------------------------------------------------------------- checklists

  it('checklist: create + item create (plain text) + toggle reflect in the DB', async () => {
    const app = buildApp();
    const listId = await createListViaApi(app);
    const cardId = await createCardViaApi(app, listId, 'Checklist Card');

    const clRes = await app.request(`/cards/${cardId}/checklists`, {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ title: 'Hazırlık' }),
    });
    expect(clRes.status).toBe(201);
    const checklistId = ((await clRes.json()) as { id: string }).id;
    const [clRow] = await db()
      .select({ title: checklists.title, cardId: checklists.cardId })
      .from(checklists)
      .where(dbMod.eq(checklists.id, checklistId))
      .limit(1);
    expect(clRow).toMatchObject({ title: 'Hazırlık', cardId });

    const itemRes = await app.request(`/cards/${cardId}/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ content: 'Alt görev' }),
    });
    expect(itemRes.status).toBe(201);
    const itemId = ((await itemRes.json()) as { id: string }).id;
    const [itemRow] = await db()
      .select({ content: checklistItems.content, completed: checklistItems.completed })
      .from(checklistItems)
      .where(dbMod.eq(checklistItems.id, itemId))
      .limit(1);
    expect(itemRow!.content).toBe(JSON.stringify(plainTextToTiptap('Alt görev')));
    expect(itemRow!.completed).toBe(false);

    const toggleRes = await app.request(
      `/cards/${cardId}/checklists/${checklistId}/items/${itemId}/toggle`,
      {
        method: 'POST',
        headers: jsonHeaders(memberToken),
        body: JSON.stringify({ completed: true }),
      },
    );
    expect(toggleRes.status).toBe(200);
    const [toggled] = await db()
      .select({
        completed: checklistItems.completed,
        completedBy: checklistItems.completedBy,
        completedAt: checklistItems.completedAt,
      })
      .from(checklistItems)
      .where(dbMod.eq(checklistItems.id, itemId))
      .limit(1);
    expect(toggled!.completed).toBe(true);
    expect(toggled!.completedBy).toBe(memberBotId);
    expect(toggled!.completedAt).not.toBeNull();
  });

  // ------------------------------------------------------------------ board read

  it('GET /board → 200 and shows a list + card the bot created; GET /board/members omits email', async () => {
    const app = buildApp();
    const listId = await createListViaApi(app, 'Visible List');
    const cardId = await createCardViaApi(app, listId, 'Visible Card');

    const boardRes = await app.request('/board', { headers: bearer(memberToken) });
    expect(boardRes.status).toBe(200);
    const board = (await boardRes.json()) as {
      lists: Array<{ id: string }>;
      cards: Array<{ id: string }>;
    };
    expect(board.lists.map((l) => l.id)).toContain(listId);
    expect(board.cards.map((cd) => cd.id)).toContain(cardId);

    const membersRes = await app.request('/board/members', { headers: bearer(memberToken) });
    expect(membersRes.status).toBe(200);
    const members = (await membersRes.json()) as Array<Record<string, unknown>>;
    expect(members.some((m) => m.userId === memberBotId)).toBe(true);
    for (const m of members) expect(m).not.toHaveProperty('email');
    // No stray e-mail (human or bot) survives anywhere in the serialized body.
    expect(JSON.stringify(members)).not.toContain('@example.test');
    expect(JSON.stringify(members)).not.toContain('@bots.pusula.internal');
  });

  // ------------------------------------------------------------- viewer key role

  it('viewer key: GET /board → 200 but POST /lists → 403 (member-only mutation)', async () => {
    const app = buildApp();
    const readRes = await app.request('/board', { headers: bearer(viewerToken) });
    expect(readRes.status).toBe(200);

    const writeRes = await app.request('/lists', {
      method: 'POST',
      headers: jsonHeaders(viewerToken),
      body: JSON.stringify({ title: 'Nope' }),
    });
    expect(writeRes.status).toBe(403);
    const errBody = (await writeRes.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe('FORBIDDEN');
  });

  // ------------------------------------------------------------------ revocation

  it('revoke: setting revoked_at + deleting the bot memberships makes the next request 401', async () => {
    const app = buildApp();
    // Sanity: the dedicated revoke key works before revocation.
    const before = await app.request('/board', { headers: bearer(revokeToken) });
    expect(before.status).toBe(200);

    // Simulate the real revoke path (Task 7): revoked_at stamped + the bot's
    // board + workspace membership rows deleted (SQL).
    await db().update(apiKeys).set({ revokedAt: new Date() }).where(dbMod.eq(apiKeys.id, revokeKeyId));
    await db()
      .delete(boardMembers)
      .where(dbMod.and(dbMod.eq(boardMembers.boardId, boardId), dbMod.eq(boardMembers.userId, revokeBotId)));
    await db()
      .delete(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, revokeBotId),
        ),
      );

    const after = await app.request('/board', { headers: bearer(revokeToken) });
    expect(after.status).toBe(401);
    const errBody = (await after.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe('UNAUTHORIZED');
  });

  // ------------------------------------------------------------- cross-board scope

  it('PATCH a card that belongs to a different board → 403 (scope guard); the foreign card is untouched', async () => {
    const app = buildApp();
    const res = await app.request(`/cards/${board2CardId}`, {
      method: 'PATCH',
      headers: jsonHeaders(memberToken),
      body: JSON.stringify({ title: 'Hijack' }),
    });
    expect(res.status).toBe(403);
    const errBody = (await res.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe('FORBIDDEN');

    const [row] = await db()
      .select({ title: cards.title })
      .from(cards)
      .where(dbMod.eq(cards.id, board2CardId))
      .limit(1);
    expect(row!.title).toBe('Foreign Card');
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
