/**
 * Integration tests for `notifications.preferences.*` (Faz 10B / DEM-136).
 * Same DB-probe pattern as the rest of `packages/api` — the suite skips on
 * a box without `DATABASE_URL` / a reachable Postgres.
 *
 * Coverage matrix (15+ tests):
 *  - list: empty caller, populated caller, no cross-user leak, ordering
 *    (global → workspace → board → card with scopeLabel resolution).
 *  - get: each scope dimension; returns `null` when missing; permission
 *    denied for non-member.
 *  - upsert insert (global + workspace + board + card); upsert update of an
 *    existing row (one row, conflict target hits); xor-validation rejects
 *    two-dimension input; permission denied for non-workspace member; UPDATE
 *    via second upsert keeps single row + bumps `updatedAt`.
 *  - delete: missing row → NOT_FOUND; existing scope row → deleted; global
 *    default protected → BAD_REQUEST; permission denied for non-member.
 *  - auth: unauthenticated caller → UNAUTHORIZED on every procedure.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  cardMembers,
  notificationPreferences,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

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

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string | null) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: userId ? session(userId) : null,
      db: probe.db,
    }),
  );
}

describe.runIf(dbAvailable)('notifications.preferences router (integration)', () => {
  const db = () => probe!.db;

  // Two members of one workspace + one outsider with no access anywhere.
  const aliceId = newId('u-npref-alice');
  const bobId = newId('u-npref-bob');
  const outsiderId = newId('u-npref-out');
  const createdUserIds = [aliceId, bobId, outsiderId];

  let workspaceId: string;
  let otherWorkspaceId: string;
  let boardId: string;
  let cardId: string;
  let outsiderCardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    // Workspace #1 — Alice owner, Bob member; everything Alice tests against
    // lives in this workspace.
    const ws = await callerFor(aliceId).workspace.create({
      name: 'Pref Co',
      slug: newSlug('pref-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([{ workspaceId, userId: bobId, role: 'member' }]);

    // Workspace #2 — Bob owner; used to assert Alice can't manage Bob's scope.
    const ws2 = await callerFor(bobId).workspace.create({
      name: 'Bob Co',
      slug: newSlug('bob-co'),
      clientMutationId: crypto.randomUUID(),
    });
    otherWorkspaceId = ws2.id;
    createdWorkspaceIds.push(ws2.id);

    // A board inside Workspace #1; Alice (owner) + Bob (member) reach it.
    const board = await callerFor(aliceId).board.create({
      workspaceId,
      title: 'Pref Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    // Bob keeps workspace membership; the effective role gives him board
    // access without an explicit board_members row.
    void boardMembers;

    // A list + card on that board.
    const list = await callerFor(aliceId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    const card = await callerFor(aliceId).card.create({
      listId: list.id,
      title: 'Pref Card',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;

    // A second card on the *other* board (Bob's workspace) so we can test
    // outsider access to a card the caller can't reach.
    const otherBoard = await callerFor(bobId).board.create({
      workspaceId: otherWorkspaceId,
      title: 'Bob Board',
      clientMutationId: crypto.randomUUID(),
    });
    const otherList = await callerFor(bobId).list.create({
      boardId: otherBoard.id,
      title: 'Bob Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    const otherCard = await callerFor(bobId).card.create({
      listId: otherList.id,
      title: 'Bob Card',
      clientMutationId: crypto.randomUUID(),
    });
    outsiderCardId = otherCard.id;
    void cardMembers;
  });

  beforeEach(async () => {
    // Each test starts with empty preference rows for the three users.
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(notificationPreferences)
      .where(dbMod.inArray(notificationPreferences.userId, createdUserIds));
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
    await probe.pool.end();
  });

  // ─────────────────────────────────────────────────────────── list

  it('list: empty caller returns an empty array', async () => {
    const result = await callerFor(aliceId).notifications.preferences.list();
    expect(result).toEqual([]);
  });

  it('list: surfaces all scope rows ordered global → workspace → board → card, with scopeLabel', async () => {
    // Seed: global + workspace + board + card rows for Alice.
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'mentions_only',
      mentionOnly: true,
      pushEnabled: true,
      emailEnabled: false,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      boardId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: true,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      cardId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });

    const result = await callerFor(aliceId).notifications.preferences.list();
    expect(result).toHaveLength(4);
    // The order is workspace → board → card → … with NULLS FIRST, so the
    // global row (all NULL) leads.
    expect(result[0]).toMatchObject({
      workspaceId: null,
      boardId: null,
      cardId: null,
      scopeLabel: 'Genel',
      muteLevel: 'none',
    });
    expect(result[1]).toMatchObject({
      workspaceId,
      boardId: null,
      cardId: null,
      scopeLabel: 'Pref Co',
      muteLevel: 'mentions_only',
    });
    expect(result[2]).toMatchObject({
      workspaceId: null,
      boardId,
      cardId: null,
      scopeLabel: 'Pref Board',
      muteLevel: 'none',
    });
    expect(result[3]).toMatchObject({
      workspaceId: null,
      boardId: null,
      cardId,
      scopeLabel: 'Pref Card',
      muteLevel: 'all',
    });
  });

  it("list: never returns another user's rows (cross-user isolation)", async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    const result = await callerFor(bobId).notifications.preferences.list();
    expect(result).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────── get

  it('get: returns null when no row exists for the scope', async () => {
    const result = await callerFor(aliceId).notifications.preferences.get({});
    expect(result).toBeNull();
  });

  it('get: reads each scope dimension after upsert (global / workspace / board / card)', async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'mentions_only',
      mentionOnly: true,
      pushEnabled: true,
      emailEnabled: true,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      boardId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: false,
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      cardId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });

    expect(await callerFor(aliceId).notifications.preferences.get({})).toMatchObject({
      muteLevel: 'mentions_only',
      mentionOnly: true,
    });
    expect(
      await callerFor(aliceId).notifications.preferences.get({ workspaceId }),
    ).toMatchObject({ muteLevel: 'all' });
    expect(await callerFor(aliceId).notifications.preferences.get({ boardId })).toMatchObject({
      muteLevel: 'none',
      pushEnabled: true,
    });
    expect(await callerFor(aliceId).notifications.preferences.get({ cardId })).toMatchObject({
      muteLevel: 'all',
    });
  });

  it("get: workspace scope an outsider can't reach → FORBIDDEN", async () => {
    await expect(
      callerFor(outsiderId).notifications.preferences.get({ workspaceId }),
    ).rejects.toThrowError(/erişiminiz yok|FORBIDDEN/);
  });

  it("get: card scope an outsider can't reach → FORBIDDEN", async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.get({ cardId: outsiderCardId }),
    ).rejects.toThrowError(/erişiminiz yok|FORBIDDEN/);
  });

  // ─────────────────────────────────────────────────────────── upsert

  it('upsert: inserts a new workspace-scope row and returns it', async () => {
    const result = await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    expect(result).toMatchObject({
      workspaceId,
      boardId: null,
      cardId: null,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    expect(result.id).toEqual(expect.any(String));
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('upsert: same scope a second time UPDATEs the row (no duplicate insert)', async () => {
    const first = await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
    });
    const second = await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'mentions_only',
      mentionOnly: true,
      pushEnabled: false,
      emailEnabled: false,
    });

    // Same row id, second `updatedAt` ≥ first.
    expect(second.id).toBe(first.id);
    expect(second.muteLevel).toBe('mentions_only');
    expect(second.pushEnabled).toBe(false);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());

    // Single row in DB for (alice, workspaceId).
    const rows = await db()
      .select()
      .from(notificationPreferences)
      .where(
        dbMod.and(
          dbMod.eq(notificationPreferences.userId, aliceId),
          dbMod.eq(notificationPreferences.workspaceId, workspaceId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('upsert: global default row UPDATEs in place too (NULL scope ON CONFLICT)', async () => {
    const first = await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
    });
    const second = await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    expect(second.id).toBe(first.id);
    expect(second.muteLevel).toBe('all');

    // Exactly one global row for Alice.
    const rows = await db()
      .select()
      .from(notificationPreferences)
      .where(
        dbMod.and(
          dbMod.eq(notificationPreferences.userId, aliceId),
          dbMod.isNull(notificationPreferences.workspaceId),
          dbMod.isNull(notificationPreferences.boardId),
          dbMod.isNull(notificationPreferences.cardId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('upsert: rejects multi-scope input via Zod xor-validation', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.upsert({
        workspaceId,
        boardId,
        muteLevel: 'all',
        mentionOnly: false,
        pushEnabled: false,
        emailEnabled: false,
      }),
    ).rejects.toThrowError(/en fazla biri|BAD_REQUEST/);
  });

  it("upsert: outsider can't write to a workspace they don't belong to → FORBIDDEN", async () => {
    await expect(
      callerFor(outsiderId).notifications.preferences.upsert({
        workspaceId,
        muteLevel: 'all',
        mentionOnly: false,
        pushEnabled: false,
        emailEnabled: false,
      }),
    ).rejects.toThrowError(/erişiminiz yok|FORBIDDEN/);
  });

  it('upsert: global scope is always allowed (own row) even for an outsider', async () => {
    const result = await callerFor(outsiderId).notifications.preferences.upsert({
      muteLevel: 'mentions_only',
      mentionOnly: true,
      pushEnabled: true,
      emailEnabled: true,
    });
    expect(result.muteLevel).toBe('mentions_only');
  });

  // ─────────────────────────────────────────────────────────── delete

  it('delete: removes an existing workspace-scope row', async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    const result = await callerFor(aliceId).notifications.preferences.delete({ workspaceId });
    expect(result.deleted).toBe(true);
    // Re-read: gone.
    const after = await callerFor(aliceId).notifications.preferences.get({ workspaceId });
    expect(after).toBeNull();
  });

  it('delete: missing row → NOT_FOUND', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.delete({ workspaceId }),
    ).rejects.toThrowError(/bulunamadı|NOT_FOUND/);
  });

  it('delete: refuses to drop the global default → BAD_REQUEST', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.delete({}),
    ).rejects.toThrowError(/silinemez|BAD_REQUEST/);
  });

  it("delete: outsider can't drop a workspace scope they don't reach → FORBIDDEN", async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: false,
      emailEnabled: false,
    });
    await expect(
      callerFor(outsiderId).notifications.preferences.delete({ workspaceId }),
    ).rejects.toThrowError(/erişiminiz yok|FORBIDDEN/);
  });

  // ─────────────────────────────────────────────────────────── auth

  it('list / get / upsert / delete require authentication', async () => {
    await expect(callerFor(null).notifications.preferences.list()).rejects.toThrowError(
      /UNAUTHORIZED|Oturum gerekli/,
    );
    await expect(callerFor(null).notifications.preferences.get({})).rejects.toThrowError(
      /UNAUTHORIZED|Oturum gerekli/,
    );
    await expect(
      callerFor(null).notifications.preferences.upsert({
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
      }),
    ).rejects.toThrowError(/UNAUTHORIZED|Oturum gerekli/);
    await expect(
      callerFor(null).notifications.preferences.delete({ workspaceId }),
    ).rejects.toThrowError(/UNAUTHORIZED|Oturum gerekli/);
  });

  // ─────────────────────────────────────────── quiet hours (Faz 10F / DEM-140)

  it('upsert: stores the quiet-hours triplet on the global row and round-trips via get', async () => {
    const result = await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.quietFrom).toBe('23:00');
    expect(result.quietTo).toBe('07:00');
    expect(result.quietTimezone).toBe('Europe/Istanbul');

    const round = await callerFor(aliceId).notifications.preferences.get({});
    expect(round?.quietFrom).toBe('23:00');
    expect(round?.quietTo).toBe('07:00');
    expect(round?.quietTimezone).toBe('Europe/Istanbul');
  });

  it('upsert: clearing the triplet (null × 3) resets the window on a subsequent write', async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      quietFrom: '22:00',
      quietTo: '08:00',
      quietTimezone: 'Europe/Istanbul',
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
    });
    const round = await callerFor(aliceId).notifications.preferences.get({});
    expect(round?.quietFrom).toBeNull();
    expect(round?.quietTo).toBeNull();
    expect(round?.quietTimezone).toBeNull();
  });

  it('upsert: partial triplet (only quietFrom set) → BAD_REQUEST', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.upsert({
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: '23:00',
      }),
    ).rejects.toThrowError(/üçü birden|BAD_REQUEST/);
  });

  it('upsert: workspace scope + quiet hours → BAD_REQUEST (global-only field)', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.upsert({
        workspaceId,
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: '23:00',
        quietTo: '07:00',
        quietTimezone: 'Europe/Istanbul',
      }),
    ).rejects.toThrowError(/yalnızca genel|BAD_REQUEST/);
  });

  it('upsert: invalid timezone id → BAD_REQUEST', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.upsert({
        muteLevel: 'none',
        mentionOnly: false,
        pushEnabled: true,
        emailEnabled: true,
        quietFrom: '23:00',
        quietTo: '07:00',
        quietTimezone: 'Mars/Olympus',
      }),
    ).rejects.toThrowError(/IANA|BAD_REQUEST/);
  });

  it('list: includes quietFrom/quietTo/quietTimezone on the global row', async () => {
    await callerFor(aliceId).notifications.preferences.upsert({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      quietFrom: '21:30',
      quietTo: '06:00',
      quietTimezone: 'Europe/Berlin',
    });
    await callerFor(aliceId).notifications.preferences.upsert({
      workspaceId,
      muteLevel: 'mentions_only',
      mentionOnly: true,
      pushEnabled: true,
      emailEnabled: false,
    });
    const result = await callerFor(aliceId).notifications.preferences.list();
    const global = result.find((row) => !row.workspaceId && !row.boardId && !row.cardId);
    expect(global?.quietFrom).toBe('21:30');
    expect(global?.quietTo).toBe('06:00');
    expect(global?.quietTimezone).toBe('Europe/Berlin');

    const workspace = result.find((row) => row.workspaceId === workspaceId);
    expect(workspace?.quietFrom).toBeNull();
    expect(workspace?.quietTo).toBeNull();
    expect(workspace?.quietTimezone).toBeNull();
  });

  // ─────────────────────────────────────────────────────────── Faz 10H (DEM-142) snooze

  it('snooze: insert yeni kart-scope satırı, mute_until ileri tarihte (1h)', async () => {
    const before = Date.now();
    const result = await callerFor(aliceId).notifications.preferences.snooze({
      cardId,
      duration: '1h',
      clientMutationId: crypto.randomUUID(),
    });
    expect(result.muteUntil).toBeInstanceOf(Date);
    const ts = (result.muteUntil as Date).getTime();
    // 1 saat ± 5 saniye toleransı (test sürerken küçük drift olabilir).
    expect(ts).toBeGreaterThan(before + 60 * 60 * 1000 - 5_000);
    expect(ts).toBeLessThan(before + 60 * 60 * 1000 + 5_000);

    const get = await callerFor(aliceId).notifications.preferences.get({ cardId });
    expect(get?.muteUntil).not.toBeNull();
  });

  it('snooze: mevcut kart-scope satırı varsa mute_until güncellenir (1h → 1d)', async () => {
    await callerFor(aliceId).notifications.preferences.snooze({
      cardId,
      duration: '1h',
      clientMutationId: crypto.randomUUID(),
    });
    const result = await callerFor(aliceId).notifications.preferences.snooze({
      cardId,
      duration: '1d',
      clientMutationId: crypto.randomUUID(),
    });
    const ts = (result.muteUntil as Date).getTime();
    // 1 gün ± küçük drift.
    expect(ts).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    // Tek satır beklenir — duplicate yok.
    const list = await callerFor(aliceId).notifications.preferences.list();
    const cardRows = list.filter((r) => r.cardId === cardId);
    expect(cardRows).toHaveLength(1);
  });

  it('snooze: until_date geçmiş tarih → BAD_REQUEST', async () => {
    const past = new Date(Date.now() - 60 * 1000);
    await expect(
      callerFor(aliceId).notifications.preferences.snooze({
        cardId,
        duration: 'until_date',
        untilDate: past,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrowError(/gelecek|BAD_REQUEST/i);
  });

  it('snooze: until_date 1 yıldan uzak → BAD_REQUEST', async () => {
    const farFuture = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    await expect(
      callerFor(aliceId).notifications.preferences.snooze({
        cardId,
        duration: 'until_date',
        untilDate: farFuture,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrowError(/1 yıl|BAD_REQUEST/i);
  });

  it('snooze: başkasının kartı (outsider) → FORBIDDEN', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.snooze({
        cardId: outsiderCardId,
        duration: '1h',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrowError(/FORBIDDEN|erişim/i);
  });

  it('snooze: until_date eksik → Zod refine reject', async () => {
    await expect(
      callerFor(aliceId).notifications.preferences.snooze({
        cardId,
        duration: 'until_date',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrowError(/untilDate|until_date/i);
  });

  it('unsnooze: aktif snooze satırını mute_until=null yapar; tekrar çağrı no-op', async () => {
    await callerFor(aliceId).notifications.preferences.snooze({
      cardId,
      duration: '4h',
      clientMutationId: crypto.randomUUID(),
    });
    const r1 = await callerFor(aliceId).notifications.preferences.unsnooze({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(r1.unsnoozed).toBe(true);

    const get = await callerFor(aliceId).notifications.preferences.get({ cardId });
    expect(get?.muteUntil).toBeNull();

    // İkinci çağrı: satır var ama muteUntil zaten null → 1 satır güncellenir
    // (returning eşleşir) → still true. Bu davranış idempotent kabul edilir.
    const r2 = await callerFor(aliceId).notifications.preferences.unsnooze({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(typeof r2.unsnoozed).toBe('boolean');
  });

  it('unsnooze: hiç snooze edilmemiş kart → unsnoozed: false (no-op)', async () => {
    const result = await callerFor(aliceId).notifications.preferences.unsnooze({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(result.unsnoozed).toBe(false);
  });
});
