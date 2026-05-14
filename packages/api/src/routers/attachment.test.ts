/**
 * Integration tests for card-cover attachment upload/download presign flow
 * (DEM-110). These hit a real Postgres (`DATABASE_URL`, brought up by
 * `pnpm infra:up` + `pnpm db:migrate`). If no database is reachable the suite
 * is skipped rather than failing on a box without infra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  attachments,
  boardMembers,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

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

const ownerId = newId('u-at-owner');
const memberId = newId('u-at-member');
const viewerId = newId('u-at-viewer');
const outsiderId = newId('u-at-outsider');
const createdUserIds = [ownerId, memberId, viewerId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function fakeObjectStorage() {
  return {
    createPresignedPutUrl: vi.fn(async () => ({
      url: 'https://storage.test/put',
      headers: { 'content-type': 'image/png' },
    })),
    createPresignedGetUrl: vi.fn(async () => 'https://storage.test/get'),
  };
}

function callerFor(userId: string, objectStorage = fakeObjectStorage()) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db, objectStorage }));
}

describe.runIf(dbAvailable)('attachment router (integration)', () => {
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
      name: 'Attachment Co',
      slug: newSlug('attachment-co'),
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
      title: 'Attachment Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: viewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Cards',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Cover candidate',
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

  it('createUpload: a board member creates an attachment row and receives a presigned PUT URL', async () => {
    const objectStorage = fakeObjectStorage();
    const result = await callerFor(memberId, objectStorage).attachment.createUpload({
      cardId,
      fileName: 'Kapak Gorseli.png',
      mimeType: 'image/png',
      size: 2048,
    });

    expect(result.upload).toEqual({
      url: 'https://storage.test/put',
      headers: { 'content-type': 'image/png' },
    });
    expect(result.attachment).toMatchObject({
      attachmentId: expect.any(String),
      fileName: 'Kapak Gorseli.png',
      mimeType: 'image/png',
      size: 2048,
    });

    const rows = await db()
      .select()
      .from(attachments)
      .where(dbMod.eq(attachments.id, result.attachment.attachmentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cardId, boardId });
    expect(rows[0]?.storageKey).toContain(`boards/${boardId}/cards/${cardId}/`);
    expect(objectStorage.createPresignedPutUrl).toHaveBeenCalledWith({
      key: rows[0]?.storageKey,
      contentType: 'image/png',
      contentLength: 2048,
    });
  });

  it('createUpload: a board viewer cannot create uploads and non-image MIME types are rejected', async () => {
    await expect(
      callerFor(viewerId).attachment.createUpload({
        cardId,
        fileName: 'cover.png',
        mimeType: 'image/png',
        size: 1024,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      callerFor(memberId).attachment.createUpload({
        cardId,
        fileName: 'cover.pdf',
        // @ts-expect-error - intentionally invalid value for runtime validation.
        mimeType: 'application/pdf',
        size: 1024,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('getDownloadUrl: board viewers can read attachment URLs; outsiders cannot', async () => {
    const created = await callerFor(memberId).attachment.createUpload({
      cardId,
      fileName: 'cover.webp',
      mimeType: 'image/webp',
      size: 4096,
    });

    await expect(
      callerFor(viewerId).attachment.getDownloadUrl({
        attachmentId: created.attachment.attachmentId,
      }),
    ).resolves.toEqual({ url: 'https://storage.test/get' });

    await expect(
      callerFor(outsiderId).attachment.getDownloadUrl({
        attachmentId: created.attachment.attachmentId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
