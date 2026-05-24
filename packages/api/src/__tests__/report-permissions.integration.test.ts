/**
 * Faz 13O (DEM-271) — `buildReportPermissionsCtx` integration testi.
 *
 * Real PostgreSQL gerektirir (`DATABASE_URL` + `pnpm infra:up` + `pnpm db:migrate`).
 * `describe.runIf(dbAvailable)` ile env kapalıyken graceful skip.
 *
 * Test ettiği:
 *  - `accessibleBoardsInWorkspace`: workspace owner/admin/member/guest semantics
 *  - `totalBoardsInWorkspace`: arşivli board'lar filtre dışı
 *  - `totalListsInBoard`: arşivli list dahil sayım (V1 davranışı)
 *  - Request-scope cache: aynı workspace ikinci sorguda DB hit etmiyor
 *  - **Bilgi sızıntısı**: guest için accessibleBoards sadece üye olduğu
 *    panoları döner; başkaca id sızmaz.
 */
import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  boards,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { buildReportPermissionsCtx } from '../lib/report-permissions';

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

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

async function seedFixture() {
  if (!probe) throw new Error('db not initialised');
  const db = probe.db;

  const owner = { id: newId('u-rp-owner'), name: 'rp-owner' };
  const admin = { id: newId('u-rp-admin'), name: 'rp-admin' };
  const member = { id: newId('u-rp-member'), name: 'rp-member' };
  const guest = { id: newId('u-rp-guest'), name: 'rp-guest' };
  const outsider = { id: newId('u-rp-outsider'), name: 'rp-outsider' };
  createdUserIds.push(owner.id, admin.id, member.id, guest.id, outsider.id);

  await db.insert(users).values([
    { id: owner.id, name: owner.name, email: `${owner.id}@example.test`, emailVerified: true },
    { id: admin.id, name: admin.name, email: `${admin.id}@example.test`, emailVerified: true },
    { id: member.id, name: member.name, email: `${member.id}@example.test`, emailVerified: true },
    { id: guest.id, name: guest.name, email: `${guest.id}@example.test`, emailVerified: true },
    { id: outsider.id, name: outsider.name, email: `${outsider.id}@example.test`, emailVerified: true },
  ]);

  const workspaceId = newId('ws-rp');
  createdWorkspaceIds.push(workspaceId);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Report Perms Workspace',
    slug: newSlug('report-perms'),
    ownerId: owner.id,
  });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner.id, role: 'owner' },
    { workspaceId, userId: admin.id, role: 'admin' },
    { workspaceId, userId: member.id, role: 'member' },
    { workspaceId, userId: guest.id, role: 'guest' },
  ]);

  // 5 aktif board + 1 arşivli board.
  const boardIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = newId(`b-rp-${i}`);
    boardIds.push(id);
    await db.insert(boards).values({
      id,
      workspaceId,
      title: `Board ${i}`,
    });
  }
  const archivedBoardId = newId('b-rp-archived');
  await db.insert(boards).values({
    id: archivedBoardId,
    workspaceId,
    title: 'Archived Board',
    archivedAt: new Date(),
  });

  // Guest explicit olarak yalnız board 0'a üye.
  await db.insert(boardMembers).values([
    { boardId: boardIds[0]!, userId: guest.id, role: 'viewer' },
  ]);

  // Board 0'da 3 list.
  const list0Ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = newId(`l-rp-${i}`);
    list0Ids.push(id);
    await db.insert(lists).values({
      id,
      boardId: boardIds[0]!,
      title: `List ${i}`,
      position: `a${i}`,
    });
  }

  return {
    workspaceId,
    boardIds,
    archivedBoardId,
    list0Ids,
    owner,
    admin,
    member,
    guest,
    outsider,
  };
}

