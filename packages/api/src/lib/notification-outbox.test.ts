/**
 * Integration tests for the notification outbox helper (Faz 6A / DEM-90).
 * Covers the 60 s cooldown pre-check + per-channel fan-out + bypass list.
 * Like the rule-engine tests, runs against a real Postgres (probe → skip on
 * a box without infra).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  cardMembers,
  notificationOutbox,
  notificationPreferences,
  users,
  workspaceMembers,
} from '@pusula/db';
import { insertNotificationOutbox, dispatchNotificationsForActivity } from './notification-outbox';
import type { NotificationRule } from './notification-rules';
import type { ActivityEventForRules } from './notification-rules';

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

describe.runIf(dbAvailable)('notification-outbox (integration)', () => {
  const db = () => probe!.db;

  const actorId = newId('u-no-actor');
  const recipientId = newId('u-no-recipient');
  const createdUserIds = [actorId, recipientId];

  let workspaceId: string;
  let boardId: string;
  let cardId: string;
  let activityId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    workspaceId = newId('ws-no');
    boardId = newId('b-no');
    const listId = newId('l-no');
    cardId = newId('c-no');
    await db().insert(dbMod.workspaces).values({
      id: workspaceId,
      name: 'No Outbox WS',
      slug: workspaceId,
      ownerId: actorId,
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: actorId, role: 'owner' },
        { workspaceId, userId: recipientId, role: 'member' },
      ]);
    await db().insert(dbMod.boards).values({ id: boardId, workspaceId, title: 'NO Board' });
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: actorId, role: 'admin' },
        { boardId, userId: recipientId, role: 'member' },
      ]);
    await db().insert(dbMod.lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    await db()
      .insert(dbMod.cards)
      .values({ id: cardId, boardId, listId, title: 'C', position: 'a0' });

    // Persist one activity row to use as `event_id` — `notification_outbox`
    // FKs to `activity_events.id` (`set null` on delete).
    const [row] = await db()
      .insert(activityEvents)
      .values({
        workspaceId,
        boardId,
        cardId,
        actorId,
        type: 'card.member_added',
        payload: { cardId, userId: recipientId, role: 'assignee' },
      })
      .returning({ id: activityEvents.id });
    activityId = row!.id;
  });

  afterAll(async () => {
    if (!probe) return;
    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db().delete(activityEvents).where(dbMod.eq(activityEvents.id, activityId));
    await db().delete(cardMembers).where(dbMod.eq(cardMembers.cardId, cardId));
    await db().delete(dbMod.cards).where(dbMod.eq(dbMod.cards.id, cardId));
    await db().delete(dbMod.lists).where(dbMod.eq(dbMod.lists.boardId, boardId));
    await db().delete(dbMod.boards).where(dbMod.eq(dbMod.boards.id, boardId));
    await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  function rule(overrides: Partial<NotificationRule> = {}): NotificationRule {
    return {
      recipientUserId: recipientId,
      type: 'card_assigned',
      channel: 'in_app',
      payload: { activityType: 'card.member_added', notificationType: 'card_assigned' },
      ...overrides,
    };
  }

  it('insertNotificationOutbox: a second activity event same (recipient, type) ALSO inserts (cooldown removed 2026-06-03)', async () => {
    // Cooldown removed: two distinct activity events each produce their own
    // notification — no `(recipient, type)` collapse. The user wants every
    // event surfaced.
    const [secondActivity] = await db()
      .insert(activityEvents)
      .values({
        workspaceId,
        boardId,
        cardId,
        actorId,
        type: 'card.member_added',
        payload: { cardId, userId: recipientId, role: 'assignee' },
      })
      .returning({ id: activityEvents.id });
    const secondId = secondActivity!.id;
    try {
      const first = await insertNotificationOutbox(db(), { rule: rule(), eventId: activityId });
      expect(first.inserted).toBe(true);

      const dup = await insertNotificationOutbox(db(), { rule: rule(), eventId: secondId });
      expect(dup.inserted).toBe(true);
    } finally {
      await db()
        .delete(notificationOutbox)
        .where(
          dbMod.and(
            dbMod.eq(notificationOutbox.recipientId, recipientId),
            dbMod.eq(notificationOutbox.type, 'card_assigned'),
          ),
        );
      await db().delete(activityEvents).where(dbMod.eq(activityEvents.id, secondId));
    }
  });

  it('bypass list: `mention` skips the cooldown (two rows in the same window)', async () => {
    const a = await insertNotificationOutbox(db(), {
      rule: rule({ type: 'mention' }),
      eventId: activityId,
    });
    const b = await insertNotificationOutbox(db(), {
      rule: rule({ type: 'mention' }),
      eventId: activityId,
    });
    expect(a.inserted).toBe(true);
    expect(b.inserted).toBe(true);

    await db()
      .delete(notificationOutbox)
      .where(
        dbMod.and(
          dbMod.eq(notificationOutbox.recipientId, recipientId),
          dbMod.eq(notificationOutbox.type, 'mention'),
        ),
      );
  });

  it('dispatchNotificationsForActivity: routes the rule engine + inserts per channel', async () => {
    // Stale rows from earlier failed runs occasionally linger when Vitest is
    // killed mid-suite. Start clean.
    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.eventId, activityId));

    // Add the recipient as an assignee via the activity payload — the rule
    // engine reads `card_members` for watcher branches but for
    // `card.member_added` it pulls the target from `payload.userId`.
    const event: ActivityEventForRules = {
      id: activityId,
      type: 'card.member_added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, userId: recipientId, role: 'assignee' },
    };
    const result = await dispatchNotificationsForActivity(db(), event);
    // card_assigned → in_app + email + push (default channels for the
    // heavy-touch type). All three count as inserted on the first run.
    expect(result.inserted).toBe(3);

    const rows = await db()
      .select({ channel: notificationOutbox.channel, type: notificationOutbox.type })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app', 'push']);
    expect(rows.every((r) => r.type === 'card_assigned')).toBe(true);

    await db().delete(notificationOutbox).where(dbMod.eq(notificationOutbox.eventId, activityId));
  });

  // ─── Faz 10G (DEM-141) — email digest tercih davranışı ──────────────

  it("emailMode='off' (global) → email channel rule skipped, in_app/push still go through", async () => {
    // Stale outbox + preferences temizliği.
    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));

    // Recipient için global tercih: email kapalı (`off`).
    await db().insert(notificationPreferences).values({
      userId: recipientId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'off',
    });

    // Fan-out: card_assigned → in_app + email + push. Email satırı insert
    // edilmez; iki satır eklenir (in_app + push).
    const event: ActivityEventForRules = {
      id: activityId,
      type: 'card.member_added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, userId: recipientId, role: 'assignee' },
    };
    const result = await dispatchNotificationsForActivity(db(), event);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(1);

    const rows = await db()
      .select({ channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    expect(rows.map((r) => r.channel).sort()).toEqual(['in_app', 'push']);

    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));
  });

  it("emailMode='hourly_digest' → email row inserts with status='digest_queued'", async () => {
    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));

    await db().insert(notificationPreferences).values({
      userId: recipientId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'hourly_digest',
    });

    const event: ActivityEventForRules = {
      id: activityId,
      type: 'card.member_added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, userId: recipientId, role: 'assignee' },
    };
    const result = await dispatchNotificationsForActivity(db(), event);
    expect(result.inserted).toBe(3);

    const emailRows = await db()
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(
        dbMod.and(
          dbMod.eq(notificationOutbox.eventId, activityId),
          dbMod.eq(notificationOutbox.channel, 'email'),
        ),
      );
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0]!.status).toBe('digest_queued');

    // in_app + push satırları normal pending.
    const otherRows = await db()
      .select({ channel: notificationOutbox.channel, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(
        dbMod.and(
          dbMod.eq(notificationOutbox.eventId, activityId),
          dbMod.ne(notificationOutbox.channel, 'email'),
        ),
      );
    expect(otherRows.every((r) => r.status === 'pending')).toBe(true);

    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, activityId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));
  });

  it("emailMode='daily_digest' + mention bypass → mention email STAYS 'pending' (digest-bypass)", async () => {
    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, recipientId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));

    await db().insert(notificationPreferences).values({
      userId: recipientId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'daily_digest',
    });

    // Mention type — DIGEST_BYPASS set'inde, digest mod'da bile anlık
    // pending kalmalı.
    const outcome = await insertNotificationOutbox(db(), {
      rule: rule({ type: 'mention', channel: 'email' }),
      eventId: activityId,
    });
    expect(outcome.inserted).toBe(true);
    if (outcome.inserted) {
      expect(outcome.status).toBe('pending');
    }

    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, recipientId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));
  });

  it('no preference row → emailMode defaults to instant → email row pending (mevcut davranış korunur)', async () => {
    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, recipientId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.userId, recipientId));

    const outcome = await insertNotificationOutbox(db(), {
      rule: rule({ type: 'card_assigned', channel: 'email' }),
      eventId: activityId,
    });
    expect(outcome.inserted).toBe(true);
    if (outcome.inserted) {
      expect(outcome.status).toBe('pending');
    }

    await db()
      .delete(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.recipientId, recipientId));
  });
});
