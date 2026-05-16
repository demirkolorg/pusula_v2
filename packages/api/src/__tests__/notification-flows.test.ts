/**
 * DEM-94 notification flow integration tests.
 *
 * These hit a real Postgres (`DATABASE_URL`, via `pnpm infra:up` +
 * `pnpm db:migrate`) and exercise API router mutations end-to-end through
 * `activity_events` + `notification_outbox`. Channel processors live in
 * `apps/worker`; this suite verifies the API side writes the rows those
 * processors consume and enqueues the publish job after commit.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  boards,
  cardMembers,
  cards,
  lists,
  notificationOutbox,
  notificationPreferences,
  notifications,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createContext, type EnqueueNotificationPublish } from '../context';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

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

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

function session(id: string, name: string) {
  return { user: { id, email: `${id}@example.test`, name } };
}

function callerFor(user: { id: string; name: string }, enqueue?: EnqueueNotificationPublish) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: session(user.id, user.name),
      db: probe.db,
      enqueueNotificationPublish: enqueue,
    }),
  );
}

async function seedFixture(opts: { extraCards?: number } = {}) {
  if (!probe) throw new Error('db not initialised');
  const db = probe.db;
  const alice = { id: newId('u-nf-alice'), name: 'alice' };
  const bob = { id: newId('u-nf-bob'), name: 'bob' };
  createdUserIds.push(alice.id, bob.id);

  const workspaceId = newId('ws-nf');
  const boardId = newId('b-nf');
  const listId = newId('l-nf');
  const cardId = newId('c-nf');
  createdWorkspaceIds.push(workspaceId);

  await db.insert(users).values([
    { id: alice.id, name: alice.name, email: `${alice.id}@example.test`, emailVerified: true },
    { id: bob.id, name: bob.name, email: `${bob.id}@example.test`, emailVerified: true },
  ]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Notification Flow Workspace',
    slug: newSlug('notification-flow'),
    ownerId: alice.id,
  });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: alice.id, role: 'owner' },
    { workspaceId, userId: bob.id, role: 'member' },
  ]);
  await db.insert(boards).values({ id: boardId, workspaceId, title: 'Notification Flow Board' });
  await db.insert(boardMembers).values([
    { boardId, userId: alice.id, role: 'admin' },
    { boardId, userId: bob.id, role: 'member' },
  ]);
  await db.insert(lists).values({ id: listId, boardId, title: 'Backlog', position: 'a0' });
  await db.insert(cards).values({
    id: cardId,
    boardId,
    listId,
    title: 'Notification card',
    position: 'a0',
  });

  const extraCards: Array<{ id: string; title: string }> = [];
  for (let i = 0; i < (opts.extraCards ?? 0); i++) {
    const id = newId('c-nf-extra');
    const title = `Notification card ${i + 2}`;
    await db.insert(cards).values({
      id,
      boardId,
      listId,
      title,
      position: `a${i + 1}`,
    });
    extraCards.push({ id, title });
  }

  return {
    alice,
    bob,
    workspace: { id: workspaceId },
    board: { id: boardId, workspaceId },
    list: { id: listId },
    card: { id: cardId, title: 'Notification card' },
    extraCards,
  };
}

async function activityFor(
  fixture: Fixture,
  type: string,
  payloadKey: string,
  payloadValue: string,
) {
  const rows = await probe!.db
    .select()
    .from(activityEvents)
    .where(dbMod.eq(activityEvents.boardId, fixture.board.id));
  return rows.find(
    (row) =>
      row.type === type && (row.payload as Record<string, unknown>)[payloadKey] === payloadValue,
  );
}

async function outboxFor(recipientId: string, type: string) {
  return probe!.db
    .select({
      id: notificationOutbox.id,
      eventId: notificationOutbox.eventId,
      channel: notificationOutbox.channel,
      type: notificationOutbox.type,
      payload: notificationOutbox.payload,
      processedAt: notificationOutbox.processedAt,
    })
    .from(notificationOutbox)
    .where(
      dbMod.and(
        dbMod.eq(notificationOutbox.recipientId, recipientId),
        dbMod.eq(notificationOutbox.type, type as typeof notificationOutbox.$inferSelect.type),
      ),
    );
}

describe.runIf(dbAvailable)('notification flows (integration)', () => {
  beforeEach(async () => {
    if (!probe) return;
    await probe.db
      .delete(notifications)
      .where(dbMod.inArray(notifications.recipientId, createdUserIds));
    await probe.db
      .delete(notificationOutbox)
      .where(dbMod.inArray(notificationOutbox.recipientId, createdUserIds));
    await probe.db
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    for (const workspaceId of [...createdWorkspaceIds].reverse()) {
      await probe.db.delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    }
    if (createdUserIds.length > 0) {
      await probe.db.delete(users).where(dbMod.inArray(users.id, createdUserIds));
    }
    await probe.pool.end();
  });

  it('assignment flow: card.members.add writes activity, outbox rows, and publish enqueue', async () => {
    const fx = await seedFixture();
    const enqueued: string[] = [];
    await callerFor(fx.alice, async ({ eventId }) => {
      enqueued.push(eventId);
    }).card.members.add({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    const activity = await activityFor(fx, 'card.member_added', 'userId', fx.bob.id);
    expect(activity?.payload).toMatchObject({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'assignee',
    });

    const outbox = await outboxFor(fx.bob.id, 'card_assigned');
    expect(outbox.map((row) => row.channel).sort()).toEqual(['email', 'in_app', 'push']);
    expect(outbox.map((row) => row.eventId)).toEqual(outbox.map(() => activity!.id));
    expect(outbox.every((row) => row.processedAt == null)).toBe(true);
    expect(outbox[0]?.payload).toMatchObject({
      activityType: 'card.member_added',
      notificationType: 'card_assigned',
      actorName: 'alice',
      cardTitle: fx.card.title,
      cardId: fx.card.id,
      boardId: fx.board.id,
      workspaceId: fx.workspace.id,
    });
    expect(enqueued).toEqual([activity!.id]);
  });

  it('mention flow: comment.create writes comment.mentioned outbox despite mute-all preference', async () => {
    const fx = await seedFixture();
    const enqueued: string[] = [];
    await probe!.db.insert(notificationPreferences).values({
      userId: fx.bob.id,
      muteLevel: 'all',
    });

    await callerFor(fx.alice, async ({ eventId }) => {
      enqueued.push(eventId);
    }).comment.create({
      cardId: fx.card.id,
      body: '@bob please review this',
      clientMutationId: crypto.randomUUID(),
    });

    const mentionActivity = await activityFor(
      fx,
      'comment.mentioned',
      'mentionedUserId',
      fx.bob.id,
    );
    expect(mentionActivity?.payload).toMatchObject({
      mentionedUserId: fx.bob.id,
      mentionText: 'bob',
    });

    const outbox = await outboxFor(fx.bob.id, 'mention');
    expect(outbox.map((row) => row.channel).sort()).toEqual(['email', 'in_app', 'push']);
    expect(outbox.every((row) => row.eventId === mentionActivity!.id)).toBe(true);
    expect(outbox[0]?.payload).toMatchObject({
      actorName: 'alice',
      cardTitle: fx.card.title,
      mentionText: 'bob',
    });
    expect(enqueued).toContain(mentionActivity!.id);
  });

  it('watcher comment flow: card watcher receives comment_reply outbox rows', async () => {
    const fx = await seedFixture();
    await probe!.db.insert(cardMembers).values({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'watcher',
    });

    await callerFor(fx.alice).comment.create({
      cardId: fx.card.id,
      body: 'Plain watcher comment',
      clientMutationId: crypto.randomUUID(),
    });

    const commentActivity = await activityFor(fx, 'comment.created', 'cardId', fx.card.id);
    expect(commentActivity).toBeDefined();

    const outbox = await outboxFor(fx.bob.id, 'comment_reply');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      eventId: commentActivity!.id,
      channel: 'in_app',
      type: 'comment_reply',
    });
  });

  it('cooldown: two assignment activities in the 60s window collapse to the first notification set', async () => {
    const fx = await seedFixture({ extraCards: 1 });

    await callerFor(fx.alice).card.members.add({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(fx.alice).card.members.add({
      cardId: fx.extraCards[0]!.id,
      userId: fx.bob.id,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    const outbox = await outboxFor(fx.bob.id, 'card_assigned');
    expect(outbox.map((row) => row.channel).sort()).toEqual(['email', 'in_app', 'push']);
    expect(new Set(outbox.map((row) => row.eventId)).size).toBe(1);
    expect(outbox[0]?.payload).toMatchObject({ cardId: fx.card.id });

    const activityRows = await probe!.db
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.boardId, fx.board.id));
    expect(activityRows.filter((row) => row.type === 'card.member_added')).toHaveLength(2);
  });

  // Faz 6 review fix (W1 DEM-94): spec'te söz verilmiş ama 1dfee5a'da
  // atlanmış olan due-date + permission rejection + cooldown-elapsed
  // senaryoları. Hepsi DB integration; `runIf(dbAvailable)` zaten dışta.

  it('due-date flow: card.update sets dueAt → card.due_set activity → card_due_changed outbox for card watchers', async () => {
    const fx = await seedFixture();

    // Bob kart üzerinde watcher olsun (assignee değil — card-aktivite
    // notification'ı tüm watcher'lara fan-out eder).
    await probe!.db.insert(cardMembers).values({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'watcher',
    });

    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 gün
    await callerFor(fx.alice).card.update({
      cardId: fx.card.id,
      dueAt,
      clientMutationId: crypto.randomUUID(),
    });

    const activity = await activityFor(fx, 'card.due_set', 'cardId', fx.card.id);
    expect(activity).toBeDefined();

    // Watcher Bob'a in_app outbox satırı bekleniyor. DEM-152 — `card.due_set`
    // artık granular `card_due_changed` tipine yönlenir (eski `watched_activity`
    // çöp kovası bölündü).
    const outbox = await outboxFor(fx.bob.id, 'card_due_changed');
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0]).toMatchObject({ channel: 'in_app', type: 'card_due_changed' });
  });

  it('permission rejection: workspace guest with no board access does NOT receive a notification', async () => {
    const fx = await seedFixture();
    // Charlie: workspace `guest` rolü, board_members'de YOK → effective board
    // erişimi `null`. notification-rules permission gate'i bu kullanıcıya
    // notification yazılmasını engellemeli.
    const charlie = { id: newId('u-nf-charlie'), name: 'charlie' };
    createdUserIds.push(charlie.id);
    await probe!.db.insert(users).values({
      id: charlie.id,
      name: charlie.name,
      email: `${charlie.id}@example.test`,
      emailVerified: true,
    });
    await probe!.db.insert(workspaceMembers).values({
      workspaceId: fx.workspace.id,
      userId: charlie.id,
      role: 'guest',
    });

    // Charlie'ye kart ataması yapılır — yetki yoksa outbox satırı oluşmamalı.
    // (Alice bu mutation'ı yapabilmek için admin; bob işin dışında.)
    try {
      await callerFor(fx.alice).card.members.add({
        cardId: fx.card.id,
        userId: charlie.id,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      });
    } catch {
      // Server-side permission/validation reddedebilir — fix budur. Reddedilirse
      // outbox da yazılmamış olur; iki yön de testin "Charlie outbox boş"
      // assertion'ını destekler.
    }

    const charlieOutbox = await outboxFor(charlie.id, 'card_assigned');
    expect(charlieOutbox).toHaveLength(0);
  });

  it('cooldown elapsed: a second assignment activity after 60s writes a fresh notification set', async () => {
    const fx = await seedFixture({ extraCards: 1 });

    await callerFor(fx.alice).card.members.add({
      cardId: fx.card.id,
      userId: fx.bob.id,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    // İlk outbox satırlarını 70 saniye geriye al — 60s cooldown window
    // bitmiş kabul edilsin. (Gerçek 70s bekleme yerine time-travel.)
    await probe!.db
      .update(notificationOutbox)
      .set({ createdAt: new Date(Date.now() - 70 * 1000) })
      .where(dbMod.eq(notificationOutbox.recipientId, fx.bob.id));

    await callerFor(fx.alice).card.members.add({
      cardId: fx.extraCards[0]!.id,
      userId: fx.bob.id,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    const outbox = await outboxFor(fx.bob.id, 'card_assigned');
    // İki ayrı event (cooldown geçti) → her event için kanal başına ayrı
    // satır. Cooldown window içinde olsaydı sadece birinci event'in satırları
    // kalırdı.
    expect(new Set(outbox.map((row) => row.eventId)).size).toBe(2);
  });
});
