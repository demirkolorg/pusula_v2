/**
 * Integration tests for the board-invitations router (Phase 2.5C / DEM-52).
 * These hit a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` +
 * `pnpm db:migrate`). If no database is reachable the suite is skipped rather
 * than failing on a box without infra. Mirrors `board.test.ts`'s DB-probe
 * pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardInvitations,
  boardMembers,
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

// Workspace owner (= board admin); a board admin via explicit row; a board
// viewer (workspace guest); a plain workspace member (no board row); an account
// whose email will *not* match an invitation (used for the FORBIDDEN paths).
// Invitees that accept/decline are created *after* the invitation, with a
// fresh email that didn't exist when `board.members.add` ran — so `add` takes
// the invitation path, not the direct-add path.
const ownerId = newId('u-binv-owner');
const boardAdminId = newId('u-binv-boardadmin');
const boardViewerId = newId('u-binv-boardviewer');
const memberId = newId('u-binv-member');
const mismatchId = newId('u-binv-mismatch');
const createdUserIds = [ownerId, boardAdminId, boardViewerId, memberId, mismatchId];
// Extra users created on the fly (so afterAll can clean them up too).
const extraUserIds: string[] = [];

const session = (id: string) => ({ user: { id, email: emailOf(id), name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('board-invitations router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  const createdWorkspaceIds: string[] = [];

  const actsFor = (board: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, board));
  const wsActsFor = (ws: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.workspaceId, ws));

  /**
   * Create a `pending` board invitation (the email has no account yet, so
   * `board.members.add` takes the invitation path) and return the row.
   */
  async function inviteFreshEmail(email: string, role: 'admin' | 'member' | 'viewer' = 'member') {
    await callerFor(ownerId).board.members.add({
      boardId,
      email,
      role,
      clientMutationId: crypto.randomUUID(),
    });
    const [inv] = await db()
      .select()
      .from(boardInvitations)
      .where(dbMod.and(dbMod.eq(boardInvitations.boardId, boardId), dbMod.eq(boardInvitations.email, email)))
      .limit(1);
    return inv!;
  }

  /**
   * Allocate a fresh user id whose `${id}@example.test` email has no account
   * yet — so `board.members.add` on that email takes the invitation path. Call
   * `materializeUser(id)` afterwards to create the account so they can
   * accept/decline (the test `session` derives the email from the id, so they
   * match).
   */
  function freshInviteeId(): string {
    return newId('u-binv-late');
  }
  /** Create the user account for a previously-allocated invitee id. */
  async function materializeUser(id: string): Promise<void> {
    await db().insert(users).values({ id, name: id, email: emailOf(id) });
    extraUserIds.push(id);
  }

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: emailOf(id) })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Board Invitations Co',
      slug: newSlug('board-invitations-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: boardAdminId, role: 'member' },
        { workspaceId, userId: boardViewerId, role: 'guest' },
        { workspaceId, userId: memberId, role: 'member' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Invitations Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
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
    for (const id of [...createdUserIds, ...extraUserIds]) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  // --------------------------------------------------------- list / revoke

  it('list: a board member sees pending invitations (no token); revoke flips status to revoked + writes board.invitation_revoked; re-revoke is BAD_REQUEST; non-admin revoke is FORBIDDEN', async () => {
    const email = `inv-list-${Math.random().toString(36).slice(2, 10)}@nobody.test`;
    const inv = await inviteFreshEmail(email, 'viewer');

    // board `member+` (here the board admin) can list; token is not surfaced
    const listed = await callerFor(boardAdminId).board.invitations.list({ boardId });
    const row = listed.find((r) => r.id === inv.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ email, role: 'viewer' });
    expect(row).not.toHaveProperty('token');

    // a non-admin cannot revoke
    await expect(
      callerFor(memberId).board.invitations.revoke({
        boardId,
        invitationId: inv.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // the admin revokes it
    const revoked = await callerFor(ownerId).board.invitations.revoke({
      boardId,
      invitationId: inv.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(revoked).toMatchObject({ id: inv.id, status: 'revoked' });
    const [after] = await db()
      .select()
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.id, inv.id))
      .limit(1);
    expect(after).toMatchObject({ status: 'revoked' });
    const acts = await actsFor(boardId);
    expect(
      acts.some(
        (a) =>
          a.type === 'board.invitation_revoked' &&
          (a.payload as { invitationId?: string }).invitationId === inv.id,
      ),
    ).toBe(true);

    // revoking again is a BAD_REQUEST (no longer pending)
    await expect(
      callerFor(ownerId).board.invitations.revoke({
        boardId,
        invitationId: inv.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // it no longer shows up in the pending list
    const listed2 = await callerFor(boardAdminId).board.invitations.list({ boardId });
    expect(listed2.some((r) => r.id === inv.id)).toBe(false);

    // a board viewer cannot even list (member+ required)
    await expect(callerFor(boardViewerId).board.invitations.list({ boardId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ----------------------------------------------------- mine / accept

  it('mine + accept: the invitee sees their pending invitation (token included); accepting joins them to the board (workspace guest + board member, both activities); second accept is BAD_REQUEST; wrong user is FORBIDDEN', async () => {
    const accepterId = freshInviteeId();
    const inv = await inviteFreshEmail(emailOf(accepterId), 'member');
    await materializeUser(accepterId);

    // the invitee's `mine` lists the pending invitation, with the token
    const mine = await callerFor(accepterId).board.invitations.mine();
    const row = mine.find((r) => r.id === inv.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ boardId, role: 'member', boardTitle: 'Invitations Board' });
    expect(row!.token).toBe(inv.token);

    // a different user (email mismatch) cannot accept
    await expect(
      callerFor(mismatchId).board.invitations.accept({ token: inv.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // the invitee accepts → workspace `guest` + board `member`
    const accepted = await callerFor(accepterId).board.invitations.accept({
      token: inv.token,
      clientMutationId: crypto.randomUUID(),
    });
    expect(accepted).toMatchObject({ boardId, role: 'member' });

    const [wsRow] = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, accepterId),
        ),
      )
      .limit(1);
    expect(wsRow).toMatchObject({ role: 'guest' });
    const [bmRow] = await db()
      .select()
      .from(boardMembers)
      .where(dbMod.and(dbMod.eq(boardMembers.boardId, boardId), dbMod.eq(boardMembers.userId, accepterId)))
      .limit(1);
    expect(bmRow).toMatchObject({ role: 'member' });

    const [invAfter] = await db()
      .select()
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.id, inv.id))
      .limit(1);
    expect(invAfter).toMatchObject({ status: 'accepted', acceptedById: accepterId });
    expect(invAfter!.acceptedAt).toBeInstanceOf(Date);

    const wsActs = await wsActsFor(workspaceId);
    expect(
      wsActs.some(
        (a) =>
          a.type === 'workspace.member_added' && (a.payload as { userId?: string }).userId === accepterId,
      ),
    ).toBe(true);
    const acts = await actsFor(boardId);
    expect(
      acts.some(
        (a) => a.type === 'board.member_added' && (a.payload as { userId?: string }).userId === accepterId,
      ),
    ).toBe(true);

    // accepting again → BAD_REQUEST (no longer pending)
    await expect(
      callerFor(accepterId).board.invitations.accept({ token: inv.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // it's gone from `mine`
    const mine2 = await callerFor(accepterId).board.invitations.mine();
    expect(mine2.some((r) => r.id === inv.id)).toBe(false);
  });

  it('accept: an unknown token is NOT_FOUND', async () => {
    await expect(
      callerFor(ownerId).board.invitations.accept({
        token: 'this-token-does-not-exist-0000',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('accept: an expired invitation is BAD_REQUEST and the row is flipped to expired', async () => {
    const accepterId = freshInviteeId();
    const inv = await inviteFreshEmail(emailOf(accepterId), 'member');
    await materializeUser(accepterId);

    // Backdate the expiry so the pre-transaction expiry check trips.
    await db()
      .update(boardInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(dbMod.eq(boardInvitations.id, inv.id));

    await expect(
      callerFor(accepterId).board.invitations.accept({ token: inv.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const [after] = await db()
      .select()
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.id, inv.id))
      .limit(1);
    expect(after).toMatchObject({ status: 'expired' });

    // ...and it does not show up in `mine` (expired invitations are excluded).
    const mine = await callerFor(accepterId).board.invitations.mine();
    expect(mine.some((r) => r.id === inv.id)).toBe(false);
  });

  it('mine: does not return invitations whose expiry has passed (even while still pending)', async () => {
    const inviteeId = freshInviteeId();
    const inv = await inviteFreshEmail(emailOf(inviteeId), 'viewer');
    await materializeUser(inviteeId);

    // Still `pending` in the DB, but its TTL has elapsed.
    await db()
      .update(boardInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(dbMod.eq(boardInvitations.id, inv.id));

    const mine = await callerFor(inviteeId).board.invitations.mine();
    expect(mine.some((r) => r.id === inv.id)).toBe(false);
  });

  it('accept: an invitation for an archived board is BAD_REQUEST', async () => {
    // A separate workspace/board so archiving it doesn't disturb the shared fixture.
    const archWs = await callerFor(ownerId).workspace.create({
      name: 'Archived Board Co',
      slug: newSlug('archived-board-co'),
      clientMutationId: crypto.randomUUID(),
    });
    createdWorkspaceIds.push(archWs.id);
    const archBoard = await callerFor(ownerId).board.create({
      workspaceId: archWs.id,
      title: 'Soon-Archived Board',
      clientMutationId: crypto.randomUUID(),
    });

    const accepterId = freshInviteeId();
    await callerFor(ownerId).board.members.add({
      boardId: archBoard.id,
      email: emailOf(accepterId),
      role: 'member',
      clientMutationId: crypto.randomUUID(),
    });
    const [inv] = await db()
      .select()
      .from(boardInvitations)
      .where(
        dbMod.and(
          dbMod.eq(boardInvitations.boardId, archBoard.id),
          dbMod.eq(boardInvitations.email, emailOf(accepterId)),
        ),
      )
      .limit(1);
    await materializeUser(accepterId);

    await callerFor(ownerId).board.archive({
      boardId: archBoard.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    await expect(
      callerFor(accepterId).board.invitations.accept({ token: inv!.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------- decline

  it('decline: flips status to declined and writes no activity; wrong user is FORBIDDEN; declining again is BAD_REQUEST', async () => {
    const declinerId = freshInviteeId();
    const inv = await inviteFreshEmail(emailOf(declinerId), 'viewer');
    await materializeUser(declinerId);

    // email mismatch → FORBIDDEN
    await expect(
      callerFor(mismatchId).board.invitations.decline({ token: inv.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const declined = await callerFor(declinerId).board.invitations.decline({
      token: inv.token,
      clientMutationId: crypto.randomUUID(),
    });
    expect(declined).toMatchObject({ id: inv.id, status: 'declined' });
    const [after] = await db()
      .select()
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.id, inv.id))
      .limit(1);
    expect(after).toMatchObject({ status: 'declined' });

    // no `board.member_added` for the decliner, no membership
    const bmRows = await db()
      .select()
      .from(boardMembers)
      .where(dbMod.and(dbMod.eq(boardMembers.boardId, boardId), dbMod.eq(boardMembers.userId, declinerId)));
    expect(bmRows).toHaveLength(0);

    // declining again → BAD_REQUEST
    await expect(
      callerFor(declinerId).board.invitations.decline({ token: inv.token, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
