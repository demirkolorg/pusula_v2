/**
 * Faz 8F (DEM-283) — `sweepExpiredInvitations` integration tests.
 *
 * `attachment-cleanup-sweeper.test.ts` pattern'i: Postgres-probe ile dev DB
 * yoksa suite skip. Sweeper'ın `pending + expires_at < NOW()` satırları
 * `expired` damgaladığı + diğer durumları (pending+aktif, accepted, revoked,
 * declined, halihazırda expired) bozmadığı + idempotent olduğu doğrulanır.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardInvitations,
  boards,
  users,
  workspaceInvitations,
  workspaces,
} from '@pusula/db';
import {
  INVITATION_EXPIRY_SWEEPER_CRON,
  INVITATION_EXPIRY_SWEEPER_JOB_NAME,
  sweepExpiredInvitations,
} from './invitation-expiry-sweeper';

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

describe('invitation-expiry-sweeper constants', () => {
  it('daily cron at 03:00', () => {
    expect(INVITATION_EXPIRY_SWEEPER_CRON).toBe('0 3 * * *');
    expect(INVITATION_EXPIRY_SWEEPER_JOB_NAME).toBe('invitation-expiry-sweeper');
  });
});

describe.runIf(dbAvailable)('sweepExpiredInvitations (integration)', () => {
  const db = () => probe!.db;

  const userId = newId('u-ies');
  const workspaceId = newId('ws-ies');
  const boardId = newId('b-ies');
  const cleanupWorkspaceInvitationIds: string[] = [];
  const cleanupBoardInvitationIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values({ id: userId, name: userId, email: `${userId}@example.test` });
    await db()
      .insert(workspaces)
      .values({ id: workspaceId, name: 'IES WS', slug: workspaceId, ownerId: userId });
    await db().insert(boards).values({ id: boardId, workspaceId, title: 'IES Board' });
  });

  afterAll(async () => {
    if (!probe) return;
    if (cleanupWorkspaceInvitationIds.length > 0) {
      await db()
        .delete(workspaceInvitations)
        .where(dbMod.inArray(workspaceInvitations.id, cleanupWorkspaceInvitationIds));
    }
    if (cleanupBoardInvitationIds.length > 0) {
      await db()
        .delete(boardInvitations)
        .where(dbMod.inArray(boardInvitations.id, cleanupBoardInvitationIds));
    }
    await db().delete(boards).where(dbMod.eq(boards.id, boardId));
    await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.eq(users.id, userId));
    await probe.pool.end();
  });

  beforeEach(async () => {
    if (cleanupWorkspaceInvitationIds.length > 0) {
      await db()
        .delete(workspaceInvitations)
        .where(dbMod.inArray(workspaceInvitations.id, cleanupWorkspaceInvitationIds));
      cleanupWorkspaceInvitationIds.length = 0;
    }
    if (cleanupBoardInvitationIds.length > 0) {
      await db()
        .delete(boardInvitations)
        .where(dbMod.inArray(boardInvitations.id, cleanupBoardInvitationIds));
      cleanupBoardInvitationIds.length = 0;
    }
  });

  async function seedWorkspaceInvitation(opts: {
    status: 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';
    expiresAt: Date;
    email?: string;
  }) {
    const id = newId('wi');
    cleanupWorkspaceInvitationIds.push(id);
    await db()
      .insert(workspaceInvitations)
      .values({
        id,
        workspaceId,
        email: opts.email ?? `${id}@example.test`,
        role: 'member',
        token: `tok-${id}-padding`,
        invitedById: userId,
        status: opts.status,
        expiresAt: opts.expiresAt,
      });
    return id;
  }

  async function seedBoardInvitation(opts: {
    status: 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';
    expiresAt: Date;
    email?: string;
  }) {
    const id = newId('bi');
    cleanupBoardInvitationIds.push(id);
    await db()
      .insert(boardInvitations)
      .values({
        id,
        boardId,
        email: opts.email ?? `${id}@example.test`,
        role: 'member',
        token: `tok-${id}-padding`,
        invitedById: userId,
        status: opts.status,
        expiresAt: opts.expiresAt,
      });
    return id;
  }

  async function readWorkspaceStatus(id: string) {
    const [row] = await db()
      .select({ status: workspaceInvitations.status })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, id));
    return row?.status;
  }
  async function readBoardStatus(id: string) {
    const [row] = await db()
      .select({ status: boardInvitations.status })
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.id, id));
    return row?.status;
  }

  it('flips pending + expired workspace invitations to "expired"', async () => {
    const expiredId = await seedWorkspaceInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const result = await sweepExpiredInvitations(db());

    expect(result.workspaceExpired).toBeGreaterThanOrEqual(1);
    expect(await readWorkspaceStatus(expiredId)).toBe('expired');
  });

  it('flips pending + expired board invitations to "expired"', async () => {
    const expiredId = await seedBoardInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const result = await sweepExpiredInvitations(db());

    expect(result.boardExpired).toBeGreaterThanOrEqual(1);
    expect(await readBoardStatus(expiredId)).toBe('expired');
  });

  it('leaves still-valid pending invitations alone (expires_at in future)', async () => {
    const futureId = await seedWorkspaceInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });
    await sweepExpiredInvitations(db());
    expect(await readWorkspaceStatus(futureId)).toBe('pending');
  });

  it('does not touch non-pending statuses (accepted/revoked/declined/expired)', async () => {
    const acceptedId = await seedWorkspaceInvitation({
      status: 'accepted',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const revokedId = await seedWorkspaceInvitation({
      status: 'revoked',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const declinedId = await seedWorkspaceInvitation({
      status: 'declined',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const alreadyExpiredId = await seedWorkspaceInvitation({
      status: 'expired',
      expiresAt: new Date(Date.now() - 60_000),
    });

    await sweepExpiredInvitations(db());

    expect(await readWorkspaceStatus(acceptedId)).toBe('accepted');
    expect(await readWorkspaceStatus(revokedId)).toBe('revoked');
    expect(await readWorkspaceStatus(declinedId)).toBe('declined');
    expect(await readWorkspaceStatus(alreadyExpiredId)).toBe('expired');
  });

  it('idempotent: second tick yields zero new flips', async () => {
    await seedWorkspaceInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const first = await sweepExpiredInvitations(db());
    expect(first.workspaceExpired).toBeGreaterThanOrEqual(1);

    const second = await sweepExpiredInvitations(db());
    expect(second.workspaceExpired).toBe(0);
    expect(second.boardExpired).toBe(0);
  });

  it('mixed batch: workspace + board expired counted separately', async () => {
    await seedWorkspaceInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 60_000),
    });
    await seedWorkspaceInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 120_000),
    });
    await seedBoardInvitation({
      status: 'pending',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const result = await sweepExpiredInvitations(db());
    expect(result.workspaceExpired).toBeGreaterThanOrEqual(2);
    expect(result.boardExpired).toBeGreaterThanOrEqual(1);
  });
});