describe.runIf(dbAvailable)('buildReportPermissionsCtx — integration (Faz 13O)', () => {
  afterAll(async () => {
    if (!probe) return;
    for (const workspaceId of [...createdWorkspaceIds].reverse()) {
      await probe.db.delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    }
    if (createdUserIds.length > 0) {
      await probe.db.delete(users).where(dbMod.inArray(users.id, createdUserIds));
    }
    await probe.pool.end();
  });

  it('owner & admin → accessibleBoards = 5 (arşivli hariç)', async () => {
    const fx = await seedFixture();

    const ownerCtx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.owner.id,
    });
    const ownerBoards = await ownerCtx.accessibleBoardsInWorkspace(fx.workspaceId);
    expect(ownerBoards).toHaveLength(5);
    // Arşivli board listede yok.
    expect(ownerBoards).not.toContain(fx.archivedBoardId);

    const adminCtx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.admin.id,
    });
    const adminBoards = await adminCtx.accessibleBoardsInWorkspace(fx.workspaceId);
    expect(adminBoards).toHaveLength(5);
  });

  it('member → accessibleBoards = 5 (workspace-level view; explicit ACL gerekmez)', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.member.id,
    });
    const memberBoards = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    expect(memberBoards).toHaveLength(5);
  });

  it('guest → accessibleBoards = 1 (sadece explicit member olduğu)', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.guest.id,
    });
    const guestBoards = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    expect(guestBoards).toEqual([fx.boardIds[0]]);
  });

  it('outsider (workspace üyesi değil) → accessibleBoards = []', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.outsider.id,
    });
    const outsiderBoards = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    expect(outsiderBoards).toEqual([]);
  });

  it('totalBoardsInWorkspace → 5 (arşivli hariç)', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.member.id,
    });
    const total = await ctx.totalBoardsInWorkspace(fx.workspaceId);
    expect(total).toBe(5);
  });

  it('restricted scope math: guest 5 board workspace → excludedCount = 4', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.guest.id,
    });
    const accessible = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    const total = await ctx.totalBoardsInWorkspace(fx.workspaceId);
    expect(total - accessible.length).toBe(4);
  });

  it('request-scope cache: accessibleBoardsInWorkspace ikinci çağrıda DB hit etmiyor', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.member.id,
    });
    const first = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    // Şimdi DB'den o workspace'in board'unu sil — cache'lendiyse ikinci çağrı
    // hâlâ eski sonucu döner.
    const extraBoardId = newId('b-rp-extra');
    await probe!.db.insert(boards).values({
      id: extraBoardId,
      workspaceId: fx.workspaceId,
      title: 'Sonradan eklenen',
    });
    try {
      const second = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
      // Cache hit: ilk sonuçla aynı.
      expect(second).toEqual(first);
    } finally {
      await probe!.db.delete(boards).where(dbMod.eq(boards.id, extraBoardId));
    }
  });

  it('totalListsInBoard → board 0 için 3', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.member.id,
    });
    const total = await ctx.totalListsInBoard(fx.boardIds[0]!);
    expect(total).toBe(3);
  });

  it('hasWorkspaceAccess: owner > admin > member > guest semantik doğru', async () => {
    const fx = await seedFixture();
    const ownerCtx = buildReportPermissionsCtx({ db: probe!.db, userId: fx.owner.id });
    expect(await ownerCtx.hasWorkspaceAccess(fx.workspaceId, 'owner')).toBe(true);
    expect(await ownerCtx.hasWorkspaceAccess(fx.workspaceId, 'admin')).toBe(true);

    const adminCtx = buildReportPermissionsCtx({ db: probe!.db, userId: fx.admin.id });
    expect(await adminCtx.hasWorkspaceAccess(fx.workspaceId, 'owner')).toBe(false);
    expect(await adminCtx.hasWorkspaceAccess(fx.workspaceId, 'admin')).toBe(true);
    expect(await adminCtx.hasWorkspaceAccess(fx.workspaceId, 'member')).toBe(true);

    const memberCtx = buildReportPermissionsCtx({ db: probe!.db, userId: fx.member.id });
    expect(await memberCtx.hasWorkspaceAccess(fx.workspaceId, 'admin')).toBe(false);
    expect(await memberCtx.hasWorkspaceAccess(fx.workspaceId, 'member')).toBe(true);

    const guestCtx = buildReportPermissionsCtx({ db: probe!.db, userId: fx.guest.id });
    expect(await guestCtx.hasWorkspaceAccess(fx.workspaceId, 'member')).toBe(false);
    expect(await guestCtx.hasWorkspaceAccess(fx.workspaceId, 'guest')).toBe(true);

    const outsiderCtx = buildReportPermissionsCtx({ db: probe!.db, userId: fx.outsider.id });
    expect(await outsiderCtx.hasWorkspaceAccess(fx.workspaceId, 'guest')).toBe(false);
  });

  it('bilgi sızıntısı: outsider envelope.accessibleBoards = [] (workspace board id sızıntısı yok)', async () => {
    const fx = await seedFixture();
    const ctx = buildReportPermissionsCtx({
      db: probe!.db,
      userId: fx.outsider.id,
    });
    const boards = await ctx.accessibleBoardsInWorkspace(fx.workspaceId);
    // 5 board'un hiçbir id'si dönmemeli.
    expect(boards).toEqual([]);
    for (const b of fx.boardIds) {
      expect(boards).not.toContain(b);
    }
  });
});
