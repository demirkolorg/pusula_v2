/**
 * Integration tests for the comment router (Phase 2.5A / DEM-50). These hit a
 * real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm
 * db:migrate`). If no database is reachable the suite is skipped rather than
 * failing on a box without infra. Mirrors `card.test.ts`'s DB-probe pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  comments,
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

// Workspace owner, a plain member, an admin (board admin via workspace admin), a
// board viewer (workspace guest), and an outsider.
const ownerId = newId('u-cm-owner');
const memberId = newId('u-cm-member');
const adminId = newId('u-cm-admin');
const guestId = newId('u-cm-guest');
const outsiderId = newId('u-cm-outsider');
const createdUserIds = [ownerId, memberId, adminId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('comment router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let otherCardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Comment Co',
      slug: newSlug('comment-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: guestId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Comment Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: guestId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;

    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Discussed card',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;
    const otherCard = await callerFor(ownerId).card.create({
      listId,
      title: 'Other card',
      clientMutationId: crypto.randomUUID(),
    });
    otherCardId = otherCard.id;
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

  // ---------------------------------------------------------------- create

  it('create: a member adds a comment; comment.created activity; boards.version bumps; a board viewer is FORBIDDEN', async () => {
    const v0 = await boardVersion(boardId);

    const created = await callerFor(memberId).comment.create({
      cardId,
      body: '  First comment  ',
      clientMutationId: crypto.randomUUID(),
    });
    expect(created).toMatchObject({ cardId, authorId: memberId, body: 'First comment' });
    expect(created.editedAt).toBeNull();
    expect(created.deletedAt).toBeNull();
    expect(created.id).toBeTruthy();

    const acts = await actsFor(boardId);
    const createdActs = acts.filter(
      (a) =>
        a.type === 'comment.created' &&
        (a.payload as { commentId?: string }).commentId === created.id,
    );
    expect(createdActs).toHaveLength(1);
    expect(createdActs[0]?.payload).toMatchObject({ commentId: created.id, cardId });
    expect(createdActs[0]?.cardId).toBe(cardId);

    expect(await boardVersion(boardId)).toBe(v0 + 1);

    await expect(
      callerFor(guestId).comment.create({
        cardId,
        body: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ------------------------------------------------------------------ list

  it("list: returns a card's comments in ascending created_at order, including soft-deleted (empty-body) rows", async () => {
    const a = await callerFor(memberId).comment.create({
      cardId,
      body: 'alpha',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(ownerId).comment.create({
      cardId,
      body: 'bravo',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(memberId).comment.delete({
      cardId,
      commentId: a.id,
      clientMutationId: crypto.randomUUID(),
    });

    const list = await callerFor(guestId).comment.list({ cardId });
    const ids = list.map((c) => c.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // ascending by createdAt
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.createdAt.getTime()).toBeLessThanOrEqual(list[i]!.createdAt.getTime());
    }
    const deleted = list.find((c) => c.id === a.id)!;
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.body).toBe('');
  });

  // ---------------------------------------------------------------- update

  it('update: the author edits a comment (comment.updated, version+1); same body is idempotent; a non-author non-admin is FORBIDDEN; a board admin may edit it; a viewer is FORBIDDEN', async () => {
    const c = await callerFor(memberId).comment.create({
      cardId,
      body: 'editable',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const edited = await callerFor(memberId).comment.update({
      cardId,
      commentId: c.id,
      body: 'edited by author',
      clientMutationId: crypto.randomUUID(),
    });
    expect(edited).toMatchObject({ id: c.id, body: 'edited by author', changed: true });
    expect(edited.editedAt).toBeInstanceOf(Date);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // same body again → idempotent no-op (no activity, no version bump)
    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).comment.update({
      cardId,
      commentId: c.id,
      body: 'edited by author',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: c.id, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    // a board viewer cannot edit at all
    await expect(
      callerFor(guestId).comment.update({
        cardId,
        commentId: c.id,
        body: 'hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // a plain member who is not the author is FORBIDDEN
    const byAdmin = await callerFor(adminId).comment.create({
      cardId,
      body: 'admin owns this',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).comment.update({
        cardId,
        commentId: byAdmin.id,
        body: 'member tampering',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // a board admin (workspace admin) may edit another user's comment
    const adminEdited = await callerFor(adminId).comment.update({
      cardId,
      commentId: c.id,
      body: 'edited by admin',
      clientMutationId: crypto.randomUUID(),
    });
    expect(adminEdited).toMatchObject({ id: c.id, body: 'edited by admin', changed: true });

    const acts = await actsFor(boardId);
    expect(
      acts.filter(
        (a) =>
          a.type === 'comment.updated' && (a.payload as { commentId?: string }).commentId === c.id,
      ),
    ).toHaveLength(2);
  });

  it('update: editing a soft-deleted comment is BAD_REQUEST', async () => {
    const c = await callerFor(memberId).comment.create({
      cardId,
      body: 'doomed',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(memberId).comment.delete({
      cardId,
      commentId: c.id,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).comment.update({
        cardId,
        commentId: c.id,
        body: 'zombie',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------- delete

  it('delete: the author soft-deletes (deletedAt set, body cleared, comment.deleted, version+1); idempotent; a non-author non-admin is FORBIDDEN; a board admin may delete it', async () => {
    const c = await callerFor(memberId).comment.create({
      cardId,
      body: 'remove me',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const deleted = await callerFor(memberId).comment.delete({
      cardId,
      commentId: c.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(deleted).toMatchObject({ id: c.id, changed: true });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const [row] = await db()
      .select({ body: comments.body, deletedAt: comments.deletedAt })
      .from(comments)
      .where(dbMod.eq(comments.id, c.id))
      .limit(1);
    expect(row!.body).toBe('');
    expect(row!.deletedAt).toBeInstanceOf(Date);

    // idempotent
    const noop = await callerFor(memberId).comment.delete({
      cardId,
      commentId: c.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: c.id, changed: false });

    // a plain member cannot delete someone else's comment; a board admin can
    const byAdmin = await callerFor(adminId).comment.create({
      cardId,
      body: 'admin owns this',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).comment.delete({
        cardId,
        commentId: byAdmin.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const byAdminDeleted = await callerFor(ownerId).comment.delete({
      cardId,
      commentId: byAdmin.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(byAdminDeleted).toMatchObject({ id: byAdmin.id, changed: true });

    const acts = await actsFor(boardId);
    expect(
      acts.filter(
        (a) =>
          a.type === 'comment.deleted' && (a.payload as { commentId?: string }).commentId === c.id,
      ),
    ).toHaveLength(1);
  });

  // --------------------------------------------------------- cross-card guard

  it('NOT_FOUND: a commentId belonging to another card cannot be updated or deleted via this card', async () => {
    const onOther = await callerFor(ownerId).comment.create({
      cardId: otherCardId,
      body: 'lives on the other card',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).comment.update({
        cardId,
        commentId: onOther.id,
        body: 'hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      callerFor(ownerId).comment.delete({
        cardId,
        commentId: onOther.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // -------------------------------------------------------------- outsider

  it('an outsider (not a workspace member) can neither list nor create comments (FORBIDDEN)', async () => {
    await expect(callerFor(outsiderId).comment.list({ cardId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      callerFor(outsiderId).comment.create({
        cardId,
        body: 'sneaky',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // --------------------------------------------------------- archived board

  it('create: an archived board rejects new comments (BAD_REQUEST)', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived (comments)',
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
      callerFor(ownerId).comment.create({
        cardId: cardOnOther.id,
        body: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
