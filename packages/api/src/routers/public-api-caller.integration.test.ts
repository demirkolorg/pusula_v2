/**
 * Public API + Bot Erişimi (Task 4 §5b) — bot caller end-to-end integration.
 *
 * `apps/api` `createPublicApiCaller` gerçek DB harness'ına sahip değil (o app'in
 * testleri `@pusula/db`'yi mock'lar). Bu yüzden buraya, gerçek Postgres'e bağlı
 * `board-api-keys.test.ts` düzenini izleyen TEK bir uçtan-uca dosya konur: bot
 * user + `workspace_members(guest)` + `board_members(member)` + `api_keys`
 * satırları seed edilir, sonra **bot SessionInfo'suyla** (`createPublicApiCaller`
 * ile birebir aynı şekil) `createContext` + caller kurulur ve `card.create`
 * çağrılır. Amaç: botun yaptığı mutasyonun normal kullanıcı mutasyonuyla AYNI
 * activity + realtime + notification zincirinden geçtiğini kanıtlamak.
 *
 *  - `activity_events.actor_id === botUserId`
 *  - `realtime_events` satırı (botun yazımı) oluşur
 *  - `notification_outbox` insan board üyesine (owner) yazılır; bota (actor)
 *    self-skip.
 *
 * Not (test stratejisi kararı): burada `createPublicApiCaller`'ın KENDİSİ
 * çağrılmaz (o apps/api'de, host bağımlılıklarını Hono context'inden türetir);
 * onun ürettiği bot `SessionInfo` şekliyle `createContext` + `createCallerFactory`
 * kurulumu doğrulanır — davranış birebir aynıdır.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  apiKeys,
  boardMembers,
  notificationOutbox,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext, type SessionInfo } from '../context';
import { generateApiKeyToken } from '../lib/api-key-token';

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

const ownerId = newId('u-pac-owner');
const botUserId = newId('u-pac-bot');
const apiKeyId = newId('key-pac');

/** Human session (workspace/board scaffolding). */
const humanSession = (id: string): SessionInfo => ({
  user: { id, email: emailOf(id), name: id },
});

/**
 * Bot session — identical shape to `createPublicApiCaller`'s
 * `buildPublicApiSession`: bot user + `api-key:<id>` synthetic session id.
 */
const botSession: SessionInfo = {
  user: { id: botUserId, email: `bot+${apiKeyId}@bots.pusula.internal`, name: 'Deploy Bot' },
  sessionId: `api-key:${apiKeyId}`,
};

function callerFor(session: SessionInfo) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session, db: probe.db }));
}

describe.runIf(dbAvailable)('public API bot caller (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    // Human owner + the bot service account.
    await db()
      .insert(users)
      .values([
        { id: ownerId, name: ownerId, email: emailOf(ownerId) },
        {
          id: botUserId,
          name: 'Deploy Bot',
          email: `bot+${apiKeyId}@bots.pusula.internal`,
          isBot: true,
        },
      ]);

    const ws = await callerFor(humanSession(ownerId)).workspace.create({
      name: 'Bot Caller Co',
      slug: newSlug('bot-caller-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);

    const board = await callerFor(humanSession(ownerId)).board.create({
      workspaceId,
      title: 'Bot Caller Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;

    const list = await callerFor(humanSession(ownerId)).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;

    // Seed the bot's memberships (create-flow's transaction, Task 7) directly:
    // workspace `guest` (opens the door) + board `member` + the api_keys row.
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId, userId: botUserId, role: 'guest' });
    await db().insert(boardMembers).values({ boardId, userId: botUserId, role: 'member' });

    const token = generateApiKeyToken();
    await db().insert(apiKeys).values({
      id: apiKeyId,
      name: 'Deploy Bot',
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      botUserId,
      boardId,
      role: 'member',
      createdBy: ownerId,
    });
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    // Bot + human user rows are now unreferenced (workspace cascade removed the
    // key + memberships).
    await db().delete(users).where(dbMod.eq(users.id, botUserId));
    await db().delete(users).where(dbMod.eq(users.id, ownerId));
  });

  it('card.create through the bot caller: activity actor is the bot; realtime + notification chain fires (owner notified, bot self-skipped)', async () => {
    const created = await callerFor(botSession).card.create({
      listId,
      title: 'Bot card',
      clientMutationId: crypto.randomUUID(),
    });
    expect(created).toMatchObject({ listId, boardId, title: 'Bot card' });

    // --- activity_events: the actor is the bot user -------------------------
    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.boardId, boardId));
    const cardCreated = acts.find(
      (a) =>
        a.type === 'card.created' &&
        (a.payload as { cardId?: string }).cardId === created.id,
    );
    expect(cardCreated).toBeDefined();
    expect(cardCreated!.actorId).toBe(botUserId);
    expect(cardCreated!.cardId).toBe(created.id);

    // --- realtime_events: an outbox row authored by the bot -----------------
    const rtRows = await db()
      .select()
      .from(realtimeEvents)
      .where(dbMod.eq(realtimeEvents.boardId, boardId));
    const rtCreated = rtRows.find(
      (r) => r.type === 'card.created' && r.actorId === botUserId,
    );
    expect(rtCreated).toBeDefined();

    // --- notification_outbox: human owner notified; bot (actor) self-skipped -
    const outbox = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, cardCreated!.id));
    const recipients = new Set(outbox.map((r) => r.recipientId));
    expect(recipients.has(ownerId)).toBe(true);
    expect(recipients.has(botUserId)).toBe(false);
    expect(outbox.every((r) => r.type === 'card_created')).toBe(true);
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
