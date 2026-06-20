/**
 * Integration tests for the card-members router (Phase 2.5B / DEM-51). These hit
 * a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm
 * db:migrate`). If no database is reachable the suite is skipped rather than
 * failing on a box without infra. Mirrors `card.test.ts`'s DB-probe pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
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

// Workspace owner; a plain workspace member (no board membership → effective
// board `member`); a workspace guest who *is* a board `viewer`; a workspace
// guest with *no* board membership (board-unreachable candidate); an outsider.
const ownerId = newId('u-cmb-owner');
const memberId = newId('u-cmb-member');
const guestViewerId = newId('u-cmb-guestviewer');
const guestNonBoardId = newId('u-cmb-guestnoboard');
const outsiderId = newId('u-cmb-outsider');
const createdUserIds = [ownerId, memberId, guestViewerId, guestNonBoardId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('card-members router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Card Members Co',
      slug: newSlug('card-members-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: guestViewerId, role: 'guest' },
        { workspaceId, userId: guestNonBoardId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Card Members Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: guestViewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;

    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Card with members',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const actsFor = (board: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, board));
  const boardVersion = async (board: string) => {
    const [row] = await db()
      .select({ version: dbMod.boards.version })
      .from(dbMod.boards)
      .where(dbMod.eq(dbMod.boards.id, board))
      .limit(1);
    return row!.version;
  };

  // ------------------------------------------------------------------- add

  it('add: a member assigns another member (card.member_added, version+1); idempotent re-add is changed:false', async () => {
    const v0 = await boardVersion(boardId);

    const added = await callerFor(memberId).card.members.add({
      cardId,
      userId: ownerId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    expect(added).toMatchObject({ cardId, userId: ownerId, role: 'assignee', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const addedActs = acts.filter(
      (a) =>
        a.type === 'card.member_added' &&
        (a.payload as { userId?: string; role?: string }).userId === ownerId &&
        (a.payload as { role?: string }).role === 'assignee',
    );
    expect(addedActs).toHaveLength(1);
    // Bildirim detay / audit (2026-06-20) — member_added carries the target
    // user's display name (the seed sets `name === id`).
    expect(addedActs[0]?.payload).toMatchObject({
      cardId,
      userId: ownerId,
      role: 'assignee',
      targetUserName: ownerId,
    });
    expect(addedActs[0]?.cardId).toBe(cardId);

    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).card.members.add({
      cardId,
      userId: ownerId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ cardId, userId: ownerId, role: 'assignee', changed: false });
    expect(await boardVersion(boardId)).toBe(v1);
  });

  it('add: self-add is rejected for any role (DEM-298) — viewer, member, owner all FORBIDDEN', async () => {
    // a viewer cannot make themselves a watcher (old self-watch loophole closed).
    await expect(
      callerFor(guestViewerId).card.members.add({
        cardId,
        userId: guestViewerId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // a viewer cannot make themselves an assignee either.
    await expect(
      callerFor(guestViewerId).card.members.add({
        cardId,
        userId: guestViewerId,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // a board member/owner cannot add themselves either.
    await expect(
      callerFor(memberId).card.members.add({
        cardId,
        userId: memberId,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(ownerId).card.members.add({
        cardId,
        userId: ownerId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // a viewer also cannot add anyone else (permission rule still applies).
    await expect(
      callerFor(guestViewerId).card.members.add({
        cardId,
        userId: ownerId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('add: a workspace guest who *is* a board member via an explicit board_members row can be added as a card member (effectiveBoardRole !== null)', async () => {
    // guestViewerId is a workspace `guest` but has an explicit `board_members`
    // row (`viewer`) on this board — so the candidate's effective board role is
    // non-null and a board `member+` caller may add them to the card.
    const v0 = await boardVersion(boardId);

    const added = await callerFor(memberId).card.members.add({
      cardId,
      userId: guestViewerId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    expect(added).toMatchObject({ cardId, userId: guestViewerId, role: 'assignee', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const addedActs = acts.filter(
      (a) =>
        a.type === 'card.member_added' &&
        (a.payload as { userId?: string; role?: string }).userId === guestViewerId &&
        (a.payload as { role?: string }).role === 'assignee',
    );
    expect(addedActs).toHaveLength(1);
    expect(addedActs[0]?.payload).toMatchObject({
      cardId,
      userId: guestViewerId,
      role: 'assignee',
    });
    expect(addedActs[0]?.cardId).toBe(cardId);
  });

  it('add: a candidate with no board access (workspace guest, no board membership) is BAD_REQUEST', async () => {
    await expect(
      callerFor(memberId).card.members.add({
        cardId,
        userId: guestNonBoardId,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('add: a candidate who is not a workspace member at all is BAD_REQUEST', async () => {
    await expect(
      callerFor(memberId).card.members.add({
        cardId,
        userId: outsiderId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('add: an outsider (not a workspace member) cannot add members at all (FORBIDDEN)', async () => {
    await expect(
      callerFor(outsiderId).card.members.add({
        cardId,
        userId: outsiderId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------- remove

  it('remove: a member removes another member (card.member_removed, version+1); idempotent re-remove is changed:false', async () => {
    // The viewer/member who'll be removed can't self-add (DEM-298), so the
    // owner sets up the row instead.
    await callerFor(ownerId).card.members.add({
      cardId,
      userId: memberId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const removed = await callerFor(ownerId).card.members.remove({
      cardId,
      userId: memberId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    expect(removed).toMatchObject({ cardId, userId: memberId, role: 'assignee', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const v1 = await boardVersion(boardId);
    const noop = await callerFor(ownerId).card.members.remove({
      cardId,
      userId: memberId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ cardId, userId: memberId, role: 'assignee', changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    const acts = await actsFor(boardId);
    const removedActs = acts.filter(
      (a) =>
        a.type === 'card.member_removed' &&
        (a.payload as { userId?: string }).userId === memberId &&
        (a.payload as { role?: string }).role === 'assignee',
    );
    expect(removedActs).toHaveLength(1);
    // Bildirim detay / audit (2026-06-20) — member_removed reads the removed
    // user's display name before/while detaching (seed sets `name === id`).
    expect(removedActs[0]?.payload).toMatchObject({ targetUserName: memberId });
  });

  it('remove: a board viewer may remove *themselves* (a watcher someone else added) — self-leave still allowed (DEM-298)', async () => {
    // A board member adds the viewer as a watcher (viewer cannot self-add
    // since DEM-298 — but someone else can add them, and self-leave must still
    // work so the viewer can opt out of notifications).
    await callerFor(memberId).card.members.add({
      cardId,
      userId: guestViewerId,
      role: 'watcher',
      clientMutationId: crypto.randomUUID(),
    });

    const removed = await callerFor(guestViewerId).card.members.remove({
      cardId,
      userId: guestViewerId,
      role: 'watcher',
      clientMutationId: crypto.randomUUID(),
    });
    expect(removed).toMatchObject({
      cardId,
      userId: guestViewerId,
      role: 'watcher',
      changed: true,
    });

    // a viewer cannot remove someone else
    await callerFor(memberId).card.members.add({
      cardId,
      userId: ownerId,
      role: 'watcher',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(guestViewerId).card.members.remove({
        cardId,
        userId: ownerId,
        role: 'watcher',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ------------------------------------------------------------------ list

  it("list: returns the card's members joined with the display name only (no e-mail); a board viewer may read it", async () => {
    // ensure a known set: owner=assignee (from an earlier test) + owner=watcher (just added)
    const rows = await callerFor(guestViewerId).card.members.list({ cardId });
    const ownerAssignee = rows.find((r) => r.userId === ownerId && r.role === 'assignee');
    const ownerWatcher = rows.find((r) => r.userId === ownerId && r.role === 'watcher');
    expect(ownerAssignee).toBeTruthy();
    expect(ownerAssignee?.name).toBe(ownerId);
    // e-mail must not leak to board viewers — only `{ userId, role, name }` is returned.
    expect(ownerAssignee).not.toHaveProperty('email');
    expect(ownerWatcher).toBeTruthy();
  });

  // --------------------------------------------------------- archived board

  it('add: an archived board rejects new card members (BAD_REQUEST)', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived (card members)',
      clientMutationId: crypto.randomUUID(),
    });
    const listOnOther = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'List',
      clientMutationId: crypto.randomUUID(),
    });
    const cardOnOther = await callerFor(ownerId).card.create({
      listId: listOnOther.id,
      title: 'Card on other',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).board.archive({
      boardId: otherBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).card.members.add({
        cardId: cardOnOther.id,
        userId: memberId,
        role: 'assignee',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
