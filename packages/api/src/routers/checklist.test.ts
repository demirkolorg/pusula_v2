/**
 * Integration tests for the checklist router (Phase 2.5A / DEM-50). These hit a
 * real Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm
 * db:migrate`). If no database is reachable the suite is skipped rather than
 * failing on a box without infra. Mirrors `card.test.ts`'s DB-probe pattern.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardMembers,
  checklistItems,
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

// Workspace owner, a plain member, a board viewer (workspace guest), and an outsider.
const ownerId = newId('u-cl-owner');
const memberId = newId('u-cl-member');
const guestId = newId('u-cl-guest');
const outsiderId = newId('u-cl-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('checklist router (integration)', () => {
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
      name: 'Checklist Co',
      slug: newSlug('checklist-co'),
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
      title: 'Checklist Board',
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
      title: 'Checklisted card',
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

  // ------------------------------------------------------------ checklist

  it('create: a member appends a checklist (checklist.created activity, version+1); a board viewer is FORBIDDEN', async () => {
    const v0 = await boardVersion(boardId);
    const a = await callerFor(memberId).checklist.create({
      cardId,
      title: '  Tasks  ',
      clientMutationId: crypto.randomUUID(),
    });
    expect(a).toMatchObject({ cardId, title: 'Tasks' });
    expect(a.position).toBeTruthy();
    const b = await callerFor(memberId).checklist.create({
      cardId,
      title: 'More tasks',
      clientMutationId: crypto.randomUUID(),
    });
    expect(a.position < b.position).toBe(true);

    const acts = await actsFor(boardId);
    const createdActs = acts.filter(
      (x) =>
        x.type === 'checklist.created' &&
        (x.payload as { checklistId?: string }).checklistId === a.id,
    );
    expect(createdActs).toHaveLength(1);
    expect(createdActs[0]?.payload).toMatchObject({ checklistId: a.id, cardId, title: 'Tasks' });
    expect(createdActs[0]?.cardId).toBe(cardId);
    expect(await boardVersion(boardId)).toBe(v0 + 2);

    await expect(
      callerFor(guestId).checklist.create({
        cardId,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('update: renames a checklist (no activity, version+1); same title is idempotent', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Renameable',
      clientMutationId: crypto.randomUUID(),
    });
    const beforeActs = (await actsFor(boardId)).length;

    const v0 = await boardVersion(boardId);
    const renamed = await callerFor(memberId).checklist.update({
      cardId,
      checklistId: c.id,
      title: 'Renamed checklist',
      clientMutationId: crypto.randomUUID(),
    });
    expect(renamed).toMatchObject({ id: c.id, title: 'Renamed checklist', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).checklist.update({
      cardId,
      checklistId: c.id,
      title: 'Renamed checklist',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: c.id, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    // no activity rows added by the rename
    expect((await actsFor(boardId)).length).toBe(beforeActs);
  });

  it('delete: removes a checklist and cascades its items (no activity, version+1)', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Doomed',
      clientMutationId: crypto.randomUUID(),
    });
    const i1 = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'one',
      clientMutationId: crypto.randomUUID(),
    });
    const i2 = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'two',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const deleted = await callerFor(memberId).checklist.delete({
      cardId,
      checklistId: c.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(deleted).toMatchObject({ id: c.id, deleted: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const remaining = await db()
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(dbMod.inArray(checklistItems.id, [i1.id, i2.id]));
    expect(remaining).toHaveLength(0);

    // a missing checklist is NOT_FOUND
    await expect(
      callerFor(memberId).checklist.delete({
        cardId,
        checklistId: c.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('archive: a member archives / unarchives a checklist (no activity, version+1, changed flag); list returns archivedAt; a viewer is FORBIDDEN', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Archivable',
      clientMutationId: crypto.randomUUID(),
    });
    const beforeActs = (await actsFor(boardId)).length;

    // archive → archivedAt set, changed:true, version+1
    const v0 = await boardVersion(boardId);
    const archived = await callerFor(memberId).checklist.archive({
      cardId,
      checklistId: c.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(archived).toMatchObject({ id: c.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // checklist.list reflects archivedAt
    const listed = await callerFor(memberId).checklist.list({ cardId });
    expect(listed.find((x) => x.id === c.id)?.archivedAt).toBeTruthy();

    // idempotent: archiving an already-archived checklist is a no-op
    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).checklist.archive({
      cardId,
      checklistId: c.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: c.id, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    // unarchive → archivedAt cleared
    const restored = await callerFor(memberId).checklist.archive({
      cardId,
      checklistId: c.id,
      archived: false,
      clientMutationId: crypto.randomUUID(),
    });
    expect(restored).toMatchObject({ id: c.id, changed: true, archivedAt: null });

    // archive/unarchive write no activity rows (low-signal, like rename)
    expect((await actsFor(boardId)).length).toBe(beforeActs);

    // a board viewer cannot archive
    await expect(
      callerFor(guestId).checklist.archive({
        cardId,
        checklistId: c.id,
        archived: true,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('board.get card badge (checklistTotal) excludes archived checklists', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Badge card',
      clientMutationId: crypto.randomUUID(),
    });
    const cl = await callerFor(memberId).checklist.create({
      cardId: card.id,
      title: 'Badge list',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(memberId).checklist.item.create({
      cardId: card.id,
      checklistId: cl.id,
      content: 'x',
      clientMutationId: crypto.randomUUID(),
    });

    const before = await callerFor(memberId).board.get({ boardId });
    expect(before.cards.find((x) => x.id === card.id)?.checklistTotal).toBe(1);

    await callerFor(memberId).checklist.archive({
      cardId: card.id,
      checklistId: cl.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    const after = await callerFor(memberId).board.get({ boardId });
    expect(after.cards.find((x) => x.id === card.id)?.checklistTotal).toBe(0);
  });

  it('NOT_FOUND: a checklistId belonging to another card', async () => {
    const onOther = await callerFor(ownerId).checklist.create({
      cardId: otherCardId,
      title: 'Other checklist',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).checklist.update({
        cardId,
        checklistId: onOther.id,
        title: 'hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      callerFor(memberId).checklist.item.create({
        cardId,
        checklistId: onOther.id,
        content: 'hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('NOT_FOUND: an itemId belonging to another checklist on the same card', async () => {
    const a = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Checklist A',
      clientMutationId: crypto.randomUUID(),
    });
    const b = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Checklist B',
      clientMutationId: crypto.randomUUID(),
    });
    const itemA = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: a.id,
      content: 'a-item',
      clientMutationId: crypto.randomUUID(),
    });
    const itemB = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: b.id,
      content: 'b-item',
      clientMutationId: crypto.randomUUID(),
    });
    expect(itemA.id).not.toBe(itemB.id);
    // toggling B's item through checklist A → NOT_FOUND
    await expect(
      callerFor(memberId).checklist.item.toggle({
        cardId,
        checklistId: a.id,
        itemId: itemB.id,
        completed: true,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('bulkImport: a member imports N checklists with their items in one shot (single checklist.bulk_imported activity, single version+1); a board viewer is FORBIDDEN', async () => {
    const bulkCard = await callerFor(ownerId).card.create({
      listId,
      title: 'Bulk import card',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);

    const result = await callerFor(memberId).checklist.bulkImport({
      cardId: bulkCard.id,
      checklists: [
        { title: 'Hazırlık', items: ['Toplantı planla', 'Doküman hazırla'] },
        { title: 'Boş liste', items: [] },
        { title: 'Geliştirme', items: ['API yaz'] },
      ],
      clientMutationId: crypto.randomUUID(),
    });

    // Counts + input order preserved, items attached to the right checklist.
    expect(result.checklistCount).toBe(3);
    expect(result.itemCount).toBe(3);
    expect(result.checklists.map((c) => c.title)).toEqual(['Hazırlık', 'Boş liste', 'Geliştirme']);
    expect(result.checklists[0]!.items.map((i) => i.content)).toEqual([
      'Toplantı planla',
      'Doküman hazırla',
    ]);
    expect(result.checklists[1]!.items).toEqual([]);
    expect(result.checklists[2]!.items.map((i) => i.content)).toEqual(['API yaz']);
    // Checklist + item positions strictly ascending (append/insert order).
    expect(result.checklists[0]!.position < result.checklists[1]!.position).toBe(true);
    expect(result.checklists[1]!.position < result.checklists[2]!.position).toBe(true);
    expect(result.checklists[0]!.items[0]!.position < result.checklists[0]!.items[1]!.position).toBe(
      true,
    );

    // Exactly ONE summary activity for the whole import (not N × M).
    const acts = (await actsFor(boardId)).filter(
      (a) => a.type === 'checklist.bulk_imported' && a.cardId === bulkCard.id,
    );
    expect(acts).toHaveLength(1);
    expect(acts[0]!.payload).toMatchObject({ checklistCount: 3, itemCount: 3 });

    // Single board version bump for the whole import.
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // `list` reflects the imported checklists + their items, in order.
    const listed = await callerFor(memberId).checklist.list({ cardId: bulkCard.id });
    expect(listed.map((c) => c.title)).toEqual(['Hazırlık', 'Boş liste', 'Geliştirme']);
    expect(listed[0]!.items.map((i) => i.content)).toEqual(['Toplantı planla', 'Doküman hazırla']);

    // A board viewer (workspace guest) cannot bulk-import.
    await expect(
      callerFor(guestId).checklist.bulkImport({
        cardId: bulkCard.id,
        checklists: [{ title: 'X', items: [] }],
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bulkImport: appends after existing checklists and rejects an over-limit payload (BAD_REQUEST)', async () => {
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Bulk append card',
      clientMutationId: crypto.randomUUID(),
    });
    // Seed one checklist first, then bulk-import — the imports must sort after it.
    const first = await callerFor(ownerId).checklist.create({
      cardId: card.id,
      title: 'Var olan',
      clientMutationId: crypto.randomUUID(),
    });
    const result = await callerFor(ownerId).checklist.bulkImport({
      cardId: card.id,
      checklists: [{ title: 'Sonraki', items: [] }],
      clientMutationId: crypto.randomUUID(),
    });
    expect(result.checklists[0]!.position > first.position).toBe(true);

    // Too many checklists (> 20) is rejected by the input schema.
    await expect(
      callerFor(ownerId).checklist.bulkImport({
        cardId: card.id,
        checklists: Array.from({ length: 21 }, (_, i) => ({ title: `L${i}`, items: [] })),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ------------------------------------------------------- checklist.item

  it('item.create: appends an item (checklist.item_added activity, version+1)', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Item host',
      clientMutationId: crypto.randomUUID(),
    });
    const v0 = await boardVersion(boardId);
    const item = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: '  do the thing  ',
      clientMutationId: crypto.randomUUID(),
    });
    expect(item).toMatchObject({ checklistId: c.id, content: 'do the thing', completed: false });
    expect(item.completedAt).toBeNull();
    expect(item.completedBy).toBeNull();
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const addedActs = acts.filter(
      (x) =>
        x.type === 'checklist.item_added' && (x.payload as { itemId?: string }).itemId === item.id,
    );
    expect(addedActs).toHaveLength(1);
    expect(addedActs[0]?.payload).toMatchObject({
      checklistId: c.id,
      itemId: item.id,
      cardId,
      content: 'do the thing',
    });
  });

  it('item.toggle: check sets completedAt/completedBy + checklist.item_checked; uncheck clears them + checklist.item_unchecked; idempotent', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Toggle host',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'toggle me',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const checked = await callerFor(memberId).checklist.item.toggle({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      completed: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(checked).toMatchObject({
      id: item.id,
      completed: true,
      completedBy: memberId,
      changed: true,
    });
    expect(checked.completedAt).toBeInstanceOf(Date);
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    // idempotent re-check
    const v1 = await boardVersion(boardId);
    const noop = await callerFor(memberId).checklist.item.toggle({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      completed: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: item.id, changed: false });
    expect(await boardVersion(boardId)).toBe(v1);

    const unchecked = await callerFor(memberId).checklist.item.toggle({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      completed: false,
      clientMutationId: crypto.randomUUID(),
    });
    expect(unchecked).toMatchObject({
      id: item.id,
      completed: false,
      completedAt: null,
      completedBy: null,
      changed: true,
    });

    const acts = await actsFor(boardId);
    const forItem = (t: string) =>
      acts.filter((x) => x.type === t && (x.payload as { itemId?: string }).itemId === item.id);
    expect(forItem('checklist.item_checked')).toHaveLength(1);
    expect(forItem('checklist.item_unchecked')).toHaveLength(1);
  });

  it('item.update: edits content (no activity, version+1); same content is idempotent', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Edit host',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'before',
      clientMutationId: crypto.randomUUID(),
    });
    const beforeActs = (await actsFor(boardId)).length;

    const v0 = await boardVersion(boardId);
    const edited = await callerFor(memberId).checklist.item.update({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      content: 'after',
      clientMutationId: crypto.randomUUID(),
    });
    expect(edited).toMatchObject({ id: item.id, content: 'after', changed: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const noop = await callerFor(memberId).checklist.item.update({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      content: 'after',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: item.id, changed: false });

    expect((await actsFor(boardId)).length).toBe(beforeActs);
  });

  it('item.delete: removes an item (checklist.item_removed activity, version+1)', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Delete host',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'remove me',
      clientMutationId: crypto.randomUUID(),
    });

    const v0 = await boardVersion(boardId);
    const deleted = await callerFor(memberId).checklist.item.delete({
      cardId,
      checklistId: c.id,
      itemId: item.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(deleted).toMatchObject({ id: item.id, deleted: true });
    expect(await boardVersion(boardId)).toBe(v0 + 1);

    const acts = await actsFor(boardId);
    const removedActs = acts.filter(
      (x) =>
        x.type === 'checklist.item_removed' &&
        (x.payload as { itemId?: string }).itemId === item.id,
    );
    expect(removedActs).toHaveLength(1);
    // Bildirim detay / audit (2026-06-20) — item_removed now carries the
    // deleted item's text (read before deletion).
    expect(removedActs[0]?.payload).toMatchObject({ content: 'remove me' });

    await expect(
      callerFor(memberId).checklist.item.delete({
        cardId,
        checklistId: c.id,
        itemId: item.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('item.reorder: moves an item between two neighbours (no activity, version+1); a neighbour from another checklist is BAD_REQUEST', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Reorder host',
      clientMutationId: crypto.randomUUID(),
    });
    const i1 = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'one',
      clientMutationId: crypto.randomUUID(),
    });
    const i2 = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'two',
      clientMutationId: crypto.randomUUID(),
    });
    const i3 = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'three',
      clientMutationId: crypto.randomUUID(),
    });
    expect(i1.position < i2.position && i2.position < i3.position).toBe(true);
    const beforeActs = (await actsFor(boardId)).length;

    // move i3 between i1 and i2
    const v0 = await boardVersion(boardId);
    const moved = await callerFor(memberId).checklist.item.reorder({
      cardId,
      checklistId: c.id,
      itemId: i3.id,
      beforeItemId: i1.id,
      afterItemId: i2.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(moved).toMatchObject({ id: i3.id, changed: true });
    expect(i1.position < moved.position && moved.position < i2.position).toBe(true);
    expect(await boardVersion(boardId)).toBe(v0 + 1);
    expect((await actsFor(boardId)).length).toBe(beforeActs);

    // move i1 to the front (no `before`)
    const movedFront = await callerFor(memberId).checklist.item.reorder({
      cardId,
      checklistId: c.id,
      itemId: i1.id,
      afterItemId: moved.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(movedFront.position < moved.position).toBe(true);

    // a neighbour from a different checklist → BAD_REQUEST
    const other = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Foreign checklist',
      clientMutationId: crypto.randomUUID(),
    });
    const foreignItem = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: other.id,
      content: 'foreign',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(memberId).checklist.item.reorder({
        cardId,
        checklistId: c.id,
        itemId: i2.id,
        beforeItemId: foreignItem.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // an item cannot be positioned relative to itself → BAD_REQUEST
    await expect(
      callerFor(memberId).checklist.item.reorder({
        cardId,
        checklistId: c.id,
        itemId: i2.id,
        beforeItemId: i2.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      callerFor(memberId).checklist.item.reorder({
        cardId,
        checklistId: c.id,
        itemId: i2.id,
        afterItemId: i2.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('item.*: a board viewer (workspace guest) cannot mutate checklist items (FORBIDDEN)', async () => {
    const c = await callerFor(memberId).checklist.create({
      cardId,
      title: 'Guarded host',
      clientMutationId: crypto.randomUUID(),
    });
    const item = await callerFor(memberId).checklist.item.create({
      cardId,
      checklistId: c.id,
      content: 'do not touch',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(guestId).checklist.item.toggle({
        cardId,
        checklistId: c.id,
        itemId: item.id,
        completed: true,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(guestId).checklist.item.create({
        cardId,
        checklistId: c.id,
        content: 'sneaky',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // -------------------------------------------------------------- outsider

  it('an outsider (not a workspace member) cannot create a checklist (FORBIDDEN)', async () => {
    await expect(
      callerFor(outsiderId).checklist.create({
        cardId,
        title: 'sneaky',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // --------------------------------------------------------- archived board

  it('create: an archived board rejects new checklists (BAD_REQUEST)', async () => {
    const otherBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'To Be Archived (checklists)',
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
      callerFor(ownerId).checklist.create({
        cardId: cardOnOther.id,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
