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
    const updatedActs = acts.filter(
      (a) =>
        a.type === 'comment.updated' && (a.payload as { commentId?: string }).commentId === c.id,
    );
    expect(updatedActs).toHaveLength(2);
    // Bildirim detay / audit (2026-06-20) — comment.updated carries before/after
    // body wrapped in the truncate shape `{ value }`. The two edits were
    // editable → "edited by author" → "edited by admin" (row order is not
    // guaranteed, so match by body content).
    const bodies = updatedActs.map((a) => a.payload as { fromBody?: unknown; toBody?: unknown });
    expect(bodies).toContainEqual(
      expect.objectContaining({
        fromBody: { value: 'editable' },
        toBody: { value: 'edited by author' },
      }),
    );
    expect(bodies).toContainEqual(
      expect.objectContaining({
        fromBody: { value: 'edited by author' },
        toBody: { value: 'edited by admin' },
      }),
    );
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
    const deletedActs = acts.filter(
      (a) =>
        a.type === 'comment.deleted' && (a.payload as { commentId?: string }).commentId === c.id,
    );
    expect(deletedActs).toHaveLength(1);
    // Bildirim detay / audit (2026-06-20) — comment.deleted captures the body
    // *before* it is cleared, wrapped in the truncate shape.
    expect(deletedActs[0]?.payload).toMatchObject({ deletedBody: { value: 'remove me' } });
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

  // ------------------------------------------------- checklist item comments

  it('create+list: a checklist-item comment is threaded under the item, not the card; card-level list excludes it and the item list excludes card-level comments', async () => {
    // A checklist + item on the main card.
    const checklist = await callerFor(ownerId).checklist.create({
      cardId,
      title: 'Acceptance',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(ownerId).checklist.item.create({
      cardId,
      checklistId: checklist.id,
      content: 'Ship it',
      clientMutationId: crypto.randomUUID(),
    });

    const cardLevel = await callerFor(memberId).comment.create({
      cardId,
      body: 'card-level note',
      clientMutationId: crypto.randomUUID(),
    });
    const onItem = await callerFor(memberId).comment.create({
      cardId,
      checklistItemId: item.id,
      body: 'item-level note',
      clientMutationId: crypto.randomUUID(),
    });
    expect(onItem).toMatchObject({ cardId, checklistItemId: item.id, body: 'item-level note' });

    // Card-level thread excludes the item comment.
    const cardThread = await callerFor(guestId).comment.list({ cardId });
    const cardThreadIds = cardThread.map((c) => c.id);
    expect(cardThreadIds).toContain(cardLevel.id);
    expect(cardThreadIds).not.toContain(onItem.id);

    // Item thread contains only the item comment.
    const itemThread = await callerFor(guestId).comment.list({ cardId, checklistItemId: item.id });
    const itemThreadIds = itemThread.map((c) => c.id);
    expect(itemThreadIds).toContain(onItem.id);
    expect(itemThreadIds).not.toContain(cardLevel.id);
    expect(itemThread.every((c) => c.checklistItemId === item.id)).toBe(true);
  });

  it('NOT_FOUND: a checklistItemId that lives on another card cannot receive a comment via this card', async () => {
    const otherChecklist = await callerFor(ownerId).checklist.create({
      cardId: otherCardId,
      title: 'Other checklist',
      clientMutationId: crypto.randomUUID(),
    });
    const otherItem = await callerFor(ownerId).checklist.item.create({
      cardId: otherCardId,
      checklistId: otherChecklist.id,
      content: 'Belongs elsewhere',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(ownerId).comment.create({
        cardId,
        checklistItemId: otherItem.id,
        body: 'cross-card attempt',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checklist.list: per-item commentCount counts non-deleted item comments only', async () => {
    const checklist = await callerFor(ownerId).checklist.create({
      cardId,
      title: 'Counted',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(ownerId).checklist.item.create({
      cardId,
      checklistId: checklist.id,
      content: 'Has comments',
      clientMutationId: crypto.randomUUID(),
    });

    const c1 = await callerFor(memberId).comment.create({
      cardId,
      checklistItemId: item.id,
      body: 'one',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(memberId).comment.create({
      cardId,
      checklistItemId: item.id,
      body: 'two',
      clientMutationId: crypto.randomUUID(),
    });
    // A card-level comment must NOT inflate the item count.
    await callerFor(memberId).comment.create({
      cardId,
      body: 'card-level, not counted',
      clientMutationId: crypto.randomUUID(),
    });

    const afterTwo = await callerFor(guestId).checklist.list({ cardId });
    const itemAfterTwo = afterTwo
      .find((cl) => cl.id === checklist.id)!
      .items.find((i) => i.id === item.id)!;
    expect(itemAfterTwo.commentCount).toBe(2);

    // Soft-deleting one drops the count to 1.
    await callerFor(memberId).comment.delete({
      cardId,
      commentId: c1.id,
      clientMutationId: crypto.randomUUID(),
    });
    const afterDelete = await callerFor(guestId).checklist.list({ cardId });
    const itemAfterDelete = afterDelete
      .find((cl) => cl.id === checklist.id)!
      .items.find((i) => i.id === item.id)!;
    expect(itemAfterDelete.commentCount).toBe(1);
  });

  it('cascade: deleting a checklist item removes its comments (FK on delete cascade)', async () => {
    const checklist = await callerFor(ownerId).checklist.create({
      cardId,
      title: 'Doomed checklist',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(ownerId).checklist.item.create({
      cardId,
      checklistId: checklist.id,
      content: 'Doomed item',
      clientMutationId: crypto.randomUUID(),
    });
    const onItem = await callerFor(memberId).comment.create({
      cardId,
      checklistItemId: item.id,
      body: 'goes away with the item',
      clientMutationId: crypto.randomUUID(),
    });

    await callerFor(ownerId).checklist.item.delete({
      cardId,
      checklistId: checklist.id,
      itemId: item.id,
      clientMutationId: crypto.randomUUID(),
    });

    const [row] = await db()
      .select({ id: comments.id })
      .from(comments)
      .where(dbMod.eq(comments.id, onItem.id))
      .limit(1);
    expect(row).toBeUndefined();
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
