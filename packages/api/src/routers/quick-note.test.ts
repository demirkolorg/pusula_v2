/**
 * Integration tests for the quick-note router (DEM-203 — mobil "Hızlı Not").
 * These hit a real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` +
 * `pnpm db:migrate`). If no database is reachable the suite is skipped rather
 * than failing on a box without infra — same harness as `card.test.ts`.
 *
 * Coverage:
 *  - `list`    — owner-scoped, newest-first, no cross-user leakage.
 *  - `create`  — note created with the caller's `userId`.
 *  - `update`  — owner edits; another user's `noteId` → `NOT_FOUND`.
 *  - `delete`  — owner deletes; another user's `noteId` → silent no-op.
 *  - `convertToCard` — happy path side effects (card + activity + realtime +
 *    `boards.version` bump + note deleted, single transaction), note-ownership
 *    `NOT_FOUND`, board-permission `FORBIDDEN`, archived board/list
 *    `BAD_REQUEST`, and the delete-first idempotency / TOCTOU guard.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  quickNotes,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext, type EnqueueRealtimePublish } from '../context';

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

// Workspace owner, a plain member, a board viewer, and an unrelated outsider.
const ownerId = newId('u-qn-owner');
const memberId = newId('u-qn-member');
const viewerId = newId('u-qn-viewer');
const outsiderId = newId('u-qn-outsider');
const createdUserIds = [ownerId, memberId, viewerId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

/** A caller whose tRPC context carries a (mock) `enqueueRealtimePublish` hook. */
function callerWithRealtime(userId: string, enqueueRealtimePublish: EnqueueRealtimePublish) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({ session: session(userId), db: probe.db, enqueueRealtimePublish }),
  );
}

