/**
 * Integration tests for the notification rule engine (Faz 6A / DEM-90). The
 * engine reads `card_members`, `workspace_members`, `board_members`, and
 * `notification_preferences`, so it's exercised against a real Postgres (the
 * same probe pattern the rest of `packages/api` uses — no DB → skip rather
 * than fail on a box without infra).
 *
 * What we lock in:
 *  - `card.member_added` → the assignee, in-app + email (default channels).
 *  - `comment.created` → every card member except the actor (in-app only by
 *    default; comment_reply is not push-eligible).
 *  - Actor self-skip: the user who fired the event never gets a row.
 *  - Permission gate: a workspace guest with no explicit board seat is filtered.
 *  - Mute level "all" → no rows (except mute-bypass types — none of the
 *    Phase 6A activity types bypass; `mention`/invitation rules land in 6C/6B).
 *  - Channel hierarchy: a board-scope preference overrides the workspace one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  cardMembers,
  notificationPreferences,
  users,
  workspaceMembers,
} from '@pusula/db';
import { computeNotifications, type ActivityEventForRules } from './notification-rules';

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

describe.runIf(dbAvailable)('notification-rules (integration)', () => {
  const db = () => probe!.db;

  // Cast of users: actor (who fires events); assignee (gets card_assigned);
  // watcher (gets comment_reply, watched_activity); guest without a board
  // seat (filtered by the permission gate); a non-member outsider.
  const actorId = newId('u-nr-actor');
  const assigneeId = newId('u-nr-assignee');
  const watcherId = newId('u-nr-watcher');
  const guestNoSeatId = newId('u-nr-guestnoboard');
  const outsiderId = newId('u-nr-outsider');
  const createdUserIds = [actorId, assigneeId, watcherId, guestNoSeatId, outsiderId];

  let workspaceId: string;
  let boardId: string;
  let cardId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    // Workspace + board + list + card via direct inserts to keep the test free
    // of the wider router surface. Domain invariants we care about: workspace
    // membership rows, an explicit board_members row for the assignee/watcher
    // so the permission gate accepts them, and a guest *without* a seat.
    workspaceId = newId('ws-nr');
    boardId = newId('b-nr');
    const listId = newId('l-nr');
    cardId = newId('c-nr');
    await db().insert(dbMod.workspaces).values({
      id: workspaceId,
      name: 'NR Workspace',
      slug: workspaceId,
      ownerId: actorId,
    });
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: actorId, role: 'owner' },
        { workspaceId, userId: assigneeId, role: 'member' },
        { workspaceId, userId: watcherId, role: 'member' },
        { workspaceId, userId: guestNoSeatId, role: 'guest' },
      ]);
    await db().insert(dbMod.boards).values({
      id: boardId,
      workspaceId,
      title: 'NR Board',
    });
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: actorId, role: 'admin' },
        // assignee + watcher get explicit seats; the guest deliberately doesn't.
        { boardId, userId: assigneeId, role: 'member' },
        { boardId, userId: watcherId, role: 'member' },
      ]);
    await db().insert(dbMod.lists).values({
      id: listId,
      boardId,
      title: 'NR List',
      position: 'a0',
    });
    await db().insert(dbMod.cards).values({
      id: cardId,
      boardId,
      listId,
      title: 'NR Card',
      position: 'a0',
    });
    await db()
      .insert(cardMembers)
      .values([
        { cardId, userId: watcherId, role: 'watcher' },
        // assignee is added in tests via `card.member_added` payload, not as a
        // pre-existing seat — the rule reads payload.userId for that branch.
      ]);
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.boardId, boardId));
    await db()
      .delete(notificationPreferences)
      .where(dbMod.eq(notificationPreferences.workspaceId, workspaceId));
    await db().delete(dbMod.cards).where(dbMod.eq(dbMod.cards.id, cardId));
    await db().delete(dbMod.lists).where(dbMod.eq(dbMod.lists.boardId, boardId));
    await db().delete(dbMod.boards).where(dbMod.eq(dbMod.boards.id, boardId));
    await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
    await probe.pool.end();
  });

  function memberAddedEvent(targetUserId: string): ActivityEventForRules {
    return {
      id: newId('ae-mr'),
      type: 'card.member_added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, userId: targetUserId, role: 'assignee' },
    };
  }

  it('card.member_added → assignee gets in_app + email + push; actor self-skipped', async () => {
    const rules = await computeNotifications(db(), memberAddedEvent(assigneeId));
    const channels = rules
      .filter((r) => r.recipientUserId === assigneeId)
      .map((r) => r.channel)
      .sort();
    expect(channels).toEqual(['email', 'in_app', 'push']);
    // Actor never appears in the recipient list.
    expect(rules.some((r) => r.recipientUserId === actorId)).toBe(false);
    expect(rules.every((r) => r.type === 'card_assigned')).toBe(true);
  });

  it('card.member_added with no-seat guest as target → no rows (permission gate)', async () => {
    const rules = await computeNotifications(db(), memberAddedEvent(guestNoSeatId));
    expect(rules).toEqual([]);
  });

  it('comment.created → board audience gets in_app + push, comment_reply type, actor skipped (2026-06-03 board-audience pool + 2026-06-01 push expansion)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-cc'),
      type: 'comment.created',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { commentId: newId('cm'), cardId },
    };
    const rules = await computeNotifications(db(), event);
    // 2026-06-03 board-audience: kart aktivitesi artık board'daki herkese gider
    // (non-guest workspace members ∪ explicit board members), kart üyeliğine
    // bakılmaz. assignee kart üyesi DEĞİL ama board üyesi → o da alır.
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'comment_reply')).toBe(true);
    // 2026-06-01 push expansion — `pickChannels` push default opt-out;
    // `comment_reply` artık in_app + push (önceki: yalnız in_app). Her alıcı
    // için bir in_app + bir push satırı üretilir.
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
    expect(rules.filter((r) => r.recipientUserId === assigneeId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('attachment.added → board audience gets attachment_added, in_app + push (DEM-152 + 2026-06-03 board-audience pool)', async () => {
    // Board-audience fan-out + push opt-in default. Email kanali yok
    // (brief: channels=['in_app','push']). DEM-152 — `watched_activity` çöp
    // kovası granular `attachment_added` tipine bölündü; kanal davranışı aynı.
    // 2026-06-03 — pool kart watcher'dan board audience'a genişledi.
    const event: ActivityEventForRules = {
      id: newId('ae-att-added'),
      type: 'attachment.added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: {
        attachmentId: newId('att'),
        fileName: 'rapor.pdf',
        mimeType: 'application/pdf',
        size: 12345,
        hasDescription: false,
      },
    };
    const rules = await computeNotifications(db(), event);
    // Board audience: assignee + watcher (actor self-skipped, guest/outsider filtered).
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'attachment_added')).toBe(true);
    const channels = rules
      .filter((r) => r.recipientUserId === watcherId)
      .map((r) => r.channel)
      .sort();
    // in_app + push (push push-by-type listesinde; email yok)
    expect(channels).toEqual(['in_app', 'push']);
    // Payload whitelist: attachmentId + fileName notification payload'una geçer.
    const watcherRule = rules.find((r) => r.recipientUserId === watcherId && r.channel === 'in_app');
    expect(watcherRule?.payload).toMatchObject({
      activityType: 'attachment.added',
      notificationType: 'attachment_added',
      attachmentId: expect.any(String),
      fileName: 'rapor.pdf',
    });
  });

  it('attachment.removed → board audience gets attachment_removed (DEM-153 + 2026-06-03 board-audience pool)', async () => {
    // DEM-153 — `attachment.removed` artık bildirim üretir (eskiden
    // `mapEventToNotificationType` null dönüyordu). 2026-06-03 — board audience pool.
    const event: ActivityEventForRules = {
      id: newId('ae-att-removed'),
      type: 'attachment.removed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { attachmentId: newId('att'), fileName: 'rapor.pdf' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'attachment_removed')).toBe(true);
    // 2026-06-01 push expansion — granular tipler default in_app + push (her alıcı için).
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('card.renamed → board audience gets card_renamed in_app + push (DEM-153 + 2026-06-03 board-audience pool)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-renamed'),
      type: 'card.renamed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, fromTitle: 'Eski', toTitle: 'Yeni' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_renamed')).toBe(true);
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('checklist.item_added → board audience gets checklist_item_added in_app + push (DEM-153 + 2026-06-03 board-audience pool)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-cli-added'),
      type: 'checklist.item_added',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { checklistId: newId('cl'), itemId: newId('ci'), cardId },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'checklist_item_added')).toBe(true);
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('checklist.item_unchecked → maps to checklist_item_completed (DEM-153 + 2026-06-01 push expansion)', async () => {
    // DEM-153 — `checklist.item_unchecked` yeni tip açmaz; `card.completed`/
    // `uncompleted` → `card_completed` paterniyle aynı şekilde mevcut
    // `checklist_item_completed` tipine bağlanır (`activityType` ayırır).
    const event: ActivityEventForRules = {
      id: newId('ae-cli-unchecked'),
      type: 'checklist.item_unchecked',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { checklistId: newId('cl'), itemId: newId('ci'), cardId },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'checklist_item_completed')).toBe(true);
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('card.cover_image_changed → board audience gets card_cover_changed in_app + push (2026-06-03 board-audience pool)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-cover-image'),
      type: 'card.cover_image_changed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, attachmentId: newId('att') },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_cover_changed')).toBe(true);
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('mute_level=all on a board-scope preference → no rows for muted users', async () => {
    // 2026-06-03 board-audience: comment.created artık board audience'a gider
    // (assignee + watcher). mute_level=all davranışını izole etmek için her iki
    // alıcıya da board-scope mute uygulanır → hiç satır üretilmemeli.
    await db()
      .insert(notificationPreferences)
      .values([
        { userId: watcherId, boardId, muteLevel: 'all' },
        { userId: assigneeId, boardId, muteLevel: 'all' },
      ]);
    try {
      const event: ActivityEventForRules = {
        id: newId('ae-mute'),
        type: 'comment.created',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { commentId: newId('cm'), cardId },
      };
      const rules = await computeNotifications(db(), event);
      expect(rules).toEqual([]);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.inArray(notificationPreferences.userId, [watcherId, assigneeId]),
            dbMod.eq(notificationPreferences.boardId, boardId),
          ),
        );
    }
  });

  it('email_enabled=false on workspace-scope → email channel dropped, in_app + push stay', async () => {
    await db().insert(notificationPreferences).values({
      userId: assigneeId,
      workspaceId,
      emailEnabled: false,
    });
    try {
      const rules = await computeNotifications(db(), memberAddedEvent(assigneeId));
      const channels = rules.map((r) => r.channel).sort();
      expect(channels).toEqual(['in_app', 'push']);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.eq(notificationPreferences.userId, assigneeId),
            dbMod.eq(notificationPreferences.workspaceId, workspaceId),
          ),
        );
    }
  });

  it('unknown activity type → no rows', async () => {
    const event: ActivityEventForRules = {
      // `workspace.created` is a real activity type but deliberately NOT in the
      // notification map (`mapEventToNotificationType` returns null) — it has no
      // board audience semantics. (Eski stand-in `card.created` 2026-06-03 Faz 2
      // ile artık `card_created` tipine eşlendiği için kullanılamaz.)
      id: newId('ae-x'),
      type: 'workspace.created',
      workspaceId,
      boardId,
      cardId: null,
      actorId,
      payload: {},
    };
    const rules = await computeNotifications(db(), event);
    expect(rules).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Faz 10A (DEM-135) — dispatch açıkları kapatma turu.
  // ─────────────────────────────────────────────────────────────────────

  it('card.cover_changed → board audience gets card_cover_changed (Faz 10A / DEM-152 + 2026-06-03 board-audience pool)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-cover'),
      type: 'card.cover_changed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, coverColor: 'red' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_cover_changed')).toBe(true);
    expect(rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort()).toEqual(
      ['in_app', 'push'],
    );
  });

  it('card.member_removed → removed user (no card seat) still receives in_app + push (Faz 10A perm-filter exception + 2026-06-01 push expansion)', async () => {
    // Bu sahnede `guestNoSeatId` karta üye değil — `card_members`'ta hiç
    // bulunmadığı için recipient havuzuna `payload.removedUserId` üzerinden
    // doğrudan girer. Permission filter normalde guest'i atardı; 10A bu
    // tip için filter'ı atlatıyor.
    const event: ActivityEventForRules = {
      id: newId('ae-card-removed'),
      type: 'card.member_removed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, removedUserId: guestNoSeatId, role: 'assignee' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))]).toEqual([guestNoSeatId]);
    expect(rules.every((r) => r.type === 'card_member_removed')).toBe(true);
    expect(rules.map((r) => r.channel).sort()).toEqual(['in_app', 'push']);
  });

  it('board.member_removed → removed user (no board membership) still receives email + in_app + push (Faz 10A + 2026-06-01 push expansion)', async () => {
    // `outsiderId` board'a hiç üye olmadı — normal akış permission filter
    // ile düşürürdü. 10A `member_removed` için filter atlanıyor.
    const event: ActivityEventForRules = {
      id: newId('ae-board-removed'),
      type: 'board.member_removed',
      workspaceId,
      boardId,
      cardId: null,
      actorId,
      payload: { removedUserId: outsiderId, removedRole: 'member' },
    };
    const rules = await computeNotifications(db(), event);
    const channels = rules
      .filter((r) => r.recipientUserId === outsiderId)
      .map((r) => r.channel)
      .sort();
    // 2026-06-01 push expansion — `member_removed` artık push'a da gider.
    expect(channels).toEqual(['email', 'in_app', 'push']);
    expect(rules.every((r) => r.type === 'member_removed')).toBe(true);
  });

  it('workspace.member_removed → removed user receives email + in_app + push (no boardId, Faz 10A + 2026-06-01 push expansion)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-ws-removed'),
      type: 'workspace.member_removed',
      workspaceId,
      boardId: null,
      cardId: null,
      actorId,
      payload: { removedUserId: outsiderId, removedRole: 'member' },
    };
    const rules = await computeNotifications(db(), event);
    const channels = rules
      .filter((r) => r.recipientUserId === outsiderId)
      .map((r) => r.channel)
      .sort();
    expect(channels).toEqual(['email', 'in_app', 'push']);
    expect(rules.every((r) => r.type === 'member_removed')).toBe(true);
  });

  it('board.member_role_changed → target user receives in_app + push (Faz 10A; no mute-bypass, no email default + 2026-06-01 push expansion)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-board-role'),
      type: 'board.member_role_changed',
      workspaceId,
      boardId,
      cardId: null,
      actorId,
      payload: { targetUserId: assigneeId, fromRole: 'member', toRole: 'admin' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))]).toEqual([assigneeId]);
    expect(rules.every((r) => r.type === 'member_role_changed')).toBe(true);
    expect(rules.map((r) => r.channel).sort()).toEqual(['in_app', 'push']);
  });

  it('workspace.member_role_changed → target user receives in_app + push (no boardId, Faz 10A + 2026-06-01 push expansion)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-ws-role'),
      type: 'workspace.member_role_changed',
      workspaceId,
      boardId: null,
      cardId: null,
      actorId,
      payload: { targetUserId: assigneeId, fromRole: 'member', toRole: 'admin' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))]).toEqual([assigneeId]);
    expect(rules.every((r) => r.type === 'member_role_changed')).toBe(true);
    expect(rules.map((r) => r.channel).sort()).toEqual(['in_app', 'push']);
  });

  it('member_removed actor self-skip: çıkaran kişi kendi olduğunda alıcı kendisi olamaz (Faz 10A)', async () => {
    // Kullanıcı kendi kendini board'dan çıkarıyor → çıkarılan kişi = actor
    // → actor self-skip uygulanır → 0 satır üretilir. "Kendine 'çıkarıldın'
    // bildirimi gitmez" garantisi.
    const event: ActivityEventForRules = {
      id: newId('ae-board-self'),
      type: 'board.member_removed',
      workspaceId,
      boardId,
      cardId: null,
      actorId: assigneeId,
      payload: { removedUserId: assigneeId, removedRole: 'member', self: true },
    };
    const rules = await computeNotifications(db(), event);
    expect(rules).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Faz 10H (DEM-142) — Snooze: kart bazında geçici sustur.
  // ─────────────────────────────────────────────────────────────────────

  it('snooze aktif (mute_until > now) + comment.created → bildirim üretilmez (Faz 10H)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // +1 saat
    // 2026-06-03 board-audience: comment.created board audience'a (assignee +
    // watcher) gider. Snooze davranışını izole etmek için her iki alıcı da
    // kart-scope snooze'lanır → hiç satır üretilmemeli.
    await db()
      .insert(notificationPreferences)
      .values([
        { userId: watcherId, cardId, muteUntil: future },
        { userId: assigneeId, cardId, muteUntil: future },
      ]);
    try {
      const event: ActivityEventForRules = {
        id: newId('ae-snooze'),
        type: 'comment.created',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { commentId: newId('cm'), cardId },
      };
      const rules = await computeNotifications(db(), event);
      // Her iki alıcı da snooze'lu, dolayısıyla hiç bildirim üretmez.
      expect(rules).toEqual([]);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.inArray(notificationPreferences.userId, [watcherId, assigneeId]),
            dbMod.eq(notificationPreferences.cardId, cardId),
          ),
        );
    }
  });

  it('snooze aktif + comment.mentioned → mute-bypass çalışır, bildirim gider (Faz 10H)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await db().insert(notificationPreferences).values({
      userId: assigneeId,
      cardId,
      muteUntil: future,
    });
    try {
      const event: ActivityEventForRules = {
        id: newId('ae-snooze-mention'),
        type: 'comment.mentioned',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { commentId: newId('cm'), mentionedUserId: assigneeId },
      };
      const rules = await computeNotifications(db(), event);
      // Mention mute-bypass tipinde; snooze'a rağmen tüm kanallarda geçer
      // (in_app + email + push — pickChannels mention için 3 satır üretir).
      expect([...new Set(rules.map((r) => r.recipientUserId))]).toEqual([assigneeId]);
      expect(rules.every((r) => r.type === 'mention')).toBe(true);
      expect(rules.some((r) => r.channel === 'in_app')).toBe(true);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.eq(notificationPreferences.userId, assigneeId),
            dbMod.eq(notificationPreferences.cardId, cardId),
          ),
        );
    }
  });

  it('snooze süresi dolmuş (mute_until < now) → bildirim normal şekilde üretilir (Faz 10H)', async () => {
    const past = new Date(Date.now() - 60 * 1000); // 1 dakika önce dolmuş
    await db().insert(notificationPreferences).values({
      userId: watcherId,
      cardId,
      muteUntil: past,
    });
    try {
      const event: ActivityEventForRules = {
        id: newId('ae-snooze-expired'),
        type: 'comment.created',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { commentId: newId('cm'), cardId },
      };
      const rules = await computeNotifications(db(), event);
      // Snooze süresi dolduğu için watcher normal akışa döner. 2026-06-03
      // board-audience: assignee de board üyesi olduğu için alıcıdır.
      expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
        [assigneeId, watcherId].sort(),
      );
      expect(rules.every((r) => r.type === 'comment_reply')).toBe(true);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.eq(notificationPreferences.userId, watcherId),
            dbMod.eq(notificationPreferences.cardId, cardId),
          ),
        );
    }
  });

  it('snooze + muteLevel=all aynı satırda → her iki yol da mute, mute-bypass tipler hâlâ geçer (Faz 10H)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await db().insert(notificationPreferences).values({
      userId: assigneeId,
      cardId,
      muteLevel: 'all',
      muteUntil: future,
    });
    try {
      // Normal tip → boş.
      const commentEvent: ActivityEventForRules = {
        id: newId('ae-snooze-mute-all'),
        type: 'card.member_added',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { cardId, userId: assigneeId, role: 'assignee' },
      };
      const r1 = await computeNotifications(db(), commentEvent);
      expect(r1).toEqual([]);

      // Mention → bypass; her iki kontrol de mute olsa bile geçer.
      const mentionEvent: ActivityEventForRules = {
        id: newId('ae-snooze-mute-mention'),
        type: 'comment.mentioned',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { commentId: newId('cm'), mentionedUserId: assigneeId },
      };
      const r2 = await computeNotifications(db(), mentionEvent);
      // Mention bypass — tüm kanallarda gönderilir (in_app + email + push).
      expect([...new Set(r2.map((r) => r.recipientUserId))]).toEqual([assigneeId]);
      expect(r2.every((r) => r.type === 'mention')).toBe(true);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.eq(notificationPreferences.userId, assigneeId),
            dbMod.eq(notificationPreferences.cardId, cardId),
          ),
        );
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2026-06-01 — Push notification kapsamı genişletildi: `pickChannels` artık
  // tüm tipleri push'a gönderir (default opt-out). Önceki davranış yalnız 5
  // "yüksek değer" tipte default açıktı. Bu blok, kullanıcı tarafından opt-out
  // edilebilirliği + granular tiplerin push üretmeye başladığını doğrular.
  // Detay → `docs/domain/04-bildirim-kurallari.md` "Push kanalı kapsamı".
  // ─────────────────────────────────────────────────────────────────────

  it('push expansion → card.moved (cross-list) watchers get in_app + push (2026-06-01)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-moved'),
      type: 'card.moved',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId, fromListId: 'list-from', toListId: 'list-to' },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_moved')).toBe(true);
    // 2026-06-01 push expansion — `card_moved` artık in_app + push (board audience).
    expect(
      rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort(),
    ).toEqual(['in_app', 'push']);
  });

  it('push expansion → card.archived watchers get in_app + push (2026-06-01)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-archived'),
      type: 'card.archived',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_archived')).toBe(true);
    expect(
      rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort(),
    ).toEqual(['in_app', 'push']);
  });

  it('push expansion → card.completed watchers get in_app + push (2026-06-01)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-completed'),
      type: 'card.completed',
      workspaceId,
      boardId,
      cardId,
      actorId,
      payload: { cardId },
    };
    const rules = await computeNotifications(db(), event);
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === 'card_completed')).toBe(true);
    expect(
      rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort(),
    ).toEqual(['in_app', 'push']);
  });

  it('push expansion → push_enabled=false workspace-scope drops push (in_app stays; opt-out path)', async () => {
    // Kullanıcı opt-out kontrolü: workspace-scope `push_enabled=false`
    // preference satırı → granular tipler push'a gitmez, in_app korunur.
    // 2026-06-01 expansion'ın opt-out matrix'inin temel davranışı.
    await db().insert(notificationPreferences).values({
      userId: watcherId,
      workspaceId,
      pushEnabled: false,
    });
    try {
      const event: ActivityEventForRules = {
        id: newId('ae-moved-no-push'),
        type: 'card.moved',
        workspaceId,
        boardId,
        cardId,
        actorId,
        payload: { cardId, fromListId: 'list-from', toListId: 'list-to' },
      };
      const rules = await computeNotifications(db(), event);
      expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
        [assigneeId, watcherId].sort(),
      );
      expect(rules.every((r) => r.type === 'card_moved')).toBe(true);
      // watcher workspace-scope push_enabled=false → yalnız in_app (opt-out path);
      // assignee preference yok → default in_app + push (opt-out user-scoped).
      expect(
        rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel),
      ).toEqual(['in_app']);
      expect(
        rules.filter((r) => r.recipientUserId === assigneeId).map((r) => r.channel).sort(),
      ).toEqual(['in_app', 'push']);
    } finally {
      await db()
        .delete(notificationPreferences)
        .where(
          dbMod.and(
            dbMod.eq(notificationPreferences.userId, watcherId),
            dbMod.eq(notificationPreferences.workspaceId, workspaceId),
          ),
        );
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03).
  // Kart oluşturma + liste/board/etiket yaşam döngüsü her olay kendi bildirim
  // tipine 1:1 eşlenir; hepsi board audience pool (non-guest workspace üyeleri
  // ∪ explicit board üyeleri), actor self-skip, in-app + push default (email
  // opt-in listesinde değil).
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Tek olay → board audience'a giden granular bildirim tipi doğrulaması.
   * `cardId` opsiyonel (list/board/label event'lerinde yok ama boardId var →
   * `loadEventContext` board üyelerini yine yükler). Beklenen alıcı:
   * {assignee, watcher} (actor self-skip + guest/outsider permission filter).
   */
  async function expectGranular(
    type: ActivityEventForRules['type'],
    expectedType: string,
    payload: Record<string, unknown>,
    opts: { cardId?: string | null } = {},
  ) {
    const event: ActivityEventForRules = {
      id: newId('ae-gran'),
      type,
      workspaceId,
      boardId,
      cardId: opts.cardId ?? null,
      actorId,
      payload,
    };
    const rules = await computeNotifications(db(), event);
    // Board audience: assignee + watcher (actor self-skipped, guest/outsider filtered).
    expect([...new Set(rules.map((r) => r.recipientUserId))].sort()).toEqual(
      [assigneeId, watcherId].sort(),
    );
    expect(rules.every((r) => r.type === expectedType)).toBe(true);
    // in_app + push default (granular tipler email opt-in listesinde değil).
    expect(
      rules.filter((r) => r.recipientUserId === watcherId).map((r) => r.channel).sort(),
    ).toEqual(['in_app', 'push']);
    expect(
      rules.filter((r) => r.recipientUserId === assigneeId).map((r) => r.channel).sort(),
    ).toEqual(['in_app', 'push']);
    return rules;
  }

  it('card.created → board audience gets card_created, in_app + push (Faz 2)', async () => {
    const rules = await expectGranular(
      'card.created',
      'card_created',
      { cardId, listId: newId('l'), title: 'Yeni Kart' },
      { cardId },
    );
    // Payload taşıma: activityType + notificationType + title.
    const sample = rules.find((r) => r.recipientUserId === watcherId && r.channel === 'in_app');
    expect(sample?.payload).toMatchObject({
      activityType: 'card.created',
      notificationType: 'card_created',
      title: 'Yeni Kart',
    });
  });

  it('list.created → board audience gets list_created (Faz 2)', async () => {
    const rules = await expectGranular('list.created', 'list_created', {
      listId: newId('l'),
      title: 'Yeni Liste',
    });
    const sample = rules.find((r) => r.recipientUserId === watcherId && r.channel === 'in_app');
    // cardId null ama listId payload'a taşınmalı (derin link).
    expect(sample?.payload).toMatchObject({ notificationType: 'list_created' });
    expect(sample?.payload.listId).toEqual(expect.any(String));
    expect(sample?.payload.cardId).toBeUndefined();
  });

  it('list.renamed → board audience gets list_renamed (Faz 2)', async () => {
    await expectGranular('list.renamed', 'list_renamed', {
      listId: newId('l'),
      fromTitle: 'Eski',
      toTitle: 'Yeni',
    });
  });

  it('list.moved → board audience gets list_moved (Faz 2)', async () => {
    await expectGranular('list.moved', 'list_moved', {
      listId: newId('l'),
      fromPosition: 'a0',
      toPosition: 'a1',
    });
  });

  it('list.archived → board audience gets list_archived (archive + restore aynı tip, Faz 2)', async () => {
    await expectGranular('list.archived', 'list_archived', {
      listId: newId('l'),
      archived: true,
    });
    // Geri alma da aynı tipe düşer (payload.archived yönü taşır).
    await expectGranular('list.archived', 'list_archived', {
      listId: newId('l'),
      archived: false,
    });
  });

  it('list.deleted → board audience gets list_deleted (Faz 2)', async () => {
    await expectGranular('list.deleted', 'list_deleted', {
      listId: newId('l'),
      title: 'Silinen Liste',
    });
  });

  it('board.created → board audience gets board_created (Faz 2)', async () => {
    await expectGranular('board.created', 'board_created', {
      title: 'NR Board',
      icon: null,
    });
  });

  it('board.renamed → board audience gets board_renamed (Faz 2)', async () => {
    await expectGranular('board.renamed', 'board_renamed', {
      fromTitle: 'Eski Board',
      toTitle: 'Yeni Board',
    });
  });

  it('board.archived → board audience gets board_archived (Faz 2)', async () => {
    await expectGranular('board.archived', 'board_archived', { archived: true });
  });

  it('board.background_changed → board audience gets board_background_changed (Faz 2)', async () => {
    await expectGranular('board.background_changed', 'board_background_changed', {
      from: null,
      to: 'gradient:peach',
    });
  });

  it('board.background_cleared → bildirim üretmez (temizleme kapsam dışı, Faz 2)', async () => {
    const event: ActivityEventForRules = {
      id: newId('ae-bgclear'),
      type: 'board.background_cleared',
      workspaceId,
      boardId,
      cardId: null,
      actorId,
      payload: { from: 'gradient:peach' },
    };
    const rules = await computeNotifications(db(), event);
    expect(rules).toEqual([]);
  });

  it('label.created → board audience gets label_created, name payload taşınır (Faz 2)', async () => {
    const rules = await expectGranular('label.created', 'label_created', {
      labelId: newId('lbl'),
      name: 'Acil',
    });
    const sample = rules.find((r) => r.recipientUserId === watcherId && r.channel === 'in_app');
    expect(sample?.payload).toMatchObject({ notificationType: 'label_created', name: 'Acil' });
    expect(sample?.payload.labelId).toEqual(expect.any(String));
  });

  it('label.updated → board audience gets label_updated (Faz 2)', async () => {
    await expectGranular('label.updated', 'label_updated', {
      labelId: newId('lbl'),
      name: 'Güncel',
    });
  });

  it('label.deleted → board audience gets label_deleted (Faz 2)', async () => {
    await expectGranular('label.deleted', 'label_deleted', {
      labelId: newId('lbl'),
      name: 'Silinen',
    });
  });
});
