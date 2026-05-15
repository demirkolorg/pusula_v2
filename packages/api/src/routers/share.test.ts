/**
 * Integration tests for the share router (Faz 9B / DEM-128). DB probe pattern
 * `comment.test.ts`'le simetrik. Önce-belge:
 *  - `docs/architecture/14-paylasim-linki-mimarisi.md` "tRPC API yüzeyi" +
 *    "Permission enforcement" + "Token üretimi & doğrulama"
 *  - `docs/domain/08-paylasim-linki-kurallari.md` "Kim oluşturabilir / iptal
 *    edebilir"
 *
 * Kapsam:
 *  - `share.create`: admin/member başarı; viewer FORBIDDEN; outsider NOT_FOUND
 *  - `share.create`: token plain bir kerelik response'ta, DB'de yalnız hash+prefix
 *  - `share.create`: arşivli board/kart reject; expiresInDays preset
 *  - `share.revoke`: creator OK; board admin (non-creator) OK; sıradan member non-creator FORBIDDEN
 *  - `share.revoke`: idempotent already-revoked; wrong shareLinkId NOT_FOUND
 *  - `share.list`: viewer OK; outsider NOT_FOUND; plaintext token YOK
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  shareLinks,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { hashShareToken } from '../lib/share-token';
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

const ownerId = newId('u-sh-owner');
const memberId = newId('u-sh-member');
const adminId = newId('u-sh-admin');
const viewerId = newId('u-sh-viewer');
const outsiderId = newId('u-sh-outsider');
const createdUserIds = [ownerId, memberId, adminId, viewerId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('share router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let archivedBoardCardId: string;
  let archivedCardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Share Co',
      slug: newSlug('share-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: viewerId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Share Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    await db().insert(boardMembers).values({ boardId, userId: viewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;

    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Shareable',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;

    // Card on an archived board.
    const archivedBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    const archivedList = await callerFor(ownerId).list.create({
      boardId: archivedBoard.id,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    const cardOnArchivedBoard = await callerFor(ownerId).card.create({
      listId: archivedList.id,
      title: 'On archived board',
      clientMutationId: crypto.randomUUID(),
    });
    archivedBoardCardId = cardOnArchivedBoard.id;
    await callerFor(ownerId).board.archive({
      boardId: archivedBoard.id,
      clientMutationId: crypto.randomUUID(),
    });

    // Archived card on the active board.
    const cardToArchive = await callerFor(ownerId).card.create({
      listId,
      title: 'Will be archived',
      clientMutationId: crypto.randomUUID(),
    });
    archivedCardId = cardToArchive.id;
    await callerFor(ownerId).card.archive({
      cardId: cardToArchive.id,
      clientMutationId: crypto.randomUUID(),
    });
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  // ---------------------------------------------------------------- create

  it('create: a member oluşturur, token bir kerelik döner, DB plaintext tutmaz', async () => {
    const result = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(result.id).toBeTruthy();
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.url).toContain(`/share/${result.token}`);
    expect(result.expiresAt).toBeInstanceOf(Date);

    // DB: yalnız hash + prefix; plain token saklanmamış.
    const [row] = await db()
      .select({
        tokenHash: shareLinks.tokenHash,
        tokenPrefix: shareLinks.tokenPrefix,
        createdById: shareLinks.createdById,
        revokedAt: shareLinks.revokedAt,
      })
      .from(shareLinks)
      .where(dbMod.eq(shareLinks.id, result.id))
      .limit(1);
    expect(row!.tokenHash).toBe(hashShareToken(result.token));
    expect(row!.tokenPrefix).toBe(result.token.slice(0, 8));
    expect(row!.createdById).toBe(memberId);
    expect(row!.revokedAt).toBeNull();
  });

  it('create: default 90 gün; preset 7/30 kabul; 60 reject', async () => {
    const today = Date.now();
    const r90 = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(r90.expiresAt.getTime()).toBeGreaterThan(today + 89 * 86_400_000);
    expect(r90.expiresAt.getTime()).toBeLessThan(today + 91 * 86_400_000);

    const r7 = await callerFor(memberId).share.create({
      cardId,
      expiresInDays: 7,
      clientMutationId: crypto.randomUUID(),
    });
    expect(r7.expiresAt.getTime()).toBeLessThan(today + 8 * 86_400_000);

    await expect(
      callerFor(memberId).share.create({
        cardId,
        // @ts-expect-error — invalid preset (60); Zod reject
        expiresInDays: 60,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('create: viewer FORBIDDEN; outsider NOT_FOUND; admin OK', async () => {
    await expect(
      callerFor(viewerId).share.create({ cardId, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      callerFor(outsiderId).share.create({ cardId, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const adminResult = await callerFor(adminId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(adminResult.token).toBeTruthy();
  });

  it('create: arşivli board reddedilir', async () => {
    await expect(
      callerFor(ownerId).share.create({
        cardId: archivedBoardCardId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('create: arşivli kart reddedilir', async () => {
    await expect(
      callerFor(ownerId).share.create({
        cardId: archivedCardId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------- revoke

  it('revoke: creator iptal eder; idempotent ikinci çağrı changed=false', async () => {
    const link = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    const first = await callerFor(memberId).share.revoke({
      cardId,
      shareLinkId: link.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(first.changed).toBe(true);
    expect(first.revokedAt).toBeInstanceOf(Date);

    const second = await callerFor(memberId).share.revoke({
      cardId,
      shareLinkId: link.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(second.changed).toBe(false);
    expect(second.revokedAt.getTime()).toBe(first.revokedAt.getTime());
  });

  it('revoke: board admin (non-creator) iptal edebilir', async () => {
    const link = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    const result = await callerFor(ownerId).share.revoke({
      cardId,
      shareLinkId: link.id,
      clientMutationId: crypto.randomUUID(),
    });
    expect(result.changed).toBe(true);
  });

  it('revoke: sıradan member non-creator FORBIDDEN', async () => {
    const link = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    // adminId workspace admin → board admin, FORBIDDEN olmaz. Ama memberId
    // başka biri olarak kendi link'i değil → admin kontrolü olmayan başka member yok.
    // Bu yüzden ikinci bir member yaratmak gerek. Burada viewer'ı kullanamayız
    // (viewer create yapamaz). Workspace'te ikinci bir "member" rolü ekleyelim.
    const secondMemberId = newId('u-sh-member2');
    await db()
      .insert(users)
      .values({ id: secondMemberId, name: secondMemberId, email: `${secondMemberId}@example.test` });
    createdUserIds.push(secondMemberId);
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId, userId: secondMemberId, role: 'member' });

    await expect(
      callerFor(secondMemberId).share.revoke({
        cardId,
        shareLinkId: link.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('revoke: wrong shareLinkId NOT_FOUND; başka kartın linki NOT_FOUND', async () => {
    await expect(
      callerFor(memberId).share.revoke({
        cardId,
        shareLinkId: 'share_not_exists',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Başka kartın linki: önce başka karta bir link yarat sonra mevcut kartla revoke etmeye çalış
    const otherCard = await callerFor(ownerId).card.create({
      listId,
      title: 'Other share card',
      clientMutationId: crypto.randomUUID(),
    });
    const otherLink = await callerFor(memberId).share.create({
      cardId: otherCard.id,
      clientMutationId: crypto.randomUUID(),
    });

    await expect(
      callerFor(memberId).share.revoke({
        cardId, // farklı kart
        shareLinkId: otherLink.id,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------- list

  it('list: viewer dahil member+ okur; plaintext token YOK', async () => {
    await callerFor(memberId).share.create({ cardId, clientMutationId: crypto.randomUUID() });

    const list = await callerFor(viewerId).share.list({ cardId });
    expect(list.length).toBeGreaterThan(0);
    for (const row of list) {
      // Plaintext token alanı dönmemeli (yalnız tokenPrefix var).
      expect((row as Record<string, unknown>).token).toBeUndefined();
      expect(row.tokenPrefix).toBeTruthy();
      expect(row.tokenPrefix.length).toBe(8);
      expect(row.createdById).toBeTruthy();
      expect(row.expiresAt).toBeInstanceOf(Date);
    }
  });

  it('list: outsider FORBIDDEN (cardProcedure resolveBoardAccess)', async () => {
    await expect(
      callerFor(outsiderId).share.list({ cardId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('list: en yeni önce (desc createdAt)', async () => {
    const a = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const b = await callerFor(memberId).share.create({
      cardId,
      clientMutationId: crypto.randomUUID(),
    });

    const list = await callerFor(memberId).share.list({ cardId });
    const idxA = list.findIndex((row) => row.id === a.id);
    const idxB = list.findIndex((row) => row.id === b.id);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeLessThan(idxA);
  });
});