describe.runIf(dbAvailable)('quickNote router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let archivedListId: string;
  let archivedBoardListId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Quick Note Co',
      slug: newSlug('qn-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: viewerId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'QN Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    // `viewerId` is a workspace guest → give an explicit board `viewer` row.
    await db().insert(boardMembers).values({ boardId, userId: viewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Inbox',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;

    // An archived list on the active board.
    const frozenList = await callerFor(ownerId).list.create({
      boardId,
      title: 'Frozen List',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).list.archive({
      boardId,
      listId: frozenList.id,
      clientMutationId: crypto.randomUUID(),
    });
    archivedListId = frozenList.id;

    // A (still-active) list on a board that then gets archived.
    const archBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    const listOnArch = await callerFor(ownerId).list.create({
      boardId: archBoard.id,
      title: 'List On Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    archivedBoardListId = listOnArch.id;
    await callerFor(ownerId).board.archive({
      boardId: archBoard.id,
      clientMutationId: crypto.randomUUID(),
    });
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db().delete(quickNotes).where(dbMod.eq(quickNotes.userId, id));
    }
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const boardVersion = async (board: string) => {
    const [row] = await db()
      .select({ version: dbMod.boards.version })
      .from(dbMod.boards)
      .where(dbMod.eq(dbMod.boards.id, board))
      .limit(1);
    return row!.version;
  };
  const noteRow = async (noteId: string) => {
    const [row] = await db()
      .select()
      .from(quickNotes)
      .where(dbMod.eq(quickNotes.id, noteId))
      .limit(1);
    return row;
  };

  // ------------------------------------------------------------------ list

  it('list: returns only the caller\'s own notes, newest first; another user\'s note is invisible', async () => {
    const a = await callerFor(memberId).quickNote.create({ content: 'member note A' });
    const b = await callerFor(memberId).quickNote.create({ content: 'member note B' });
    // a note owned by a different user — must never appear in `member`'s list
    await callerFor(ownerId).quickNote.create({ content: 'owner private note' });

    const list = await callerFor(memberId).quickNote.list();
    const ids = list.map((n) => n.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // newest-first: B (created after A) precedes A
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    // every returned note belongs to the caller (no cross-user leakage)
    const ownerList = await callerFor(ownerId).quickNote.list();
    const ownerIds = new Set(ownerList.map((n) => n.id));
    expect(ownerIds.has(a.id)).toBe(false);
    expect(ownerIds.has(b.id)).toBe(false);
  });

  it('list: a user with no notes gets an empty array', async () => {
    const list = await callerFor(outsiderId).quickNote.list();
    expect(list).toEqual([]);
  });

  // ---------------------------------------------------------------- create

  it('create: the note is owned by the session user and carries the trimmed content', async () => {
    const created = await callerFor(memberId).quickNote.create({ content: '  capture this  ' });
    expect(created).toMatchObject({ content: 'capture this' });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeInstanceOf(Date);

    const row = await noteRow(created.id);
    expect(row?.userId).toBe(memberId); // userId comes from the session, not input
  });

  // ---------------------------------------------------------------- update

  it('update: the owner edits the body', async () => {
    const created = await callerFor(memberId).quickNote.create({ content: 'before edit' });
    const updated = await callerFor(memberId).quickNote.update({
      noteId: created.id,
      content: '  after edit  ',
    });
    expect(updated).toMatchObject({ id: created.id, content: 'after edit' });
  });

  it('update: another user\'s noteId is NOT_FOUND (existence is not leaked)', async () => {
    const created = await callerFor(memberId).quickNote.create({ content: 'member only' });
    await expect(
      callerFor(ownerId).quickNote.update({ noteId: created.id, content: 'hax' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // the note is untouched
    expect((await noteRow(created.id))?.content).toBe('member only');
  });

  it('update: an unknown noteId is NOT_FOUND', async () => {
    await expect(
      callerFor(memberId).quickNote.update({ noteId: 'qn_does_not_exist', content: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------- delete

  it('delete: the owner removes the note', async () => {
    const created = await callerFor(memberId).quickNote.create({ content: 'delete me' });
    const result = await callerFor(memberId).quickNote.delete({ noteId: created.id });
    expect(result).toEqual({ success: true });
    expect(await noteRow(created.id)).toBeUndefined();
  });

  it('delete: another user\'s noteId is a silent no-op (idempotent, returns success)', async () => {
    const created = await callerFor(memberId).quickNote.create({ content: 'survives' });
    const result = await callerFor(ownerId).quickNote.delete({ noteId: created.id });
    expect(result).toEqual({ success: true });
    // the note still exists — the other user could not delete it
    expect((await noteRow(created.id))?.content).toBe('survives');
  });

  it('delete: an unknown noteId is a silent no-op (idempotent)', async () => {
    const result = await callerFor(memberId).quickNote.delete({ noteId: 'qn_missing' });
    expect(result).toEqual({ success: true });
  });

  // ------------------------------------------------------------ convertToCard

  it('convertToCard: creates a card titled with the note content, writes a card.created activity + realtime event, bumps boards.version, and deletes the note — one transaction', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'become a card' });
    const v0 = await boardVersion(boardId);
    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();

    const card = await callerWithRealtime(memberId, enqueue).quickNote.convertToCard({
      noteId: note.id,
      listId,
      clientMutationId: cmid,
    });

    // card created with the note's content as the title, on the target list/board
    expect(card).toMatchObject({ listId, boardId, title: 'become a card' });
    expect(card.boardId).toBe(boardId); // card ⊆ list.board invariant

    // the note is deleted (delete-first)
    expect(await noteRow(note.id)).toBeUndefined();

    // boards.version bumped exactly once (the card-creation step)
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // a card.created activity row for this card
    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.cardId, card.id));
    const created = acts.filter((a) => a.type === 'card.created');
    expect(created).toHaveLength(1);
    expect(created[0]?.actorId).toBe(memberId);
    expect(created[0]?.payload).toMatchObject({ cardId: card.id, listId, title: 'become a card' });

    // a card.created realtime outbox row + enqueue called after commit
    const rt = await db()
      .select()
      .from(realtimeEvents)
      .where(dbMod.eq(realtimeEvents.cardId, card.id));
    const rtCreated = rt.filter((r) => r.type === 'card.created');
    expect(rtCreated).toHaveLength(1);
    expect(rtCreated[0]).toMatchObject({ boardId, actorId: memberId, clientMutationId: cmid });
    expect(enqueue).toHaveBeenCalledWith({ eventId: rtCreated[0]!.id });
  });

  it('convertToCard: another user\'s noteId is NOT_FOUND and no card is created', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'not yours' });
    const v0 = await boardVersion(boardId);

    await expect(
      callerFor(ownerId).quickNote.convertToCard({
        noteId: note.id,
        listId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // the note is untouched and no version bump happened
    expect((await noteRow(note.id))?.content).toBe('not yours');
    expect(await boardVersion(boardId)).toBe(v0);
  });

  it('convertToCard: a board viewer is FORBIDDEN and the note is not consumed (transaction rolled back)', async () => {
    const note = await callerFor(viewerId).quickNote.create({ content: 'viewer note' });

    await expect(
      callerFor(viewerId).quickNote.convertToCard({
        noteId: note.id,
        listId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // delete-first happened inside the transaction, but the FORBIDDEN throw
    // rolls it back — the note must still exist.
    expect((await noteRow(note.id))?.content).toBe('viewer note');
  });

  it('convertToCard: an outsider with no workspace membership is FORBIDDEN; the note survives', async () => {
    const note = await callerFor(outsiderId).quickNote.create({ content: 'outsider note' });

    await expect(
      callerFor(outsiderId).quickNote.convertToCard({
        noteId: note.id,
        listId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect((await noteRow(note.id))?.content).toBe('outsider note');
  });

  it('convertToCard: an unknown listId is NOT_FOUND; the note survives (rollback)', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'no list' });

    await expect(
      callerFor(memberId).quickNote.convertToCard({
        noteId: note.id,
        listId: 'list_does_not_exist',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect((await noteRow(note.id))?.content).toBe('no list');
  });

  it('convertToCard: an archived list target is BAD_REQUEST; the note survives (rollback)', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'frozen list target' });

    await expect(
      callerFor(memberId).quickNote.convertToCard({
        noteId: note.id,
        listId: archivedListId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect((await noteRow(note.id))?.content).toBe('frozen list target');
  });

  it('convertToCard: an archived board target is BAD_REQUEST; the note survives (rollback)', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'archived board target' });

    await expect(
      callerFor(memberId).quickNote.convertToCard({
        noteId: note.id,
        listId: archivedBoardListId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect((await noteRow(note.id))?.content).toBe('archived board target');
  });

  it('convertToCard: a second call with the same (now-deleted) noteId is NOT_FOUND — delete-first idempotency / TOCTOU guard', async () => {
    const note = await callerFor(memberId).quickNote.create({ content: 'one note one card' });

    const card = await callerFor(memberId).quickNote.convertToCard({
      noteId: note.id,
      listId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(card.title).toBe('one note one card');

    // the note is gone; converting it again must not create a second card
    await expect(
      callerFor(memberId).quickNote.convertToCard({
        noteId: note.id,
        listId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
