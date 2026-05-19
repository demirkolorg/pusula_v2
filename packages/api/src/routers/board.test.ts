/**
 * Integration tests for the board router (Phase 2A / DEM-34). These hit a real
 * Postgres (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`).
 * If no database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  attachments,
  boardMembers,
  cards,
  lists,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { firstPosition, positionsBetween } from '@pusula/domain';
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

// Workspace owner, a plain member, a guest, and an outsider (no membership at all).
const ownerId = newId('u-bo-owner');
const memberId = newId('u-bo-member');
const guestId = newId('u-bo-guest');
const outsiderId = newId('u-bo-outsider');
const createdUserIds = [ownerId, memberId, guestId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

/**
 * Minimal `ObjectStorage` fake — `board.get` cover-image presigned URL üretimi
 * (DEM-227) için. Gerçek MinIO imzalama saf crypto'dur; test'te `storageKey`'i
 * deterministik bir URL'e eşler.
 */
function fakeObjectStorage() {
  return {
    createPresignedPutUrl: vi.fn(async () => ({ url: 'https://storage.test/put', headers: {} })),
    createPresignedGetUrl: vi.fn(
      async (input: { key: string; expiresIn?: number }) =>
        `https://storage.test/get/${input.key}?ttl=${input.expiresIn ?? 'default'}`,
    ),
    publicUrl: vi.fn((key: string) => `https://storage.test/public/${key}`),
  };
}

function callerFor(userId: string, opts?: { objectStorage?: ReturnType<typeof fakeObjectStorage> }) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({ session: session(userId), db: probe.db, objectStorage: opts?.objectStorage }),
  );
}

