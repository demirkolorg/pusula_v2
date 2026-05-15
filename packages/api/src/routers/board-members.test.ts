/**
 * Integration tests for the board-members router (Phase 2.5C / DEM-52). These
 * hit a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm
 * db:migrate`). If no database is reachable the suite is skipped rather than
 * failing on a box without infra. Mirrors `board.test.ts`'s DB-probe pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardInvitations,
  boardMembers,
  cardMembers,
  notificationOutbox,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

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

// Workspace owner (= inherited board admin); a plain workspace member (no board
// membership → inherited board `member`); a workspace member who is an explicit
// board `admin`; a workspace guest who is an explicit board `viewer`; a
// workspace `admin` (= inherited board admin); a workspace member NOT on the
// board (added via `board.members.add`); a user with an account but NO
// workspace membership (added as a guest via `board.members.add`); an outsider.
const ownerId = newId('u-bmb-owner');
const memberId = newId('u-bmb-member');
const boardAdminId = newId('u-bmb-boardadmin');
const boardViewerId = newId('u-bmb-boardviewer');
const wsAdminId = newId('u-bmb-wsadmin');
const targetUserId = newId('u-bmb-target');
const accountNoWsId = newId('u-bmb-noawks');
const outsiderId = newId('u-bmb-outsider');
const createdUserIds = [
  ownerId,
  memberId,
  boardAdminId,
  boardViewerId,
  wsAdminId,
  targetUserId,
  accountNoWsId,
  outsiderId,
];

const session = (id: string) => ({ user: { id, email: emailOf(id), name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('board-members router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  const createdWorkspaceIds: string[] = [];

  const actsFor = (board: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, board));
  const wsActsFor = (ws: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.workspaceId, ws));
  const boardVersion = async (board: string) => {
    const [row] = await db()
      .select({ version: dbMod.boards.version })
      .from(dbMod.boards)
      .where(dbMod.eq(dbMod.boards.id, board))
      .limit(1);
    return row!.version;
  };

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: emailOf(id) })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Board Members Co',
      slug: newSlug('board-members-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: boardAdminId, role: 'member' },
        { workspaceId, userId: boardViewerId, role: 'guest' },
        { workspaceId, userId: wsAdminId, role: 'admin' },
        { workspaceId, userId: targetUserId, role: 'member' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Members Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    // explicit board memberships beyond the creator (= ownerId, admin):
    await db()
      .insert(boardMembers)
      .values([
        { boardId, userId: boardAdminId, role: 'admin' },
        { boardId, userId: boardViewerId, role: 'viewer' },
      ]);
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  // ------------------------------------------------------------------ list

  it('list: returns explicit board_members rows + inherited workspace owner/admins (inherited flag); no e-mail; a board viewer may call it', async () => {
    const rows = await callerFor(boardViewerId).board.members.list({ boardId });

    // explicit rows: ownerId (creator → admin), boardAdminId (admin), boardViewerId (viewer)
    const owner = rows.find((r) => r.userId === ownerId);
    expect(owner).toMatchObject({ role: 'admin', inherited: false });
    expect(rows.find((r) => r.userId === boardAdminId)).toMatchObject({
      role: 'admin',
      inherited: false,
    });
    expect(rows.find((r) => r.userId === boardViewerId)).toMatchObject({
      role: 'viewer',
      inherited: false,
    });

    // wsAdminId is a workspace `admin` with no explicit board row → inherited admin
    expect(rows.find((r) => r.userId === wsAdminId)).toMatchObject({
      role: 'admin',
      inherited: true,
    });

    // a plain workspace member that has no explicit board row does NOT appear in `list`
    expect(rows.some((r) => r.userId === memberId)).toBe(false);

    // privacy: no e-mail field
    expect(rows.every((r) => !('email' in r))).toBe(true);
  });

  // ------------------------------------------------------------------- add

  it('add: a board admin adds a workspace member straight to the board (board.member_added, version+1); re-add is CONFLICT', async () => {
    const v0 = await boardVersion(boardId);
    const added = await callerFor(boardAdminId).board.members.add({
      boardId,
      email: emailOf(targetUserId),
      role: 'member',
      clientMutationId: crypto.randomUUID(),
    });
    expect(added).toMatchObject({ kind: 'added', userId: targetUserId, role: 'member' });
    expect(added).not.toHaveProperty('token');
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const [row] = await db()
      .select()
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, targetUserId),
        ),
      )
      .limit(1);
    expect(row).toMatchObject({ role: 'member' });

    const acts = await actsFor(boardId);
    expect(
      acts.some(
        (a) =>
          a.type === 'board.member_added' &&
          (a.payload as { userId?: string }).userId === targetUserId &&
          (a.payload as { role?: string }).role === 'member',
      ),
    ).toBe(true);

    // re-adding the same person is a CONFLICT
    await expect(
      callerFor(boardAdminId).board.members.add({
        boardId,
        email: emailOf(targetUserId),
        role: 'admin',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('add: a board admin adds an account-holder who is not a workspace member → workspace guest + board member, both activities', async () => {
    const v0 = await boardVersion(boardId);
    const added = await callerFor(ownerId).board.members.add({
      boardId,
      email: emailOf(accountNoWsId),
      role: 'viewer',
      clientMutationId: crypto.randomUUID(),
    });
    expect(added).toMatchObject({ kind: 'added_as_guest', userId: accountNoWsId, role: 'viewer' });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const [wsRow] = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, accountNoWsId),
        ),
      )
      .limit(1);
    expect(wsRow).toMatchObject({ role: 'guest' });

    const [bmRow] = await db()
      .select()
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, accountNoWsId),
        ),
      )
      .limit(1);
    expect(bmRow).toMatchObject({ role: 'viewer' });

    const wsActs = await wsActsFor(workspaceId);
    expect(
      wsActs.some(
        (a) =>
          a.type === 'workspace.member_added' &&
          (a.payload as { userId?: string }).userId === accountNoWsId,
      ),
    ).toBe(true);
    const acts = await actsFor(boardId);
    expect(
      acts.some(
        (a) =>
          a.type === 'board.member_added' &&
          (a.payload as { userId?: string }).userId === accountNoWsId &&
          (a.payload as { role?: string }).role === 'viewer',
      ),
    ).toBe(true);
  });

  it('add: an email with no account → a pending board_invitations row + board.member_invited activity + board_invitation/email outbox row; token not returned; re-invite is CONFLICT', async () => {
    const inviteEmail = `invitee-${Math.random().toString(36).slice(2, 10)}@nobody.test`;
    const v0 = await boardVersion(boardId);
    const invited = await callerFor(boardAdminId).board.members.add({
      boardId,
      email: inviteEmail,
      role: 'member',
      clientMutationId: crypto.randomUUID(),
    });
    expect(invited).toMatchObject({ kind: 'invited', email: inviteEmail, role: 'member' });
    expect(invited).not.toHaveProperty('token');
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const [inv] = await db()
      .select()
      .from(boardInvitations)
      .where(
        dbMod.and(
          dbMod.eq(boardInvitations.boardId, boardId),
          dbMod.eq(boardInvitations.email, inviteEmail),
        ),
      )
      .limit(1);
    expect(inv).toMatchObject({ status: 'pending', role: 'member' });
    expect(inv!.token.length).toBeGreaterThanOrEqual(20);

    const acts = await actsFor(boardId);
    const invAct = acts.find(
      (a) =>
        a.type === 'board.member_invited' &&
        (a.payload as { email?: string }).email === inviteEmail,
    );
    expect(invAct).toBeDefined();
    expect(invAct!.payload).toMatchObject({
      invitationId: inv!.id,
      email: inviteEmail,
      role: 'member',
    });

    const outbox = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.eq(notificationOutbox.eventId, invAct!.id));
    const emailRow = outbox.find((o) => o.channel === 'email' && o.type === 'board_invitation');
    expect(emailRow).toBeDefined();
    expect(emailRow!.recipientId).toBeNull();
    expect(emailRow!.payload).toMatchObject({ boardId, email: inviteEmail, role: 'member' });
    expect((emailRow!.payload as { token?: string }).token).toBe(inv!.token);

    // re-inviting the same address while pending is a CONFLICT
    await expect(
      callerFor(boardAdminId).board.members.add({
        boardId,
        email: inviteEmail,
        role: 'viewer',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('add: a non-admin (workspace member / board viewer) cannot add members (FORBIDDEN)', async () => {
    await expect(
      callerFor(memberId).board.members.add({
        boardId,
        email: emailOf(outsiderId),
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(boardViewerId).board.members.add({
        boardId,
        email: emailOf(outsiderId),
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('add: an archived board is read-only (BAD_REQUEST)', async () => {
    const archBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archived For Add',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).board.archive({
      boardId: archBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).board.members.add({
        boardId: archBoard.id,
        email: emailOf(memberId),
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ------------------------------------------------------------ updateRole

  it('updateRole: a board admin changes an explicit member role (board.member_role_changed, version+1); idempotent; inherited-only is BAD_REQUEST; last admin is BAD_REQUEST; non-admin is FORBIDDEN', async () => {
    // targetUserId is now an explicit board `member`.
    const v0 = await boardVersion(boardId);
    const changed = await callerFor(ownerId).board.members.updateRole({
      boardId,
      userId: targetUserId,
      role: 'viewer',
      clientMutationId: crypto.randomUUID(),
    });
    expect(changed).toMatchObject({ userId: targetUserId, role: 'viewer', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);
    const acts = await actsFor(boardId);
    expect(
      acts.some(
        (a) =>
          a.type === 'board.member_role_changed' &&
          (a.payload as { userId?: string }).userId === targetUserId &&
          (a.payload as { toRole?: string }).toRole === 'viewer',
      ),
    ).toBe(true);

    // idempotent: setting the same role is changed:false, no version bump
    const v1 = await boardVersion(boardId);
    const noop = await callerFor(ownerId).board.members.updateRole({
      boardId,
      userId: targetUserId,
      role: 'viewer',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ userId: targetUserId, role: 'viewer', changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    // a workspace member who only *inherits* board access has no explicit row → BAD_REQUEST
    await expect(
      callerFor(ownerId).board.members.updateRole({
        boardId,
        userId: memberId,
        role: 'admin',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // demoting the last explicit admin is rejected. Create a fresh single-admin board.
    const soloBoard = await callerFor(memberId).board.create({
      workspaceId,
      title: 'Solo Admin Board',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).board.members.updateRole({
        boardId: soloBoard.id,
        userId: memberId,
        role: 'viewer',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a non-admin cannot change roles
    await expect(
      callerFor(boardViewerId).board.members.updateRole({
        boardId,
        userId: targetUserId,
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------- remove

  it('remove: a board admin removes an explicit member (board.member_removed, version+1); a member can leave; inherited-only is NOT_FOUND; last admin is BAD_REQUEST; non-admin cannot remove others; card memberships are preserved', async () => {
    // Seed: a board with two admins (so removing one is allowed), one viewer with a card membership.
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Remove Board',
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(boardMembers)
      .values([
        { boardId: board.id, userId: boardAdminId, role: 'admin' },
        { boardId: board.id, userId: targetUserId, role: 'viewer' },
        { boardId: board.id, userId: boardViewerId, role: 'viewer' },
      ]);
    // give targetUserId a card membership on this board — must survive board removal
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    const card = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Card',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.members.add({
      cardId: card.id,
      userId: targetUserId,
      role: 'watcher',
      clientMutationId: crypto.randomUUID(),
    });

    // admin removes an explicit member
    const v0 = await boardVersion(board.id);
    const removed = await callerFor(ownerId).board.members.remove({
      boardId: board.id,
      userId: targetUserId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(removed).toMatchObject({ userId: targetUserId, changed: true });
    expect(await boardVersion(board.id)).toBe(v0 + 1);
    const acts = await actsFor(board.id);
    expect(
      acts.some(
        (a) =>
          a.type === 'board.member_removed' &&
          (a.payload as { userId?: string }).userId === targetUserId,
      ),
    ).toBe(true);
    // gone from board_members
    const remaining = await db()
      .select()
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, board.id),
          dbMod.eq(boardMembers.userId, targetUserId),
        ),
      );
    expect(remaining).toHaveLength(0);
    // but the card membership survives
    const cardRows = await db()
      .select()
      .from(cardMembers)
      .where(
        dbMod.and(
          dbMod.eq(cardMembers.cardId, card.id),
          dbMod.eq(cardMembers.userId, targetUserId),
        ),
      );
    expect(cardRows).toHaveLength(1);

    // a board member may remove *themselves* (leave the board) even if not an admin
    const left = await callerFor(boardViewerId).board.members.remove({
      boardId: board.id,
      userId: boardViewerId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(left).toMatchObject({ userId: boardViewerId, changed: true });

    // removing someone who only *inherits* board access → NOT_FOUND
    await expect(
      callerFor(ownerId).board.members.remove({
        boardId: board.id,
        userId: memberId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // a non-admin (memberId only inherits `member`) cannot remove someone else
    await expect(
      callerFor(memberId).board.members.remove({
        boardId: board.id,
        userId: boardAdminId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // removing the last explicit admin is rejected
    const soloBoard = await callerFor(memberId).board.create({
      workspaceId,
      title: 'Solo Admin Remove Board',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).board.members.remove({
        boardId: soloBoard.id,
        userId: memberId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
