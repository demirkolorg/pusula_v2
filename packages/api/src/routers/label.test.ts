/**
 * Integration tests for the label router (Phase 2.5B / DEM-51). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra. Mirrors `card.test.ts`'s DB-probe pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { activityEvents, boardMembers, cardLabels, users, workspaceMembers, workspaces } from '@pusula/db';
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

// Workspace owner; a plain member; a board viewer (workspace guest); an outsider.
const ownerId = newId('u-lbl-owner');
const memberId = newId('u-lbl-member');
const guestId = newId('u-lbl-guest');
const outsiderId = newId('u-lbl-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('label router (integration)', () => {
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
      name: 'Label Co',
      slug: newSlug('label-co'),
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
      title: 'Label Board',
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

    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Labelled card',
      clientMutationId: newId('cmid'),
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

  // ---------------------------------------------------------------- create

  it('create: a member creates a label (version+1, no activity); a board viewer is FORBIDDEN', async () => {
    const v0 = await boardVersion(boardId);

    const created = await callerFor(memberId).label.create({
      boardId,
      color: 'green',
      name: 'Bug',
      clientMutationId: newId('cmid'),
    });
    expect(created).toMatchObject({ boardId, name: 'Bug', color: 'green' });
    expect(created.id).toBeTruthy();
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // label CRUD writes no activity
    const acts = await actsFor(boardId);
    expect(acts.some((a) => String(a.type).startsWith('label.'))).toBe(false);

    await expect(
      callerFor(guestId).label.create({ boardId, color: 'red', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: a name is optional (colour-only label); same colour + name is CONFLICT; a different colour or different name is OK', async () => {
    const colourOnly = await callerFor(memberId).label.create({
      boardId,
      color: 'purple',
      clientMutationId: newId('cmid'),
    });
    expect(colourOnly).toMatchObject({ boardId, color: 'purple', name: '' });

    // same colour + name as the "Bug" label from the previous test → CONFLICT
    await expect(
      callerFor(memberId).label.create({ boardId, color: 'green', name: 'Bug', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // a second colour-only purple label → also CONFLICT (same colour + same empty name)
    await expect(
      callerFor(memberId).label.create({ boardId, color: 'purple', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // different colour with the same name → OK
    const greenBlue = await callerFor(memberId).label.create({
      boardId,
      color: 'blue',
      name: 'Bug',
      clientMutationId: newId('cmid'),
    });
    expect(greenBlue).toMatchObject({ color: 'blue', name: 'Bug' });

    // same colour, different name → OK
    const greenChore = await callerFor(memberId).label.create({
      boardId,
      color: 'green',
      name: 'Chore',
      clientMutationId: newId('cmid'),
    });
    expect(greenChore).toMatchObject({ color: 'green', name: 'Chore' });
  });

  // ---------------------------------------------------------------- update

  it('update: rename + recolor (version+1, no activity); empty input → BAD_REQUEST; idempotent no-op; CONFLICT on clash; viewer → FORBIDDEN; unknown labelId → NOT_FOUND', async () => {
    const label = await callerFor(ownerId).label.create({
      boardId,
      color: 'orange',
      name: 'Triage',
      clientMutationId: newId('cmid'),
    });

    // empty input
    await expect(
      callerFor(ownerId).label.update({ boardId, labelId: label.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // a board viewer cannot update
    await expect(
      callerFor(guestId).label.update({ boardId, labelId: label.id, name: 'Hax', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // rename
    const v0 = await boardVersion(boardId);
    const renamed = await callerFor(memberId).label.update({
      boardId,
      labelId: label.id,
      name: 'Needs triage',
      clientMutationId: newId('cmid'),
    });
    expect(renamed).toMatchObject({ id: label.id, name: 'Needs triage', color: 'orange', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // idempotent no-op (same name + colour)
    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).label.update({
      boardId,
      labelId: label.id,
      name: 'Needs triage',
      color: 'orange',
      clientMutationId: newId('cmid'),
    });
    expect(noop).toMatchObject({ id: label.id, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    // recolor
    const recolored = await callerFor(memberId).label.update({
      boardId,
      labelId: label.id,
      color: 'red',
      clientMutationId: newId('cmid'),
    });
    expect(recolored).toMatchObject({ id: label.id, color: 'red', changed: true });

    // CONFLICT: rename + recolor into an existing (colour, name) pair — there is a
    // green "Chore" from a previous test.
    await expect(
      callerFor(memberId).label.update({
        boardId,
        labelId: label.id,
        color: 'green',
        name: 'Chore',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // unknown labelId
    await expect(
      callerFor(memberId).label.update({ boardId, labelId: 'does-not-exist', name: 'X', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // no activity from any of this
    const acts = await actsFor(boardId);
    expect(acts.some((a) => String(a.type).startsWith('label.'))).toBe(false);
  });

  // ---------------------------------------------------------------- delete

  it('delete: removes the label and cascades its card_labels links (no activity, version+1); unknown labelId → NOT_FOUND; viewer → FORBIDDEN', async () => {
    const label = await callerFor(ownerId).label.create({
      boardId,
      color: 'sky',
      name: 'Doomed',
      clientMutationId: newId('cmid'),
    });
    // attach it to a card so we can verify the FK cascade
    await callerFor(ownerId).card.labels.add({ cardId, labelId: label.id, clientMutationId: newId('cmid') });
    const beforeLinks = await db()
      .select({ cardId: cardLabels.cardId })
      .from(cardLabels)
      .where(dbMod.eq(cardLabels.labelId, label.id));
    expect(beforeLinks.length).toBe(1);

    // a board viewer cannot delete
    await expect(
      callerFor(guestId).label.delete({ boardId, labelId: label.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const v0 = await boardVersion(boardId);
    const deleted = await callerFor(memberId).label.delete({
      boardId,
      labelId: label.id,
      clientMutationId: newId('cmid'),
    });
    expect(deleted).toMatchObject({ id: label.id, deleted: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const afterLinks = await db()
      .select({ cardId: cardLabels.cardId })
      .from(cardLabels)
      .where(dbMod.eq(cardLabels.labelId, label.id));
    expect(afterLinks.length).toBe(0);

    // unknown labelId
    await expect(
      callerFor(memberId).label.delete({ boardId, labelId: 'does-not-exist', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ------------------------------------------------------------------ list

  it('list: returns the board\'s labels (id, name, color), deterministically ordered; a board viewer may read it', async () => {
    const rows = await callerFor(guestId).label.list({ boardId });
    expect(rows.length).toBeGreaterThan(0);
    // the "Bug" green label created at the top of this suite is among them
    expect(rows.some((r) => r.name === 'Bug' && r.color === 'green')).toBe(true);
    // a second call returns the rows in the same order (deterministic ORDER BY)
    const again = await callerFor(guestId).label.list({ boardId });
    expect(again.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  // ----------------------------------------------------------- outsider/archived

  it('an outsider (not a workspace member) can neither list nor create labels (FORBIDDEN)', async () => {
    await expect(callerFor(outsiderId).label.list({ boardId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(outsiderId).label.create({ boardId, color: 'lime', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('an archived board rejects label create / update / delete (BAD_REQUEST)', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived (labels)',
      clientMutationId: newId('cmid'),
    });
    // create a label *before* archiving so we have something to update/delete
    const label = await callerFor(ownerId).label.create({
      boardId: otherBoard.id,
      color: 'pink',
      name: 'Pre-archive',
      clientMutationId: newId('cmid'),
    });
    await callerFor(ownerId).board.archive({ boardId: otherBoard.id, clientMutationId: newId('cmid') });

    await expect(
      callerFor(ownerId).label.create({ boardId: otherBoard.id, color: 'lime', clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      callerFor(ownerId).label.update({
        boardId: otherBoard.id,
        labelId: label.id,
        name: 'Renamed on archived board',
        clientMutationId: newId('cmid'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      callerFor(ownerId).label.delete({ boardId: otherBoard.id, labelId: label.id, clientMutationId: newId('cmid') }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