describe.runIf(dbAvailable)('board router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  // The list of workspaces we create here so afterAll can cascade-delete everything.
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Board Co',
      slug: newSlug('board-co'),
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
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const actsFor = (boardId: string) =>
    db().select().from(activityEvents).where(dbMod.eq(activityEvents.boardId, boardId));

  // ---------------------------------------------------------------- create

  it('create: a workspace member creates a board, becomes a board admin, and a board.created activity is written', async () => {
    const board = await callerFor(memberId).board.create({
      workspaceId,
      title: 'Sprint Board',
      icon: 'rocket',
      clientMutationId: crypto.randomUUID(),
    });
    expect(board).toMatchObject({
      workspaceId,
      title: 'Sprint Board',
      icon: 'rocket',
      role: 'admin',
      version: 0,
    });
    expect(board.archivedAt).toBeNull();

    const members = await db()
      .select()
      .from(boardMembers)
      .where(dbMod.eq(boardMembers.boardId, board.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: memberId, role: 'admin' });

    const acts = await actsFor(board.id);
    expect(acts.some((a) => a.type === 'board.created')).toBe(true);
    expect(acts.find((a) => a.type === 'board.created')?.payload).toMatchObject({ icon: 'rocket' });
  });

  it('create: a workspace guest cannot create a board (FORBIDDEN)', async () => {
    await expect(
      callerFor(guestId).board.create({
        workspaceId,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: an outsider (no workspace membership) is FORBIDDEN at the workspace middleware', async () => {
    await expect(
      callerFor(outsiderId).board.create({
        workspaceId,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ------------------------------------------------------------------ list

  it('list: a workspace owner/member sees every board (inherited role); a guest sees only boards they belong to', async () => {
    // Owner creates one board; member creates another (already created above).
    const ownerBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Owner Board',
      clientMutationId: crypto.randomUUID(),
    });
    // Give the guest an explicit membership on the owner's board.
    await db()
      .insert(boardMembers)
      .values({ boardId: ownerBoard.id, userId: guestId, role: 'viewer' });

    const ownerList = await callerFor(ownerId).board.list({ workspaceId });
    // owner sees at least the two boards created so far
    expect(ownerList.length).toBeGreaterThanOrEqual(2);
    expect(ownerList.every((b) => b.role === 'admin')).toBe(true); // workspace owner ⇒ board admin

    const memberList = await callerFor(memberId).board.list({ workspaceId });
    // member sees every board too; inherits `member` unless explicitly an admin
    expect(memberList.some((b) => b.id === ownerBoard.id && b.role === 'member')).toBe(true);

    const guestList = await callerFor(guestId).board.list({ workspaceId });
    // guest sees only the board they were added to, with the explicit role
    expect(guestList).toHaveLength(1);
    expect(guestList[0]).toMatchObject({ id: ownerBoard.id, role: 'viewer' });
    expect(guestList[0]?.icon).toBe('layout-grid');
    expect(guestList[0]?.archivedAt).toBeNull();
  });

  // ------------------------------------------------------------------- get

  it('get: an unknown boardId is NOT_FOUND', async () => {
    await expect(callerFor(ownerId).board.get({ boardId: 'does-not-exist' })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });

  it('get: a non-member of the board is FORBIDDEN', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Private-ish Board',
      clientMutationId: crypto.randomUUID(),
    });
    // outsider isn't even in the workspace
    await expect(callerFor(outsiderId).board.get({ boardId: board.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // a guest with no explicit board membership inherits nothing
    await expect(callerFor(guestId).board.get({ boardId: board.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('get: a board member receives the board shell + lists + active cards in position order', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Shaped Board',
      clientMutationId: crypto.randomUUID(),
    });

    // empty board first
    const empty = await callerFor(ownerId).board.get({ boardId: board.id });
    expect(empty.board).toMatchObject({
      id: board.id,
      title: 'Shaped Board',
      icon: 'layout-grid',
      role: 'admin',
    });
    expect(empty.lists).toEqual([]);
    expect(empty.cards).toEqual([]);

    // seed two lists (one archived) and a few cards (one archived) directly
    const [posA, posB] = positionsBetween(null, null, 2);
    const listActiveId = newId('l');
    const listArchivedId = newId('l');
    await db()
      .insert(lists)
      .values([
        { id: listActiveId, boardId: board.id, title: 'To Do', position: posA! },
        {
          id: listArchivedId,
          boardId: board.id,
          title: 'Old',
          position: posB!,
          archivedAt: new Date(),
        },
      ]);
    const [cardPos0, cardPos1] = positionsBetween(null, null, 2);
    await db()
      .insert(cards)
      .values([
        { boardId: board.id, listId: listActiveId, title: 'Second', position: cardPos1! },
        { boardId: board.id, listId: listActiveId, title: 'First', position: cardPos0! },
        {
          boardId: board.id,
          listId: listActiveId,
          title: 'Done card',
          position: firstPosition(),
          archivedAt: new Date(),
        },
      ]);

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    // both lists returned (archived included), in position order
    expect(shaped.lists.map((l) => l.id)).toEqual([listActiveId, listArchivedId]);
    // only the two active cards, ordered by position
    expect(shaped.cards.map((c) => c.title)).toEqual(['First', 'Second']);
    expect(shaped.cards.every((c) => c.archivedAt === null)).toBe(true);
    expect(shaped.cards.every((c) => c.boardId === board.id)).toBe(true);
    // additive `labels` field — empty until labels are attached (see below)
    expect(shaped.cards.every((c) => Array.isArray(c.labels) && c.labels.length === 0)).toBe(true);
    // additive Phase 2.7B metadata — zero/empty until checklists/comments/members exist
    expect(
      shaped.cards.every(
        (c) =>
          c.checklistTotal === 0 &&
          c.checklistDone === 0 &&
          c.commentCount === 0 &&
          c.attachmentCount === 0 &&
          Array.isArray(c.members) &&
          c.members.length === 0,
      ),
    ).toBe(true);
  });

  it('get: cards include cover image metadata for the selected attachment', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Cover Image Board',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Visual',
      clientMutationId: crypto.randomUUID(),
    });
    const card = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Visual card',
      clientMutationId: crypto.randomUUID(),
    });
    const [cover] = await db()
      .insert(attachments)
      .values({
        cardId: card.id,
        boardId: board.id,
        uploaderId: ownerId,
        storageKey: `boards/${board.id}/cards/${card.id}/cover.webp`,
        fileName: 'cover.webp',
        mimeType: 'image/webp',
        size: 1234,
      })
      .returning();
    await db()
      .update(cards)
      .set({ coverImageAttachmentId: cover!.id })
      .where(dbMod.eq(cards.id, card.id));

    // objectStorage yapılandırılmamışsa `coverImageUrl` null (graceful degradation).
    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    const projected = shaped.cards.find((item) => item.id === card.id);
    expect(projected).toMatchObject({
      id: card.id,
      coverImageAttachmentId: cover!.id,
      coverImage: {
        attachmentId: cover!.id,
        fileName: 'cover.webp',
        mimeType: 'image/webp',
        size: 1234,
      },
      coverImageUrl: null,
    });

    // DEM-227 — objectStorage verildiğinde `coverImageUrl` server-side presigned
    // GET URL'i taşır (TTL 1 saat = 3600 s); kapaksız kartlarda `null` kalır.
    const storage = fakeObjectStorage();
    const withUrl = await callerFor(ownerId, { objectStorage: storage }).board.get({
      boardId: board.id,
    });
    const projectedWithUrl = withUrl.cards.find((item) => item.id === card.id);
    expect(projectedWithUrl?.coverImageUrl).toBe(
      `https://storage.test/get/boards/${board.id}/cards/${card.id}/cover.webp?ttl=3600`,
    );
    expect(storage.createPresignedGetUrl).toHaveBeenCalledWith({
      key: `boards/${board.id}/cards/${card.id}/cover.webp`,
      expiresIn: 3600,
    });
  });

  it('get: coverImageUrl is null for cards without a cover image', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'No Cover Board',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Plain',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Plain card',
      clientMutationId: crypto.randomUUID(),
    });

    const storage = fakeObjectStorage();
    const shaped = await callerFor(ownerId, { objectStorage: storage }).board.get({
      boardId: board.id,
    });
    expect(shaped.cards.every((c) => c.coverImage === null && c.coverImageUrl === null)).toBe(true);
    // Kapaksız board için presign hiç çağrılmaz.
    expect(storage.createPresignedGetUrl).not.toHaveBeenCalled();
  });

  it('get: cards carry additive metadata — checklist progress, comment count, members (Phase 2.7B — DEM-63)', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Metadata Board',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Doing',
      clientMutationId: crypto.randomUUID(),
    });
    const richCard = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Rich card',
      clientMutationId: crypto.randomUUID(),
    });
    const bareCard = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Bare card',
      clientMutationId: crypto.randomUUID(),
    });

    // Two checklists: 3 items total, 2 done.
    const cl1 = await callerFor(ownerId).checklist.create({
      cardId: richCard.id,
      title: 'A',
      clientMutationId: crypto.randomUUID(),
    });
    const cl2 = await callerFor(ownerId).checklist.create({
      cardId: richCard.id,
      title: 'B',
      clientMutationId: crypto.randomUUID(),
    });
    const it1 = await callerFor(ownerId).checklist.item.create({
      cardId: richCard.id,
      checklistId: cl1.id,
      content: 'item 1',
      clientMutationId: crypto.randomUUID(),
    });
    const it2 = await callerFor(ownerId).checklist.item.create({
      cardId: richCard.id,
      checklistId: cl1.id,
      content: 'item 2',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).checklist.item.create({
      cardId: richCard.id,
      checklistId: cl2.id,
      content: 'item 3',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).checklist.item.toggle({
      cardId: richCard.id,
      checklistId: cl1.id,
      itemId: it1.id,
      completed: true,
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).checklist.item.toggle({
      cardId: richCard.id,
      checklistId: cl1.id,
      itemId: it2.id,
      completed: true,
      clientMutationId: crypto.randomUUID(),
    });

    // Two comments, one of which gets deleted (so it shouldn't count).
    await callerFor(ownerId).comment.create({
      cardId: richCard.id,
      body: 'first',
      clientMutationId: crypto.randomUUID(),
    });
    const c2 = await callerFor(ownerId).comment.create({
      cardId: richCard.id,
      body: 'second',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).comment.delete({
      cardId: richCard.id,
      commentId: c2.id,
      clientMutationId: crypto.randomUUID(),
    });

    // Owner is already implicitly the board admin but not a card member yet —
    // add them to the card as the assignee.
    await callerFor(ownerId).card.members.add({
      cardId: richCard.id,
      userId: ownerId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    const rich = shaped.cards.find((c) => c.id === richCard.id);
    const bare = shaped.cards.find((c) => c.id === bareCard.id);

    // Two committed attachments + one draft (committed_at IS NULL) → only the
    // two committed ones count toward attachmentCount (Faz 11B / DEM-148).
    await db()
      .insert(attachments)
      .values([
        {
          cardId: richCard.id,
          boardId: board.id,
          uploaderId: ownerId,
          storageKey: `boards/${board.id}/cards/${richCard.id}/a-rapor.pdf`,
          fileName: 'rapor.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          committedAt: new Date(),
        },
        {
          cardId: richCard.id,
          boardId: board.id,
          uploaderId: ownerId,
          storageKey: `boards/${board.id}/cards/${richCard.id}/b-foto.png`,
          fileName: 'foto.png',
          mimeType: 'image/png',
          size: 2048,
          committedAt: new Date(),
        },
        {
          cardId: richCard.id,
          boardId: board.id,
          uploaderId: ownerId,
          storageKey: `boards/${board.id}/cards/${richCard.id}/c-draft.png`,
          fileName: 'draft.png',
          mimeType: 'image/png',
          size: 512,
          committedAt: null,
        },
      ]);

    // Re-fetch after attachment seed.
    const shaped2 = await callerFor(ownerId).board.get({ boardId: board.id });
    const rich2 = shaped2.cards.find((c) => c.id === richCard.id);
    const bare2 = shaped2.cards.find((c) => c.id === bareCard.id);

    expect(rich2).toBeDefined();
    expect(rich2?.checklistTotal).toBe(3);
    expect(rich2?.checklistDone).toBe(2);
    expect(rich2?.commentCount).toBe(1);
    expect(rich2?.attachmentCount).toBe(2);
    expect(rich2?.members).toHaveLength(1);
    expect(rich2?.members[0]).toMatchObject({ userId: ownerId, role: 'assignee' });
    // privacy — no e-mail field leaks through
    expect(rich2?.members[0]).not.toHaveProperty('email');

    expect(bare2).toBeDefined();
    expect(bare2?.checklistTotal).toBe(0);
    expect(bare2?.checklistDone).toBe(0);
    expect(bare2?.commentCount).toBe(0);
    expect(bare2?.attachmentCount).toBe(0);
    expect(bare2?.members).toEqual([]);

    // Original `rich`/`bare` snapshots (taken before the attachment seed) still
    // pass their pre-existing assertions — kept for backward-compat coverage.
    expect(rich).toBeDefined();
    expect(rich?.attachmentCount).toBe(0);
    expect(bare).toBeDefined();
    expect(bare?.attachmentCount).toBe(0);
  });

  it('get: each card carries its attached labels (DEM-54 — board screen label filter)', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Labelled Board',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Doing',
      clientMutationId: crypto.randomUUID(),
    });
    const cardWithLabels = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Tagged card',
      clientMutationId: crypto.randomUUID(),
    });
    const cardNoLabels = await callerFor(ownerId).card.create({
      listId: list.id,
      title: 'Bare card',
      clientMutationId: crypto.randomUUID(),
    });
    const red = await callerFor(ownerId).label.create({
      boardId: board.id,
      color: 'red',
      name: 'Acil',
      clientMutationId: crypto.randomUUID(),
    });
    const blue = await callerFor(ownerId).label.create({
      boardId: board.id,
      color: 'blue',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.labels.add({
      cardId: cardWithLabels.id,
      labelId: red.id,
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.labels.add({
      cardId: cardWithLabels.id,
      labelId: blue.id,
      clientMutationId: crypto.randomUUID(),
    });

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    const tagged = shaped.cards.find((c) => c.id === cardWithLabels.id);
    const bare = shaped.cards.find((c) => c.id === cardNoLabels.id);
    expect(bare?.labels).toEqual([]);
    expect(tagged?.labels).toHaveLength(2);
    expect(new Set(tagged?.labels.map((l) => l.labelId))).toEqual(new Set([red.id, blue.id]));
    const redEntry = tagged?.labels.find((l) => l.labelId === red.id);
    expect(redEntry).toMatchObject({ name: 'Acil', color: 'red' });
  });

  // ---------------------------------------------------------------- update

  it('update: the board admin renames it (version bumps, board.renamed activity); a board viewer is FORBIDDEN; empty input is BAD_REQUEST', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Old Title',
      clientMutationId: crypto.randomUUID(),
    });
    // make the guest a viewer on this board
    await db().insert(boardMembers).values({ boardId: board.id, userId: guestId, role: 'viewer' });

    // a board viewer cannot rename
    await expect(
      callerFor(guestId).board.update({
        boardId: board.id,
        title: 'Hax',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // empty input → BAD_REQUEST
    await expect(
      callerFor(ownerId).board.update({ boardId: board.id, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // admin renames it
    const updated = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'New Title',
      clientMutationId: crypto.randomUUID(),
    });
    expect(updated).toMatchObject({
      id: board.id,
      title: 'New Title',
      role: 'admin',
      changed: true,
    });
    expect(updated.version).toBe(board.version + 1);

    const acts = await actsFor(board.id);
    const renamed = acts.find((a) => a.type === 'board.renamed');
    expect(renamed).toBeDefined();
    expect(renamed?.payload).toMatchObject({ fromTitle: 'Old Title', toTitle: 'New Title' });

    // renaming to the same title is an idempotent no-op
    const noop = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'New Title',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: board.id, title: 'New Title', changed: false });
    expect(noop.version).toBe(updated.version);
  });

  it('update: board admin sets and clears background with correct activity payload, version bumps and no-op behaviour', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Background Board',
      clientMutationId: crypto.randomUUID(),
    });

    const setMutationId = crypto.randomUUID();
    const set = await callerFor(ownerId).board.update({
      boardId: board.id,
      background: 'gradient:ocean',
      clientMutationId: setMutationId,
    });
    expect(set).toMatchObject({
      id: board.id,
      background: 'gradient:ocean',
      changed: true,
      version: board.version + 1,
    });

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    expect(shaped.board.background).toBe('gradient:ocean');

    const retry = await callerFor(ownerId).board.update({
      boardId: board.id,
      background: 'gradient:ocean',
      clientMutationId: setMutationId,
    });
    expect(retry).toMatchObject({ id: board.id, background: 'gradient:ocean', changed: false });
    expect(retry.version).toBe(set.version);

    const clear = await callerFor(ownerId).board.update({
      boardId: board.id,
      background: null,
      clientMutationId: crypto.randomUUID(),
    });
    expect(clear).toMatchObject({
      id: board.id,
      background: null,
      changed: true,
      version: set.version + 1,
    });

    const clearNoop = await callerFor(ownerId).board.update({
      boardId: board.id,
      background: null,
      clientMutationId: crypto.randomUUID(),
    });
    expect(clearNoop).toMatchObject({ id: board.id, background: null, changed: false });
    expect(clearNoop.version).toBe(clear.version);

    const acts = await actsFor(board.id);
    const changed = acts.filter((a) => a.type === 'board.background_changed');
    const cleared = acts.filter((a) => a.type === 'board.background_cleared');
    expect(changed).toHaveLength(1);
    expect(cleared).toHaveLength(1);
    expect(changed[0]?.payload).toMatchObject({
      from: null,
      to: 'gradient:ocean',
      clientMutationId: setMutationId,
    });
    expect(cleared[0]?.payload).toMatchObject({ from: 'gradient:ocean' });
  });

  it('update: board admin changes icon, projects it through get/list, writes activity, and no-ops unchanged icon', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Icon Board',
      clientMutationId: crypto.randomUUID(),
    });

    const updated = await callerFor(ownerId).board.update({
      boardId: board.id,
      icon: 'rocket',
      clientMutationId: crypto.randomUUID(),
    });
    expect(updated).toMatchObject({
      id: board.id,
      icon: 'rocket',
      changed: true,
      version: board.version + 1,
    });

    const shaped = await callerFor(ownerId).board.get({ boardId: board.id });
    expect(shaped.board.icon).toBe('rocket');
    const listed = await callerFor(ownerId).board.list({ workspaceId });
    expect(listed.find((item) => item.id === board.id)?.icon).toBe('rocket');

    const noop = await callerFor(ownerId).board.update({
      boardId: board.id,
      icon: 'rocket',
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: board.id, icon: 'rocket', changed: false });
    expect(noop.version).toBe(updated.version);

    const acts = await actsFor(board.id);
    const iconEvent = acts.find((event) => event.type === 'board.updated');
    expect(iconEvent?.payload).toMatchObject({ fromIcon: 'layout-grid', toIcon: 'rocket' });
  });

  it('update: background is admin-only; member and viewer are FORBIDDEN, workspace owner inherited admin can update', async () => {
    const ownerBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Owner Board Background',
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(boardMembers)
      .values({ boardId: ownerBoard.id, userId: guestId, role: 'viewer' });

    await expect(
      callerFor(memberId).board.update({
        boardId: ownerBoard.id,
        background: 'solid:mavi',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(guestId).board.update({
        boardId: ownerBoard.id,
        background: 'solid:mavi',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const memberBoard = await callerFor(memberId).board.create({
      workspaceId,
      title: 'Member Created Board',
      clientMutationId: crypto.randomUUID(),
    });
    const inherited = await callerFor(ownerId).board.update({
      boardId: memberBoard.id,
      background: 'solid:mavi',
      clientMutationId: crypto.randomUUID(),
    });
    expect(inherited).toMatchObject({
      id: memberBoard.id,
      background: 'solid:mavi',
      changed: true,
    });
  });

  it('update: invalid background format is BAD_REQUEST', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Invalid Background Board',
      clientMutationId: crypto.randomUUID(),
    });

    await expect(
      callerFor(ownerId).board.update({
        boardId: board.id,
        background: 'gradient:unknown',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // --------------------------------------------------------------- archive

  it('archive: the board admin archives + restores it; idempotent no-op; non-admin is FORBIDDEN; archived board is read-only', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archive Me',
      clientMutationId: crypto.randomUUID(),
    });
    await db().insert(boardMembers).values({ boardId: board.id, userId: guestId, role: 'viewer' });

    // a board viewer cannot archive
    await expect(
      callerFor(guestId).board.archive({
        boardId: board.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // admin archives
    const archived = await callerFor(ownerId).board.archive({
      boardId: board.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(archived).toMatchObject({ id: board.id, changed: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    // archiving again is a no-op
    const noop = await callerFor(ownerId).board.archive({
      boardId: board.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(noop).toMatchObject({ id: board.id, changed: false });

    // an archived board is read-only — update rejected
    await expect(
      callerFor(ownerId).board.update({
        boardId: board.id,
        title: 'Nope',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // restore it
    const restored = await callerFor(ownerId).board.archive({
      boardId: board.id,
      archived: false,
      clientMutationId: crypto.randomUUID(),
    });
    expect(restored).toMatchObject({ id: board.id, archivedAt: null, changed: true });

    // after restore, update works again
    const updated = await callerFor(ownerId).board.update({
      boardId: board.id,
      title: 'Back In Business',
      clientMutationId: crypto.randomUUID(),
    });
    expect(updated).toMatchObject({ title: 'Back In Business', changed: true });

    const acts = await actsFor(board.id);
    const archivedActs = acts.filter((a) => a.type === 'board.archived');
    // exactly two: archive + restore (no-op did not write one)
    expect(archivedActs).toHaveLength(2);
    expect(archivedActs.map((a) => (a.payload as { archived?: boolean }).archived).sort()).toEqual([
      false,
      true,
    ]);
  });

  it('activity.list: a board viewer reads newest-first events with cursor pagination and actor names', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Activity Board',
      clientMutationId: crypto.randomUUID(),
    });
    await db().insert(boardMembers).values({ boardId: board.id, userId: guestId, role: 'viewer' });

    const base = Date.now() + 60_000;
    const inserted = await db()
      .insert(activityEvents)
      .values([
        {
          workspaceId,
          boardId: board.id,
          actorId: ownerId,
          type: 'board.renamed',
          payload: { fromTitle: 'Eski', toTitle: 'Yeni' },
          createdAt: new Date(base),
        },
        {
          workspaceId,
          boardId: board.id,
          actorId: memberId,
          type: 'list.created',
          payload: { listId: 'l1', title: 'Backlog' },
          createdAt: new Date(base + 1_000),
        },
        {
          workspaceId,
          boardId: board.id,
          actorId: ownerId,
          type: 'card.created',
          payload: { cardId: 'c1', title: 'Kart' },
          createdAt: new Date(base + 2_000),
        },
      ])
      .returning({ id: activityEvents.id });

    const page1 = await callerFor(guestId).board.activity.list({ boardId: board.id, limit: 2 });
    expect(page1.items.map((event) => event.type)).toEqual(['card.created', 'list.created']);
    expect(page1.items[0]).toMatchObject({
      id: inserted[2]!.id,
      actorId: ownerId,
      actorName: ownerId,
    });
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await callerFor(guestId).board.activity.list({
      boardId: board.id,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((event) => event.type)).toEqual(['board.renamed', 'board.created']);
    expect(page2.nextCursor).toBeNull();
  });

  it('activity.list: filters by type and keeps unrelated boards out', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Filtered Activity Board',
      clientMutationId: crypto.randomUUID(),
    });
    const other = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Other Activity Board',
      clientMutationId: crypto.randomUUID(),
    });

    await db()
      .insert(activityEvents)
      .values([
        {
          workspaceId,
          boardId: board.id,
          actorId: ownerId,
          type: 'card.created',
          payload: { cardId: 'c-filtered' },
        },
        {
          workspaceId,
          boardId: board.id,
          actorId: ownerId,
          type: 'list.created',
          payload: { listId: 'l-filtered' },
        },
        {
          workspaceId,
          boardId: other.id,
          actorId: ownerId,
          type: 'card.created',
          payload: { cardId: 'c-other' },
        },
      ]);

    const result = await callerFor(ownerId).board.activity.list({
      boardId: board.id,
      type: 'card.created',
      limit: 10,
    });

    expect(result.items.map((event) => event.payload)).toContainEqual({ cardId: 'c-filtered' });
    expect(result.items.map((event) => event.payload)).not.toContainEqual({ cardId: 'c-other' });
    expect(result.items.every((event) => event.type === 'card.created')).toBe(true);
  });

  it('activity.list: a workspace guest without board membership is FORBIDDEN', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Private Activity Board',
      clientMutationId: crypto.randomUUID(),
    });

    await expect(
      callerFor(guestId).board.activity.list({ boardId: board.id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ----------------------------------------------------------- setFavorite

  it('setFavorite: favoriting is idempotent and never writes activity (DEM-192)', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Favorite Board',
      clientMutationId: crypto.randomUUID(),
    });
    const actsBefore = await actsFor(board.id);

    const first = await callerFor(ownerId).board.setFavorite({
      boardId: board.id,
      favorited: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(first).toEqual({ boardId: board.id, favorited: true });
    // Favoriting again is a no-op (composite PK + onConflictDoNothing).
    const second = await callerFor(ownerId).board.setFavorite({
      boardId: board.id,
      favorited: true,
      clientMutationId: crypto.randomUUID(),
    });
    expect(second).toEqual({ boardId: board.id, favorited: true });

    const favRows = await db()
      .select()
      .from(dbMod.boardFavorites)
      .where(dbMod.eq(dbMod.boardFavorites.boardId, board.id));
    expect(favRows).toHaveLength(1);
    expect(favRows[0]).toMatchObject({ boardId: board.id, userId: ownerId });

    // Un-favoriting twice is also idempotent.
    await callerFor(ownerId).board.setFavorite({ boardId: board.id, favorited: false });
    await callerFor(ownerId).board.setFavorite({ boardId: board.id, favorited: false });
    const favRowsAfter = await db()
      .select()
      .from(dbMod.boardFavorites)
      .where(dbMod.eq(dbMod.boardFavorites.boardId, board.id));
    expect(favRowsAfter).toHaveLength(0);

    // No activity events were written by any of the four calls.
    const actsAfter = await actsFor(board.id);
    expect(actsAfter.length).toBe(actsBefore.length);
  });

  it('setFavorite: a viewer-role guest can favorite their own board', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Guest Favorite Board',
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(boardMembers)
      .values({ boardId: board.id, userId: guestId, role: 'viewer' });

    const result = await callerFor(guestId).board.setFavorite({
      boardId: board.id,
      favorited: true,
    });
    expect(result).toEqual({ boardId: board.id, favorited: true });

    const favRows = await db()
      .select()
      .from(dbMod.boardFavorites)
      .where(
        dbMod.and(
          dbMod.eq(dbMod.boardFavorites.boardId, board.id),
          dbMod.eq(dbMod.boardFavorites.userId, guestId),
        ),
      );
    expect(favRows).toHaveLength(1);
  });

  it('setFavorite: an outsider is FORBIDDEN and an unknown boardId is NOT_FOUND', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Locked Favorite Board',
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(outsiderId).board.setFavorite({ boardId: board.id, favorited: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(ownerId).board.setFavorite({ boardId: 'does-not-exist', favorited: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // --------------------------------------------------- list enrichment (DEM-192)

  it('list: rows carry card counts, members, favorited and activity metadata', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Enriched Board',
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(ownerId).list.create({
      boardId: board.id,
      title: 'Work',
      clientMutationId: crypto.randomUUID(),
    });
    // 2 open cards, 1 completed, 1 archived (the archived one counts nowhere).
    const [openPos0, openPos1, donePos, archPos] = positionsBetween(null, null, 4);
    await db()
      .insert(cards)
      .values([
        { boardId: board.id, listId: list.id, title: 'Open A', position: openPos0! },
        { boardId: board.id, listId: list.id, title: 'Open B', position: openPos1! },
        {
          boardId: board.id,
          listId: list.id,
          title: 'Done card',
          position: donePos!,
          completed: true,
          completedAt: new Date(),
        },
        {
          boardId: board.id,
          listId: list.id,
          title: 'Archived card',
          position: archPos!,
          archivedAt: new Date(),
        },
      ]);

    // owner favorites the board; member does not.
    await callerFor(ownerId).board.setFavorite({ boardId: board.id, favorited: true });

    const ownerList = await callerFor(ownerId).board.list({ workspaceId });
    const ownerRow = ownerList.find((b) => b.id === board.id);
    expect(ownerRow).toBeDefined();
    expect(ownerRow).toMatchObject({ openCount: 2, doneCount: 1, favorited: true });
    expect(ownerRow?.updatedAt).toBeInstanceOf(Date);
    // board.created activity exists, so lastActivityAt is populated.
    expect(ownerRow?.lastActivityAt).toBeInstanceOf(Date);
    // members carry profile fields but never an e-mail.
    expect(ownerRow?.members.some((m) => m.userId === ownerId && m.role === 'admin')).toBe(true);
    for (const m of ownerRow?.members ?? []) {
      expect(m).not.toHaveProperty('email');
    }

    // favorited is per-user: the member sees the same board with favorited=false.
    const memberList = await callerFor(memberId).board.list({ workspaceId });
    const memberRow = memberList.find((b) => b.id === board.id);
    expect(memberRow?.favorited).toBe(false);
    expect(memberRow).toMatchObject({ openCount: 2, doneCount: 1 });
  });

  it('list: the guest branch still works and an empty workspace returns an empty array', async () => {
    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Guest Branch Board',
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(boardMembers)
      .values({ boardId: board.id, userId: guestId, role: 'viewer' });
    await callerFor(guestId).board.setFavorite({ boardId: board.id, favorited: true });

    const guestList = await callerFor(guestId).board.list({ workspaceId });
    const guestRow = guestList.find((b) => b.id === board.id);
    expect(guestRow).toBeDefined();
    expect(guestRow).toMatchObject({ role: 'viewer', favorited: true });
    expect(Array.isArray(guestRow?.members)).toBe(true);

    // A brand-new workspace with no boards yields an empty list (aggregates skipped).
    const emptyWs = await callerFor(ownerId).workspace.create({
      name: 'Empty WS',
      slug: newSlug('empty-ws'),
      clientMutationId: crypto.randomUUID(),
    });
    createdWorkspaceIds.push(emptyWs.id);
    const emptyList = await callerFor(ownerId).board.list({ workspaceId: emptyWs.id });
    expect(emptyList).toEqual([]);
  });
});

describe.runIf(dbAvailable)('board router — realtime outbox (Faz 5B / DEM-84)', () => {
  const db = () => probe!.db;
  const owner = newId('u-rt-board-owner');
  let wsId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values({ id: owner, name: owner, email: `${owner}@example.test` });
    const create = createCallerFactory(appRouter);
    const ws = await create(createContext({ session: session(owner), db: db() })).workspace.create({
      name: 'RT Board Co',
      slug: newSlug('rt-board-co'),
      clientMutationId: crypto.randomUUID(),
    });
    wsId = ws.id;
    createdWorkspaceIds.push(ws.id);
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    await db().delete(users).where(dbMod.eq(users.id, owner));
  });

  function realtimeCaller(userId: string, enqueueRealtimePublish: EnqueueRealtimePublish) {
    const create = createCallerFactory(appRouter);
    return create(createContext({ session: session(userId), db: db(), enqueueRealtimePublish }));
  }

  const rtEventsFor = (boardId: string) =>
    db().select().from(realtimeEvents).where(dbMod.eq(realtimeEvents.boardId, boardId));

  it('board.update writes a board.updated realtime event with a title patch', async () => {
    const ownerCaller = callerFor(owner);
    const board = await ownerCaller.board.create({
      workspaceId: wsId,
      title: 'Old Title',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();
    const r = await realtimeCaller(owner, enqueue).board.update({
      boardId: board.id,
      title: 'New Title',
      clientMutationId: cmid,
    });
    expect(r.changed).toBe(true);

    const rt = await rtEventsFor(board.id);
    const updated = rt.filter((e) => e.type === 'board.updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]!.clientMutationId).toBe(cmid);
    const data = (
      updated[0]!.payload as {
        data: { patch: { title?: string }; fromTitle: string; toTitle: string };
      }
    ).data;
    expect(data).toEqual({
      boardId: board.id,
      patch: { title: 'New Title' },
      fromTitle: 'Old Title',
      toTitle: 'New Title',
    });
    expect(enqueue).toHaveBeenCalledWith({ eventId: updated[0]!.id });
  });

  it('board.update writes a board.updated realtime event with a background patch', async () => {
    const ownerCaller = callerFor(owner);
    const board = await ownerCaller.board.create({
      workspaceId: wsId,
      title: 'Background RT',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    const cmid = crypto.randomUUID();
    const r = await realtimeCaller(owner, enqueue).board.update({
      boardId: board.id,
      background: 'solid:mavi',
      clientMutationId: cmid,
    });
    expect(r.changed).toBe(true);

    const rt = await rtEventsFor(board.id);
    const updated = rt.filter((e) => e.type === 'board.updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]!.clientMutationId).toBe(cmid);
    const data = (
      updated[0]!.payload as {
        data: {
          boardId: string;
          patch: { background?: string | null };
          fromBackground: string | null;
          toBackground: string | null;
        };
      }
    ).data;
    expect(data).toEqual({
      boardId: board.id,
      patch: { background: 'solid:mavi' },
      fromBackground: null,
      toBackground: 'solid:mavi',
    });
    expect(enqueue).toHaveBeenCalledWith({ eventId: updated[0]!.id });
  });

  it('board.archive (real change) emits board.archived; idempotent no-op writes none', async () => {
    const ownerCaller = callerFor(owner);
    const board = await ownerCaller.board.create({
      workspaceId: wsId,
      title: 'Archive Me',
      clientMutationId: crypto.randomUUID(),
    });

    const enqueue = vi.fn<EnqueueRealtimePublish>();
    await realtimeCaller(owner, enqueue).board.archive({
      boardId: board.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    const rt1 = await rtEventsFor(board.id);
    expect(rt1.filter((e) => e.type === 'board.archived')).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    // Idempotent no-op: already archived → no new event.
    enqueue.mockClear();
    await realtimeCaller(owner, enqueue).board.archive({
      boardId: board.id,
      archived: true, // already true
      clientMutationId: crypto.randomUUID(),
    });
    const rt2 = await rtEventsFor(board.id);
    expect(rt2.filter((e) => e.type === 'board.archived')).toHaveLength(1);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
