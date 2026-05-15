/**
 * Integration tests for the card-labels router (Phase 2.5B / DEM-51). These hit
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

// Workspace owner; a plain member; a board viewer (workspace guest); an outsider.
const ownerId = newId('u-clb-owner');
const memberId = newId('u-clb-member');
const guestId = newId('u-clb-guest');
const outsiderId = newId('u-clb-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('card-labels router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let labelId: string;
  let otherBoardId: string;
  let otherBoardLabelId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Card Labels Co',
      slug: newSlug('card-labels-co'),
      clientMutationId: crypto.randomUUID(),
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
      title: 'Card Labels Board',
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
      title: 'Card with labels',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;

    const label = await callerFor(ownerId).label.create({
      boardId,
      color: 'green',
      name: 'Bug',
      clientMutationId: crypto.randomUUID(),
    });
    labelId = label.id;

    // A second board (same workspace) + a label on it — for the cross-board guard.
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Other Labels Board',
      clientMutationId: crypto.randomUUID(),
    });
    otherBoardId = otherBoard.id;
    const otherLabel = await callerFor(ownerId).label.create({
      boardId: otherBoardId,
      color: 'blue',
      name: 'Feature',
      clientMutationId: crypto.randomUUID(),
    });
    otherBoardLabelId = otherLabel.id;
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

  it('add: a member attaches a label to a card (card.label_added, version+1); idempotent re-add is changed:false', async () => {
    const v0 = await boardVersion(boardId);

    const added = await callerFor(memberId).card.labels.add({
      cardId,
      labelId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(added).toMatchObject({ cardId, labelId, changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const addedActs = acts.filter(
      (a) =>
        a.type === 'card.label_added' && (a.payload as { labelId?: string }).labelId === labelId,
    );
    expect(addedActs).toHaveLength(1);
    expect(addedActs[0]?.payload).toMatchObject({ cardId, labelId });
    expect(addedActs[0]?.cardId).toBe(cardId);

    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).card.labels.add({
      cardId,
      labelId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ cardId, labelId, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);
  });

  it('add: attaching a label that belongs to another board is BAD_REQUEST; an unknown labelId is NOT_FOUND', async () => {
    await expect(
      callerFor(memberId).card.labels.add({
        cardId,
        labelId: otherBoardLabelId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      callerFor(memberId).card.labels.add({
        cardId,
        labelId: 'does-not-exist',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('add: a board viewer is FORBIDDEN', async () => {
    await expect(
      callerFor(guestId).card.labels.add({
        cardId,
        labelId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------- remove

  it('remove: a member detaches a label (card.label_removed, version+1); idempotent re-remove is changed:false', async () => {
    const v0 = await boardVersion(boardId);
    const removed = await callerFor(memberId).card.labels.remove({
      cardId,
      labelId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(removed).toMatchObject({ cardId, labelId, changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).card.labels.remove({
      cardId,
      labelId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ cardId, labelId, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    const acts = await actsFor(boardId);
    expect(
      acts.filter(
        (a) =>
          a.type === 'card.label_removed' &&
          (a.payload as { labelId?: string }).labelId === labelId,
      ),
    ).toHaveLength(1);
  });

  it('remove: a board viewer is FORBIDDEN', async () => {
    await callerFor(memberId).card.labels.add({
      cardId,
      labelId,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(guestId).card.labels.remove({
        cardId,
        labelId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ------------------------------------------------------------------ list

  it('list: returns the labels attached to a card (id, name, color); a board viewer may read it', async () => {
    const rows = await callerFor(guestId).card.labels.list({ cardId });
    const found = rows.find((r) => r.labelId === labelId);
    expect(found).toMatchObject({ labelId, name: 'Bug', color: 'green' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
