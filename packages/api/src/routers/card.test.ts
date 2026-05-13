/**
 * Integration tests for the card router (Phase 2C / DEM-36). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, cardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
import { positionBetween, POSITION_COMPACTION_MAX_LEN } from '@pusula/domain';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext, type EnqueueCompaction } from '../context';

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

// Workspace owner, a plain member, a guest (board viewer), and an outsider.
const ownerId = newId('u-ca-owner');
const memberId = newId('u-ca-member');
const guestId = newId('u-ca-guest');
const outsiderId = newId('u-ca-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

/** A caller whose tRPC context carries a (mock) `enqueueCompaction` hook. */
function callerWithEnqueue(userId: string, enqueueCompaction: EnqueueCompaction) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db, enqueueCompaction }));
}

describe.runIf(dbAvailable)('card router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Card Co',
      slug: newSlug('card-co'),
      clientMutationId: newId('cmid'),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: guestId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Card Board',
      clientMutationId: newId('cmid'),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: guestId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: newId('cmid'),
    });
    listId = list.id;
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

  it('create: a member appends cards to a list in ascending position order; card.created activity; card.boardId === list.boardId; boards.version bumps', async () => {
    const v0 = await boardVersion(boardId);

    const first = await callerFor(memberId).card.create({
      listId,
      title: 'First card',
      clientMutationId: newId('cmid'),
    });
    expect(first).toMatchObject({ listId, boardId, title: 'First card' });
    expect(first.boardId).toBe(boardId); // card ⊆ list.board invariant
    expect(first.archivedAt).toBeNull();
    expect(first.description).toBeNull();
    expect(first.dueAt).toBeNull();

    const second = await callerFor(memberId).card.create({
      listId,
      title: 'Second card',
      clientMutationId: newId('cmid'),
    });
    expect(first.position < second.position).toBe(true);

    const acts = await actsFor(boardId);
    const created = acts.filter(
      (a) => a.type === 'card.created' && (a.payload as { cardId?: string }).cardId === first.id,
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.payload).toMatchObject({ cardId: first.id, listId, title: 'First card' });
    expect(created[0]?.cardId).toBe(first.id);

    expect(await boardVersion(boardId)).toBe(v0 + 2);
  });

  it('create: a board viewer is FORBIDDEN; an unknown listId is NOT_FOUND', async () => {
    await expect(
      callerFor(guestId).card.create({ listId, title: 'Nope', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(memberId).card.create({
        listId: 'does-not-exist',
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('create: an archived list rejects new cards; an archived board rejects new cards (BAD_REQUEST)', async () => {
    // archived list on the active board
    const archivedList = await callerFor(ownerId).list.create({
      boardId,
      title: 'Frozen List',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).list.archive({
      boardId,
      listId: archivedList.id,
      clientMutationId: newId('cmid'),
    });
    await expect(
      callerFor(ownerId).card.create({
        listId: archivedList.id,
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a list on an archived board
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived',
      clientMutationId: newId('cmid'),
    });
    const listOnOther = await callerFor(ownerId).list.create({
      boardId: otherBoard.id,
      title: 'List On Other',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).board.archive({ boardId: otherBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).card.create({
        listId: listOnOther.id,
        title: 'Nope',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ------------------------------------------------------------------- get

  it('get: a board member receives the card + relations; an unknown cardId is NOT_FOUND; an outsider is FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Readable card',
      clientMutationId: newId('cmid'),
    });
    // give the member an `assignee` relationship
    await db().insert(cardMembers).values({ cardId: card.id, userId: memberId, role: 'assignee' });

    const seenByMember = await callerFor(memberId).card.get({ cardId: card.id });
    expect(seenByMember.card).toMatchObject({ id: card.id, boardId, listId, title: 'Readable card' });
    expect(seenByMember.relations).toEqual(['assignee']);

    // a board viewer (guest) can read it too, with no relations
    const seenByViewer = await callerFor(guestId).card.get({ cardId: card.id });
    expect(seenByViewer.card.id).toBe(card.id);
    expect(seenByViewer.relations).toEqual([]);

    await expect(callerFor(ownerId).card.get({ cardId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(callerFor(outsiderId).card.get({ cardId: card.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ---------------------------------------------------------------- update

  it('update: title → card.renamed; description → card.description_changed; dueAt set → card.due_set, dueAt:null → card.due_cleared; empty input → BAD_REQUEST; viewer → FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Editable card',
      clientMutationId: newId('cmid'),
    });

    // empty input → BAD_REQUEST
    await expect(
      callerFor(ownerId).card.update({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a board viewer cannot edit
    await expect(
      callerFor(guestId).card.update({
        cardId: card.id,
        title: 'Hax',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // rename
    const vBeforeRename = await boardVersion(boardId);
    const renamed = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Renamed card',
      clientMutationId: newId('cmid'),
    });
    expect(renamed).toMatchObject({ id: card.id, title: 'Renamed card', changed: true });
    expect(await boardVersion(boardId)).toBe(vBeforeRename + 1);

    // same title again → idempotent no-op
    const noop = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Renamed card',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: card.id, changed: false });

    // description
    const withDescription = await callerFor(memberId).card.update({
      cardId: card.id,
      description: 'Some details here.',
      clientMutationId: newId('cmid'),
    });
    expect(withDescription).toMatchObject({ description: 'Some details here.', changed: true });

    // dueAt set
    const due = new Date('2026-12-31T09:00:00.000Z');
    const withDue = await callerFor(memberId).card.update({
      cardId: card.id,
      dueAt: due,
      clientMutationId: newId('cmid'),
    });
    expect(withDue.changed).toBe(true);
    expect(withDue.dueAt?.getTime()).toBe(due.getTime());

    // dueAt cleared
    const cleared = await callerFor(memberId).card.update({
      cardId: card.id,
      dueAt: null,
      clientMutationId: newId('cmid'),
    });
    expect(cleared).toMatchObject({ dueAt: null, changed: true });

    const acts = await actsFor(boardId);
    const forCard = (t: string) =>
      acts.filter((a) => a.type === t && (a.payload as { cardId?: string }).cardId === card.id);
    expect(forCard('card.renamed')).toHaveLength(1);
    expect(forCard('card.renamed')[0]?.payload).toMatchObject({
      fromTitle: 'Editable card',
      toTitle: 'Renamed card',
    });
    expect(forCard('card.description_changed')).toHaveLength(1);
    expect(forCard('card.due_set')).toHaveLength(1);
    expect(forCard('card.due_cleared')).toHaveLength(1);
    // every activity row for this card carries cardId on the column too
    expect(acts.filter((a) => a.cardId === card.id).length).toBeGreaterThanOrEqual(5);
  });

  it('update: a combined title + description update writes both activity rows but bumps version once', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Combo card',
      clientMutationId: newId('cmid'),
    });
    const v0 = await boardVersion(boardId);
    const updated = await callerFor(memberId).card.update({
      cardId: card.id,
      title: 'Combo card v2',
      description: 'Now with a description.',
      clientMutationId: newId('cmid'),
    });
    expect(updated).toMatchObject({ title: 'Combo card v2', description: 'Now with a description.', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const forCard = (t: string) =>
      acts.filter((a) => a.type === t && (a.payload as { cardId?: string }).cardId === card.id);
    expect(forCard('card.renamed')).toHaveLength(1);
    expect(forCard('card.description_changed')).toHaveLength(1);
  });

  // --------------------------------------------------------------- archive

  it('archive: a member archives + restores a card; idempotent no-op; card.archived activity is written', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Archive Me card',
      clientMutationId: newId('cmid'),
    });

    const archived = await callerFor(memberId).card.archive({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(archived).toMatchObject({ id: card.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const noop = await callerFor(memberId).card.archive({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: card.id, changed: false });

    const restored = await callerFor(memberId).card.archive({
      cardId: card.id,
      archived: false,
      clientMutationId: newId('cmid'),
    });
    expect(restored).toMatchObject({ id: card.id, archivedAt: null, changed: true });

    const acts = await actsFor(boardId);
    const archivedActs = acts.filter(
      (a) => a.type === 'card.archived' && (a.payload as { cardId?: string }).cardId === card.id,
    );
    expect(archivedActs).toHaveLength(2);
    expect(archivedActs.map((a) => (a.payload as { archived?: boolean }).archived).sort()).toEqual([
      false,
      true,
    ]);
  });

  // -------------------------------------------------------------- complete (DEM-66)

  it('complete: a member completes a card (completed/completedAt/completedBy set); card.completed activity; version bumps; second complete is an idempotent no-op', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Complete Me card',
      clientMutationId: newId('cmid'),
    });
    expect(card.completed).toBe(false);
    expect(card.completedAt).toBeNull();
    expect(card.completedBy).toBeNull();

    const v0 = await boardVersion(boardId);
    const before = Date.now();
    const done = await callerFor(memberId).card.complete({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(done).toMatchObject({ id: card.id, completed: true, completedBy: memberId, changed: true });
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.completedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(done.completedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const completedActs1 = (await actsFor(boardId)).filter(
      (a) => a.type === 'card.completed' && (a.payload as { cardId?: string }).cardId === card.id,
    );
    expect(completedActs1).toHaveLength(1);
    expect(completedActs1[0]?.cardId).toBe(card.id);

    // second complete → idempotent no-op (no new activity, version unchanged)
    const vAfter = await boardVersion(boardId);
    const noop = await callerFor(memberId).card.complete({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: card.id, completed: true, changed: false });
    expect(await boardVersion(boardId)).toBe(vAfter);
    const completedActs2 = (await actsFor(boardId)).filter(
      (a) => a.type === 'card.completed' && (a.payload as { cardId?: string }).cardId === card.id,
    );
    expect(completedActs2).toHaveLength(1);
  });

  it('uncomplete: clears completion on a completed card (card.uncompleted activity; version bumps); on an already-incomplete card it is an idempotent no-op', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Uncomplete Me card',
      clientMutationId: newId('cmid'),
    });

    // not yet completed → uncomplete is a no-op
    const v0 = await boardVersion(boardId);
    const earlyNoop = await callerFor(memberId).card.uncomplete({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(earlyNoop).toMatchObject({ id: card.id, completed: false, changed: false });
    expect(await boardVersion(boardId)).toBe(v0);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'card.uncompleted' && (a.payload as { cardId?: string }).cardId === card.id,
      ),
    ).toHaveLength(0);

    // complete, then uncomplete
    await callerFor(memberId).card.complete({ cardId: card.id, clientMutationId: newId('cmid') });
    const vBeforeUncomplete = await boardVersion(boardId);
    const cleared = await callerFor(memberId).card.uncomplete({
      cardId: card.id,
      clientMutationId: newId('cmid'),
    });
    expect(cleared).toMatchObject({
      id: card.id,
      completed: false,
      completedAt: null,
      completedBy: null,
      changed: true,
    });
    expect(await boardVersion(boardId)).toBe(vBeforeUncomplete + 1);
    expect(
      (await actsFor(boardId)).filter(
        (a) => a.type === 'card.uncompleted' && (a.payload as { cardId?: string }).cardId === card.id,
      ),
    ).toHaveLength(1);

    // and the card.get projection reflects the cleared state
    const fetched = await callerFor(ownerId).card.get({ cardId: card.id });
    expect(fetched.card.completed).toBe(false);
    expect(fetched.card.completedAt).toBeNull();
    expect(fetched.card.completedBy).toBeNull();
  });

  it('complete / uncomplete: a board viewer is FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Viewer Cannot Complete card',
      clientMutationId: newId('cmid'),
    });
    await expect(
      callerFor(guestId).card.complete({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(guestId).card.uncomplete({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // -------------------------------------------------------------- cover colour (DEM-67)

  it('update: coverColor set → card.cover_changed; same value again → no-op (no extra activity); coverColor:null → card.cover_cleared; an invalid value is rejected; a viewer is FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Cover card',
      clientMutationId: newId('cmid'),
    });
    expect(card.coverColor).toBeNull();

    // a viewer cannot set a cover colour
    await expect(
      callerFor(guestId).card.update({
        cardId: card.id,
        coverColor: 'mavi',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // an invalid value is rejected by Zod (BAD_REQUEST)
    await expect(
      callerFor(memberId).card.update({
        cardId: card.id,
        // @ts-expect-error — intentionally invalid value
        coverColor: 'foo',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // set it
    const vBeforeSet = await boardVersion(boardId);
    const withCover = await callerFor(memberId).card.update({
      cardId: card.id,
      coverColor: 'mavi',
      clientMutationId: newId('cmid'),
    });
    expect(withCover).toMatchObject({ coverColor: 'mavi', changed: true });
    expect(await boardVersion(boardId)).toBe(vBeforeSet + 1);

    // same value again → no-op (no activity, version unchanged)
    const vAfterSet = await boardVersion(boardId);
    const noop = await callerFor(memberId).card.update({
      cardId: card.id,
      coverColor: 'mavi',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ coverColor: 'mavi', changed: false });
    expect(await boardVersion(boardId)).toBe(vAfterSet);

    // clear it
    const cleared = await callerFor(memberId).card.update({
      cardId: card.id,
      coverColor: null,
      clientMutationId: newId('cmid'),
    });
    expect(cleared).toMatchObject({ coverColor: null, changed: true });

    const acts = await actsFor(boardId);
    const forCard = (t: string) =>
      acts.filter((a) => a.type === t && (a.payload as { cardId?: string }).cardId === card.id);
    expect(forCard('card.cover_changed')).toHaveLength(1);
    expect(forCard('card.cover_changed')[0]?.payload).toMatchObject({ coverColor: 'mavi' });
    expect(forCard('card.cover_cleared')).toHaveLength(1);
  });

  // -------------------------------------------------------------- archived board guards (DEM-66/67)

  it('complete / uncomplete / update(coverColor): an archived board is BAD_REQUEST', async () => {
    const archBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archived For Completion',
      clientMutationId: newId('cmid'),
    });
    const archList = await callerFor(ownerId).list.create({
      boardId: archBoard.id,
      title: 'List',
      clientMutationId: newId('cmid'),
    });
    const card = await callerFor(ownerId).card.create({
      listId: archList.id,
      title: 'Doomed card',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).board.archive({ boardId: archBoard.id, clientMutationId: newId('cmid') });

    await expect(
      callerFor(ownerId).card.complete({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
    await expect(
      callerFor(ownerId).card.uncomplete({ cardId: card.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
    await expect(
      callerFor(ownerId).card.update({
        cardId: card.id,
        coverColor: 'mavi',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
  });

  it('get: a freshly created card carries completed=false / completedAt=null / completedBy=null / coverColor=null', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Defaults card',
      clientMutationId: newId('cmid'),
    });
    const fetched = await callerFor(ownerId).card.get({ cardId: card.id });
    expect(fetched.card).toMatchObject({
      id: card.id,
      completed: false,
      completedAt: null,
      completedBy: null,
      coverColor: null,
    });
  });

  // -------------------------------------------------------------- move (DEM-42)

  it('move: reorders a card within its list (in front of / behind / between neighbours); writes card.moved activity (same from/to listId); bumps boards.version', async () => {
    // Fresh list with three cards A < B < C.
    const list = await callerFor(ownerId).list.create({ boardId, title: 'Reorder List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });
    const c = await callerFor(ownerId).card.create({ listId: list.id, title: 'C', clientMutationId: newId('cmid') });
    expect(a.position < b.position).toBe(true);
    expect(b.position < c.position).toBe(true);

    // Move C to the front (before A): C < A < B.
    const v0 = await boardVersion(boardId);
    const toFront = await callerFor(memberId).card.move({
      cardId: c.id,
      fromListId: list.id,
      toListId: list.id,
      afterCardId: a.id,
      clientMutationId: newId('cmid'),
    });
    expect(toFront).toMatchObject({ id: c.id, listId: list.id, boardId, changed: true });
    expect(toFront.position < a.position).toBe(true);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const movedActs = (await actsFor(boardId)).filter(
      (e) => e.type === 'card.moved' && (e.payload as { cardId?: string }).cardId === c.id,
    );
    expect(movedActs).toHaveLength(1);
    expect(movedActs[0]?.payload).toMatchObject({
      cardId: c.id,
      fromListId: list.id,
      toListId: list.id,
      fromPosition: c.position,
      toPosition: toFront.position,
    });
    expect(movedActs[0]?.cardId).toBe(c.id);

    // Move C between A and B: A < C < B.
    const toMiddle = await callerFor(memberId).card.move({
      cardId: c.id,
      fromListId: list.id,
      toListId: list.id,
      beforeCardId: a.id,
      afterCardId: b.id,
      clientMutationId: newId('cmid'),
    });
    expect(toMiddle.changed).toBe(true);
    expect(a.position < toMiddle.position).toBe(true);
    expect(toMiddle.position < b.position).toBe(true);
  });

  it('move: re-parents a card to another list of the same board (listId changes; card.moved records from/to listId; version bumps)', async () => {
    const src = await callerFor(ownerId).list.create({ boardId, title: 'Src List', clientMutationId: newId('cmid') });
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Dst List', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: src.id, title: 'Travelling card', clientMutationId: newId('cmid') });
    // a card already in the destination, to anchor against
    const anchor = await callerFor(ownerId).card.create({ listId: dst.id, title: 'Anchor', clientMutationId: newId('cmid') });

    const v0 = await boardVersion(boardId);
    const moved = await callerFor(memberId).card.move({
      cardId: card.id,
      fromListId: src.id,
      toListId: dst.id,
      beforeCardId: anchor.id, // place after the anchor → end of dst
      clientMutationId: newId('cmid'),
    });
    expect(moved).toMatchObject({ id: card.id, listId: dst.id, boardId, changed: true });
    expect(anchor.position < moved.position).toBe(true);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const movedActs = (await actsFor(boardId)).filter(
      (e) => e.type === 'card.moved' && (e.payload as { cardId?: string }).cardId === card.id,
    );
    expect(movedActs).toHaveLength(1);
    expect(movedActs[0]?.payload).toMatchObject({ fromListId: src.id, toListId: dst.id });

    // and card.get reflects the new parent
    const fetched = await callerFor(ownerId).card.get({ cardId: card.id });
    expect(fetched.card.listId).toBe(dst.id);
    expect(fetched.card.boardId).toBe(boardId);
  });

  it('move: a stale fromListId (the card was already moved away) is CONFLICT', async () => {
    const l1 = await callerFor(ownerId).list.create({ boardId, title: 'Conflict L1', clientMutationId: newId('cmid') });
    const l2 = await callerFor(ownerId).list.create({ boardId, title: 'Conflict L2', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: l1.id, title: 'Conflicted card', clientMutationId: newId('cmid') });

    // someone moves it to l2 first
    await callerFor(memberId).card.move({ cardId: card.id, fromListId: l1.id, toListId: l2.id, clientMutationId: newId('cmid') });

    // a second mover still thinks it's in l1 → CONFLICT
    await expect(
      callerFor(memberId).card.move({ cardId: card.id, fromListId: l1.id, toListId: l1.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('move: an archived destination list is BAD_REQUEST; a card may still be moved OUT of an archived list', async () => {
    const live = await callerFor(ownerId).list.create({ boardId, title: 'Live List', clientMutationId: newId('cmid') });
    const archived = await callerFor(ownerId).list.create({ boardId, title: 'Archived List', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: archived.id, title: 'Stuck card', clientMutationId: newId('cmid') });
    await callerFor(ownerId).list.archive({ boardId, listId: archived.id, clientMutationId: newId('cmid') });

    // can't move INTO the archived list
    const other = await callerFor(ownerId).card.create({ listId: live.id, title: 'Other card', clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.move({ cardId: other.id, fromListId: live.id, toListId: archived.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart taşınamaz.' });

    // but CAN move OUT of the archived list into a live one
    const rescued = await callerFor(memberId).card.move({
      cardId: card.id,
      fromListId: archived.id,
      toListId: live.id,
      clientMutationId: newId('cmid'),
    });
    expect(rescued).toMatchObject({ id: card.id, listId: live.id, changed: true });
  });

  it('move: moving a card into a list of another board is BAD_REQUEST', async () => {
    const otherBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'Move Other Board', clientMutationId: newId('cmid') });
    const otherList = await callerFor(ownerId).list.create({ boardId: otherBoard.id, title: 'Foreign List', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Homesick card', clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.move({ cardId: card.id, fromListId: listId, toListId: otherList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: "Kart başka bir board'a taşınamaz." });
  });

  it('move: a board viewer is FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({ listId, title: 'Viewer Cannot Move card', clientMutationId: newId('cmid') });
    await expect(
      callerFor(guestId).card.move({ cardId: card.id, fromListId: listId, toListId: listId, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('move: an archived board is BAD_REQUEST', async () => {
    const archBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'Move Archived Board', clientMutationId: newId('cmid') });
    const l1 = await callerFor(ownerId).list.create({ boardId: archBoard.id, title: 'L1', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: l1.id, title: 'Doomed card', clientMutationId: newId('cmid') });
    await callerFor(ownerId).board.archive({ boardId: archBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).card.move({ cardId: card.id, fromListId: l1.id, toListId: l1.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
  });

  it('move: a no-op (already in toListId at the resolved position) is changed:false — no activity, no version bump', async () => {
    const list = await callerFor(ownerId).list.create({ boardId, title: 'Noop Move List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });

    const v0 = await boardVersion(boardId);
    const movedActs0 = (await actsFor(boardId)).filter((e) => e.type === 'card.moved').length;

    // Ask to move B to exactly its own position.
    const noop = await callerFor(memberId).card.move({
      cardId: b.id,
      fromListId: list.id,
      toListId: list.id,
      beforeCardId: a.id,
      newPosition: b.position,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: b.id, listId: list.id, position: b.position, changed: false });
    expect(await boardVersion(boardId)).toBe(v0);
    expect((await actsFor(boardId)).filter((e) => e.type === 'card.moved').length).toBe(movedActs0);
  });

  it('move: a client-supplied newPosition is validated — accepted between neighbours, rejected (BAD_REQUEST) when out of bounds', async () => {
    const list = await callerFor(ownerId).list.create({ boardId, title: 'NewPosition Move List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });
    const c = await callerFor(ownerId).card.create({ listId: list.id, title: 'C', clientMutationId: newId('cmid') });

    const between = positionBetween(a.position, b.position);
    const ok = await callerFor(memberId).card.move({
      cardId: c.id,
      fromListId: list.id,
      toListId: list.id,
      beforeCardId: a.id,
      afterCardId: b.id,
      newPosition: between,
      clientMutationId: newId('cmid'),
    });
    expect(ok).toMatchObject({ id: c.id, position: between, changed: true });

    // c is now between a and b; reorder reference for the invalid case stays a/b
    await expect(
      callerFor(memberId).card.move({
        cardId: c.id,
        fromListId: list.id,
        toListId: list.id,
        beforeCardId: a.id,
        afterCardId: b.id,
        newPosition: b.position, // not < b → invalid
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------- compaction enqueue (DEM-44)

  it('move: a normal (short) new position does NOT enqueue a compaction job; a no-op move does not either', async () => {
    const enqueue = vi.fn<EnqueueCompaction>();
    const list = await callerFor(ownerId).list.create({ boardId, title: 'Compaction Short List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });

    // A real reorder: move B in front of A — short key.
    const moved = await callerWithEnqueue(memberId, enqueue).card.move({
      cardId: b.id,
      fromListId: list.id,
      toListId: list.id,
      afterCardId: a.id,
      clientMutationId: newId('cmid'),
    });
    expect(moved.changed).toBe(true);
    expect(moved.position.length).toBeLessThan(POSITION_COMPACTION_MAX_LEN);
    expect(enqueue).not.toHaveBeenCalled();

    // A no-op move (same position) — must not enqueue.
    await callerWithEnqueue(memberId, enqueue).card.move({
      cardId: b.id,
      fromListId: list.id,
      toListId: list.id,
      afterCardId: a.id,
      newPosition: moved.position,
      clientMutationId: newId('cmid'),
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('move: producing a long fractional position enqueues a list-scope compaction job for the target list (once)', async () => {
    const enqueue = vi.fn<EnqueueCompaction>();
    const list = await callerFor(ownerId).list.create({ boardId, title: 'Compaction Long List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });
    const target = await callerFor(ownerId).card.create({ listId: list.id, title: 'Target', clientMutationId: newId('cmid') });

    // Pin A/B to known adjacent keys so a long-but-valid `newPosition` is easy
    // to construct: `'a0' < 'a0' + 'V'…V < 'a1'`.
    await db().update(dbMod.cards).set({ position: 'a0' }).where(dbMod.eq(dbMod.cards.id, a.id));
    await db().update(dbMod.cards).set({ position: 'a1' }).where(dbMod.eq(dbMod.cards.id, b.id));
    const longPos = 'a0' + 'V'.repeat(POSITION_COMPACTION_MAX_LEN);
    expect(longPos.length).toBeGreaterThanOrEqual(POSITION_COMPACTION_MAX_LEN);
    expect('a0' < longPos && longPos < 'a1').toBe(true);

    const moved = await callerWithEnqueue(memberId, enqueue).card.move({
      cardId: target.id,
      fromListId: list.id,
      toListId: list.id,
      beforeCardId: a.id,
      afterCardId: b.id,
      newPosition: longPos,
      clientMutationId: newId('cmid'),
    });
    expect(moved).toMatchObject({ id: target.id, position: longPos, changed: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ kind: 'list', listId: list.id });
  });

  // ---------------------------------------------------- moveToList (DEM-69, Faz 3E)

  it('moveToList: same-board move to another list — listId changes, boardId unchanged, card.moved activity (no fromBoardId/toBoardId), version bumps once', async () => {
    const src = await callerFor(ownerId).list.create({ boardId, title: 'MTL Src', clientMutationId: newId('cmid') });
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'MTL Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: src.id, title: 'MTL card', clientMutationId: newId('cmid') });

    const v0 = await boardVersion(boardId);
    const moved = await callerFor(memberId).card.moveToList({
      cardId: card.id,
      toListId: dst.id,
      clientMutationId: newId('cmid'),
    });
    expect(moved).toMatchObject({ id: card.id, listId: dst.id, boardId, changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const movedActs = (await actsFor(boardId)).filter(
      (e) => e.type === 'card.moved' && (e.payload as { cardId?: string }).cardId === card.id,
    );
    expect(movedActs).toHaveLength(1);
    expect(movedActs[0]?.payload).toMatchObject({ fromListId: src.id, toListId: dst.id, fromPosition: card.position });
    expect((movedActs[0]?.payload as Record<string, unknown>).fromBoardId).toBeUndefined();
    expect((movedActs[0]?.payload as Record<string, unknown>).toBoardId).toBeUndefined();

    const fetched = await callerFor(ownerId).card.get({ cardId: card.id });
    expect(fetched.card.listId).toBe(dst.id);
    expect(fetched.card.boardId).toBe(boardId);
  });

  it('moveToList: cross-board move — boardId+listId change, card_labels emptied, card_members preserved, checklist/comment follow the card, card.moved has from/to boardId, BOTH boards bump version', async () => {
    // second board in the same workspace, the caller (member) can edit it
    const board2 = await callerFor(ownerId).board.create({ workspaceId, title: 'MTL Board 2', clientMutationId: newId('cmid') });
    const list2 = await callerFor(ownerId).list.create({ boardId: board2.id, title: 'MTL B2 List', clientMutationId: newId('cmid') });
    const srcList = await callerFor(ownerId).list.create({ boardId, title: 'MTL B1 Src', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: srcList.id, title: 'Cross card', clientMutationId: newId('cmid') });

    // a label on board 1 attached to the card
    const label = await callerFor(ownerId).label.create({ boardId, color: 'blue', name: 'Travel', clientMutationId: newId('cmid') });
    await callerFor(ownerId).card.labels.add({ cardId: card.id, labelId: label.id, clientMutationId: newId('cmid') });
    expect(await callerFor(ownerId).card.labels.list({ cardId: card.id })).toHaveLength(1);

    // a card member (the workspace member)
    await callerFor(ownerId).card.members.add({ cardId: card.id, userId: memberId, role: 'assignee', clientMutationId: newId('cmid') });
    expect(await callerFor(ownerId).card.members.list({ cardId: card.id })).toHaveLength(1);

    // a checklist + item, and a comment
    const cl = await callerFor(ownerId).checklist.create({ cardId: card.id, title: 'Trip steps', clientMutationId: newId('cmid') });
    await callerFor(ownerId).checklist.item.create({ cardId: card.id, checklistId: cl.id, content: 'Pack', clientMutationId: newId('cmid') });
    const comment = await callerFor(ownerId).comment.create({ cardId: card.id, body: 'Bon voyage', clientMutationId: newId('cmid') });

    const v1Before = await boardVersion(boardId);
    const v2Before = await boardVersion(board2.id);

    const moved = await callerFor(memberId).card.moveToList({
      cardId: card.id,
      toListId: list2.id,
      clientMutationId: newId('cmid'),
    });
    expect(moved).toMatchObject({ id: card.id, listId: list2.id, boardId: board2.id, changed: true });

    // labels dropped, members kept
    expect(await callerFor(ownerId).card.labels.list({ cardId: card.id })).toHaveLength(0);
    expect(await callerFor(ownerId).card.members.list({ cardId: card.id })).toEqual([
      expect.objectContaining({ userId: memberId, role: 'assignee' }),
    ]);

    // checklist + comment still attached (queried directly)
    const cls = await db().select().from(dbMod.checklists).where(dbMod.eq(dbMod.checklists.cardId, card.id));
    expect(cls).toHaveLength(1);
    const cmts = await db().select().from(dbMod.comments).where(dbMod.eq(dbMod.comments.cardId, card.id));
    expect(cmts.map((c) => c.id)).toContain(comment.id);

    // activity on the *target* board, with from/to boardId
    const movedActs = (await actsFor(board2.id)).filter(
      (e) => e.type === 'card.moved' && (e.payload as { cardId?: string }).cardId === card.id,
    );
    expect(movedActs).toHaveLength(1);
    expect(movedActs[0]?.payload).toMatchObject({
      fromListId: srcList.id,
      toListId: list2.id,
      fromBoardId: boardId,
      toBoardId: board2.id,
    });

    // both boards' versions bumped
    expect(await boardVersion(boardId)).toBe(v1Before + 1);
    expect(await boardVersion(board2.id)).toBe(v2Before + 1);
  });

  it('moveToList: archived target list → BAD_REQUEST; archived target board → BAD_REQUEST', async () => {
    const card = await callerFor(ownerId).card.create({ listId, title: 'MTL guard card', clientMutationId: newId('cmid') });

    const archList = await callerFor(ownerId).list.create({ boardId, title: 'MTL Frozen', clientMutationId: newId('cmid') });
    await callerFor(ownerId).list.archive({ boardId, listId: archList.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.moveToList({ cardId: card.id, toListId: archList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli listeye kart taşınamaz.' });

    const archBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'MTL Archived Board', clientMutationId: newId('cmid') });
    const archBoardList = await callerFor(ownerId).list.create({ boardId: archBoard.id, title: 'L', clientMutationId: newId('cmid') });
    await callerFor(ownerId).board.archive({ boardId: archBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).card.moveToList({ cardId: card.id, toListId: archBoardList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Arşivli board düzenlenemez.' });
  });

  it('moveToList: caller has no edit access on the target board → FORBIDDEN', async () => {
    // a board where `guest` is a viewer; guest tries to move a card they can edit on board1... actually guest can't edit board1 either.
    // Use: ownerId can edit board1, but is only a `viewer` on a board they're explicitly downgraded on. Simpler: target board where memberId has NO access.
    // outsiderId has no workspace membership → resolveBoardAccess throws FORBIDDEN. But the source card must be visible to the caller.
    // So: a board the caller (member) is a `viewer` on.
    const viewerBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'MTL Viewer Board', clientMutationId: newId('cmid') });
    await db().insert(dbMod.boardMembers).values({ boardId: viewerBoard.id, userId: memberId, role: 'viewer' });
    const viewerList = await callerFor(ownerId).list.create({ boardId: viewerBoard.id, title: 'Viewer List', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'MTL forbidden card', clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.moveToList({ cardId: card.id, toListId: viewerList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('moveToList: a no-op (already at the target list+position) is changed:false — no activity, no version bump; a duplicate clientMutationId is a natural no-op', async () => {
    const list = await callerFor(ownerId).list.create({ boardId, title: 'MTL Noop List', clientMutationId: newId('cmid') });
    const a = await callerFor(ownerId).card.create({ listId: list.id, title: 'A', clientMutationId: newId('cmid') });
    const b = await callerFor(ownerId).card.create({ listId: list.id, title: 'B', clientMutationId: newId('cmid') });

    const v0 = await boardVersion(boardId);
    const movedActs0 = (await actsFor(boardId)).filter((e) => e.type === 'card.moved').length;

    // move B to exactly its own position in its own list
    const noop = await callerFor(memberId).card.moveToList({
      cardId: b.id,
      toListId: list.id,
      beforeCardId: a.id,
      newPosition: b.position,
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: b.id, listId: list.id, position: b.position, changed: false });
    expect(await boardVersion(boardId)).toBe(v0);
    expect((await actsFor(boardId)).filter((e) => e.type === 'card.moved').length).toBe(movedActs0);

    // and a second moveToList to the same destination — also a no-op
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'MTL Noop Dst', clientMutationId: newId('cmid') });
    const cmid = newId('cmid');
    const first = await callerFor(memberId).card.moveToList({ cardId: a.id, toListId: dst.id, clientMutationId: cmid });
    expect(first.changed).toBe(true);
    const again = await callerFor(memberId).card.moveToList({ cardId: a.id, toListId: dst.id, clientMutationId: cmid });
    expect(again).toMatchObject({ id: a.id, listId: dst.id, changed: false });
  });

  // ---------------------------------------------------- copy (DEM-69, Faz 3E)

  it('copy: no includes — new card with copied title (+ " (kopya)") / description / dueAt / coverColor, completed=false, no checklists/members/labels on the copy, card.created activity has copiedFromCardId, target version bumps, source unchanged', async () => {
    const src = await callerFor(ownerId).list.create({ boardId, title: 'Copy Src', clientMutationId: newId('cmid') });
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId: src.id, title: 'Original', clientMutationId: newId('cmid') });
    const due = new Date('2026-11-30T12:00:00.000Z');
    await callerFor(ownerId).card.update({ cardId: card.id, description: 'desc here', dueAt: due, coverColor: 'mavi', clientMutationId: newId('cmid') });
    await callerFor(ownerId).card.complete({ cardId: card.id, clientMutationId: newId('cmid') });

    const v0 = await boardVersion(boardId);
    const copy = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, clientMutationId: newId('cmid') });
    expect(copy).toMatchObject({ listId: dst.id, boardId, title: 'Original (kopya)', description: 'desc here', coverColor: 'mavi', completed: false });
    expect(copy.dueAt?.getTime()).toBe(due.getTime());
    expect(copy.completedAt).toBeNull();
    expect(copy.completedBy).toBeNull();
    expect(copy.id).not.toBe(card.id);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // no sub-rows on the copy
    expect(await callerFor(ownerId).card.labels.list({ cardId: copy.id })).toHaveLength(0);
    expect(await callerFor(ownerId).card.members.list({ cardId: copy.id })).toHaveLength(0);
    expect(await db().select().from(dbMod.checklists).where(dbMod.eq(dbMod.checklists.cardId, copy.id))).toHaveLength(0);

    // activity
    const createdActs = (await actsFor(boardId)).filter(
      (e) => e.type === 'card.created' && (e.payload as { cardId?: string }).cardId === copy.id,
    );
    expect(createdActs).toHaveLength(1);
    expect(createdActs[0]?.payload).toMatchObject({ copiedFromCardId: card.id, title: 'Original (kopya)' });

    // source unchanged
    const srcFetched = await callerFor(ownerId).card.get({ cardId: card.id });
    expect(srcFetched.card).toMatchObject({ id: card.id, listId: src.id, title: 'Original', completed: true });

    // explicit title overrides the default
    const copy2 = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, title: 'Custom name', clientMutationId: newId('cmid') });
    expect(copy2.title).toBe('Custom name');
  });

  it('copy: includeChecklists — checklists + items copied (order preserved, items completed=false)', async () => {
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy CL Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Has checklists', clientMutationId: newId('cmid') });
    const clA = await callerFor(ownerId).checklist.create({ cardId: card.id, title: 'List A', clientMutationId: newId('cmid') });
    const clB = await callerFor(ownerId).checklist.create({ cardId: card.id, title: 'List B', clientMutationId: newId('cmid') });
    const itemA1 = await callerFor(ownerId).checklist.item.create({ cardId: card.id, checklistId: clA.id, content: 'A1', clientMutationId: newId('cmid') });
    await callerFor(ownerId).checklist.item.create({ cardId: card.id, checklistId: clA.id, content: 'A2', clientMutationId: newId('cmid') });
    await callerFor(ownerId).checklist.item.create({ cardId: card.id, checklistId: clB.id, content: 'B1', clientMutationId: newId('cmid') });
    // toggle one item complete on the source
    await callerFor(ownerId).checklist.item.toggle({ cardId: card.id, checklistId: clA.id, itemId: itemA1.id, completed: true, clientMutationId: newId('cmid') });

    const copy = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, includeChecklists: true, clientMutationId: newId('cmid') });

    const copyChecklists = await db()
      .select()
      .from(dbMod.checklists)
      .where(dbMod.eq(dbMod.checklists.cardId, copy.id))
      .orderBy(dbMod.asc(dbMod.checklists.position));
    expect(copyChecklists.map((c) => c.title)).toEqual(['List A', 'List B']);
    const aChecklistId = copyChecklists[0]!.id;
    const aItems = await db()
      .select()
      .from(dbMod.checklistItems)
      .where(dbMod.eq(dbMod.checklistItems.checklistId, aChecklistId))
      .orderBy(dbMod.asc(dbMod.checklistItems.position));
    expect(aItems.map((i) => i.content)).toEqual(['A1', 'A2']);
    expect(aItems.every((i) => i.completed === false && i.completedAt === null && i.completedBy === null)).toBe(true);
  });

  it('copy: includeMembers — same-board members are copied; a cross-board copy filters out a member without target-board access', async () => {
    // same-board: a member is copied
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy Mem Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Has members', clientMutationId: newId('cmid') });
    await callerFor(ownerId).card.members.add({ cardId: card.id, userId: memberId, role: 'assignee', clientMutationId: newId('cmid') });
    const copySame = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, includeMembers: true, clientMutationId: newId('cmid') });
    expect(await callerFor(ownerId).card.members.list({ cardId: copySame.id })).toEqual([
      expect.objectContaining({ userId: memberId, role: 'assignee' }),
    ]);

    // cross-board into a board where `memberId` is not a member at all (board with only an explicit owner member; member is workspace member so they DO inherit member... so use a viewer board for the *member* — but then the *caller* needs member+ on the target).
    // Construct: board2 where ownerId is admin (inherits) and memberId is downgraded to `viewer` via an explicit board_members row → memberId still has board access (viewer) so wouldn't be filtered.
    // To get a genuinely-no-access member: card on board1 has `guest`-equivalent? guestId is a workspace `guest` with a board_members viewer row on board1 only. On a fresh board2, guestId (workspace guest, no board_members row) has NO effective access. So: card on board1 with guestId as a member, copy cross-board to board2 with includeMembers → guestId filtered out.
    const board2 = await callerFor(ownerId).board.create({ workspaceId, title: 'Copy Mem B2', clientMutationId: newId('cmid') });
    const list2 = await callerFor(ownerId).list.create({ boardId: board2.id, title: 'B2 list', clientMutationId: newId('cmid') });
    const card2 = await callerFor(ownerId).card.create({ listId, title: 'Cross members card', clientMutationId: newId('cmid') });
    // give guest a board_members viewer row on board1 already exists; add guest as a card member
    await callerFor(ownerId).card.members.add({ cardId: card2.id, userId: guestId, role: 'watcher', clientMutationId: newId('cmid') });
    await callerFor(ownerId).card.members.add({ cardId: card2.id, userId: memberId, role: 'assignee', clientMutationId: newId('cmid') });
    const copyCross = await callerFor(ownerId).card.copy({ cardId: card2.id, toListId: list2.id, includeMembers: true, clientMutationId: newId('cmid') });
    const copiedMembers = await callerFor(ownerId).card.members.list({ cardId: copyCross.id });
    // member inherits board access (workspace member) → copied; guest has no access on board2 → filtered out
    expect(copiedMembers.map((m) => m.userId).sort()).toEqual([memberId]);
  });

  it('copy: includeLabels same-board → labels copied; cross-board with includeLabels:true → labels NOT copied', async () => {
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy Lbl Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Has labels', clientMutationId: newId('cmid') });
    const label = await callerFor(ownerId).label.create({ boardId, color: 'green', name: 'CopyMe', clientMutationId: newId('cmid') });
    await callerFor(ownerId).card.labels.add({ cardId: card.id, labelId: label.id, clientMutationId: newId('cmid') });

    const copySame = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, includeLabels: true, clientMutationId: newId('cmid') });
    expect(await callerFor(ownerId).card.labels.list({ cardId: copySame.id })).toEqual([
      expect.objectContaining({ labelId: label.id }),
    ]);

    // cross-board → labels skipped
    const board2 = await callerFor(ownerId).board.create({ workspaceId, title: 'Copy Lbl B2', clientMutationId: newId('cmid') });
    const list2 = await callerFor(ownerId).list.create({ boardId: board2.id, title: 'B2 list', clientMutationId: newId('cmid') });
    const copyCross = await callerFor(ownerId).card.copy({ cardId: card.id, toListId: list2.id, includeLabels: true, clientMutationId: newId('cmid') });
    expect(await callerFor(ownerId).card.labels.list({ cardId: copyCross.id })).toHaveLength(0);
  });

  it('copy: comments are NEVER copied', async () => {
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy Cmt Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Has comments', clientMutationId: newId('cmid') });
    await callerFor(ownerId).comment.create({ cardId: card.id, body: 'will not be copied', clientMutationId: newId('cmid') });
    const copy = await callerFor(memberId).card.copy({ cardId: card.id, toListId: dst.id, clientMutationId: newId('cmid') });
    const copyComments = await db().select().from(dbMod.comments).where(dbMod.eq(dbMod.comments.cardId, copy.id));
    expect(copyComments).toHaveLength(0);
  });

  it('copy: archived target list/board → BAD_REQUEST; no target-board edit access → FORBIDDEN', async () => {
    const card = await callerFor(ownerId).card.create({ listId, title: 'Copy guard card', clientMutationId: newId('cmid') });

    const archList = await callerFor(ownerId).list.create({ boardId, title: 'Copy Frozen', clientMutationId: newId('cmid') });
    await callerFor(ownerId).list.archive({ boardId, listId: archList.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.copy({ cardId: card.id, toListId: archList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const archBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'Copy Archived Board', clientMutationId: newId('cmid') });
    const archBoardList = await callerFor(ownerId).list.create({ boardId: archBoard.id, title: 'L', clientMutationId: newId('cmid') });
    await callerFor(ownerId).board.archive({ boardId: archBoard.id, clientMutationId: newId('cmid') });
    await expect(
      callerFor(ownerId).card.copy({ cardId: card.id, toListId: archBoardList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a board viewer cannot copy a card INTO that board
    const viewerBoard = await callerFor(ownerId).board.create({ workspaceId, title: 'Copy Viewer Board', clientMutationId: newId('cmid') });
    await db().insert(dbMod.boardMembers).values({ boardId: viewerBoard.id, userId: memberId, role: 'viewer' });
    const viewerList = await callerFor(ownerId).list.create({ boardId: viewerBoard.id, title: 'Viewer List', clientMutationId: newId('cmid') });
    await expect(
      callerFor(memberId).card.copy({ cardId: card.id, toListId: viewerList.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('copy: a normal (short) position does NOT enqueue a compaction job', async () => {
    const enqueue = vi.fn<EnqueueCompaction>();
    const dst = await callerFor(ownerId).list.create({ boardId, title: 'Copy Compaction Dst', clientMutationId: newId('cmid') });
    const card = await callerFor(ownerId).card.create({ listId, title: 'Compaction copy card', clientMutationId: newId('cmid') });
    const copy = await callerWithEnqueue(memberId, enqueue).card.copy({ cardId: card.id, toListId: dst.id, clientMutationId: newId('cmid') });
    expect(copy.position.length).toBeLessThan(POSITION_COMPACTION_MAX_LEN);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
