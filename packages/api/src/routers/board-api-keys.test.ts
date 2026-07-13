/**
 * Integration tests for the board-api-keys router (Public API + Bot Erişimi,
 * Task 7). These hit a real Postgres (`DATABASE_URL`, brought up by
 * `pnpm infra:up` + `pnpm db:migrate`). If no database is reachable the suite is
 * skipped rather than failing on a box without infra — mirrors
 * `board-members.test.ts`'s DB-probe pattern.
 *
 * Coverage:
 *  - `create` requires board admin (a plain member → FORBIDDEN).
 *  - `create` returns a `psk_` plain token exactly once; DB stores only the
 *    SHA-256 hash + prefix (never the plaintext).
 *  - `create` seeds a bot user (`is_bot=true`) + workspace `guest` membership +
 *    board membership with the requested role (`viewer` → board `viewer`).
 *  - `list` never leaks the plain token or hash; board admin only.
 *  - `revoke` sets `revoked_at`, deletes the bot's board + workspace memberships,
 *    keeps the bot user row; is idempotent on a second call.
 *  - Forensic audit rows `api_key.created` / `api_key.revoked` are written
 *    (plain token / hash never in the audit delta — only prefix/role/expiry).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { apiKeys, auditLog, boardMembers, users, workspaceMembers, workspaces } from '@pusula/db';
import { MAX_ACTIVE_API_KEYS_PER_BOARD } from '@pusula/domain';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';
import { hashApiKeyToken } from '../lib/api-key-token';

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
const emailOf = (id: string) => `${id}@example.test`;

// ownerId → workspace owner (= inherited board admin, can create keys).
// memberId → plain workspace member (inherits board `member`, NOT admin).
const ownerId = newId('u-bak-owner');
const memberId = newId('u-bak-member');
const createdUserIds = [ownerId, memberId];

const session = (id: string) => ({ user: { id, email: emailOf(id), name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('board-api-keys router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  const createdWorkspaceIds: string[] = [];
  const createdBotUserIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: emailOf(id) })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'API Keys Co',
      slug: newSlug('api-keys-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([{ workspaceId, userId: memberId, role: 'member' }]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'API Keys Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
  });

  afterAll(async () => {
    // Delete workspaces first (cascades boards → api_keys, board/workspace
    // members), then the (now unreferenced) bot + human user rows.
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of [...createdBotUserIds, ...createdUserIds]) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const auditFor = (targetId: string) =>
    db().select().from(auditLog).where(dbMod.eq(auditLog.targetId, targetId));

  // ---------------------------------------------------------------- create

  it('create: a plain board member (non-admin) cannot create a key (FORBIDDEN)', async () => {
    await expect(
      callerFor(memberId).board.apiKeys.create({ boardId, name: 'Nope Bot' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('create: an admin gets a one-time psk_ token; DB stores only hash + prefix; bot user + guest workspace membership + board member row are seeded', async () => {
    const res = await callerFor(ownerId).board.apiKeys.create({ boardId, name: 'CI Bot' });
    createdBotUserIds.push(res.apiKey.botUserId);

    // token is returned once, `psk_`-prefixed; metadata carries NO secret.
    expect(res.token.startsWith('psk_')).toBe(true);
    expect(res.apiKey).not.toHaveProperty('token');
    expect(res.apiKey).not.toHaveProperty('tokenHash');
    expect(res.apiKey.tokenPrefix.startsWith('psk_')).toBe(true);
    expect(res.apiKey).toMatchObject({ name: 'CI Bot', role: 'member', revokedAt: null });

    // DB row stores only the SHA-256 hash + prefix; hash matches the plain token.
    const [row] = await db()
      .select({ tokenHash: apiKeys.tokenHash, tokenPrefix: apiKeys.tokenPrefix })
      .from(apiKeys)
      .where(dbMod.eq(apiKeys.id, res.apiKey.id))
      .limit(1);
    expect(row!.tokenHash).toBe(hashApiKeyToken(res.token));
    expect(row!.tokenHash).not.toContain(res.token);
    expect(row!.tokenPrefix).toBe(res.apiKey.tokenPrefix);

    // bot user is a service account.
    const [bot] = await db()
      .select({ isBot: users.isBot, name: users.name, email: users.email })
      .from(users)
      .where(dbMod.eq(users.id, res.apiKey.botUserId))
      .limit(1);
    expect(bot).toMatchObject({ isBot: true, name: 'CI Bot' });
    expect(bot!.email).toContain('@bots.pusula.internal');

    // workspace `guest` membership (opens the door; other boards stay closed).
    const [ws] = await db()
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, res.apiKey.botUserId),
        ),
      )
      .limit(1);
    expect(ws).toMatchObject({ role: 'guest' });

    // board membership with the key role.
    const [bm] = await db()
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, res.apiKey.botUserId),
        ),
      )
      .limit(1);
    expect(bm).toMatchObject({ role: 'member' });

    // forensic audit — `api_key.created`, delta carries prefix/role/botUserId,
    // NEVER the plain token or hash.
    const audits = await auditFor(res.apiKey.id);
    const createdAudit = audits.find((a) => a.action === 'api_key.created');
    expect(createdAudit).toBeDefined();
    expect(createdAudit!.targetType).toBe('api_key');
    expect(createdAudit!.actorId).toBe(ownerId);
    expect(createdAudit!.after).toMatchObject({ tokenPrefix: res.apiKey.tokenPrefix, role: 'member' });
    expect(JSON.stringify(createdAudit!.after)).not.toContain(res.token);
    expect(JSON.stringify(createdAudit!.after)).not.toContain(hashApiKeyToken(res.token));
  });

  it('create: a viewer-role key produces a board `viewer` membership', async () => {
    const res = await callerFor(ownerId).board.apiKeys.create({
      boardId,
      name: 'Read Bot',
      role: 'viewer',
    });
    createdBotUserIds.push(res.apiKey.botUserId);
    expect(res.apiKey.role).toBe('viewer');

    const [bm] = await db()
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, res.apiKey.botUserId),
        ),
      )
      .limit(1);
    expect(bm).toMatchObject({ role: 'viewer' });
  });

  it('create: an explicit expiresAt (ISO string) is persisted', async () => {
    const iso = '2099-01-01T00:00:00.000Z';
    const res = await callerFor(ownerId).board.apiKeys.create({
      boardId,
      name: 'Expiring Bot',
      expiresAt: iso,
    });
    createdBotUserIds.push(res.apiKey.botUserId);
    expect(res.apiKey.expiresAt).toBeInstanceOf(Date);
    expect(res.apiKey.expiresAt!.toISOString()).toBe(iso);
  });

  it('create: a past expiresAt is rejected (BAD_REQUEST — L2)', async () => {
    await expect(
      callerFor(ownerId).board.apiKeys.create({
        boardId,
        name: 'Dead Bot',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('create: rejects a new key when the board already has the active-key cap; a revoke frees a slot (L4)', async () => {
    // Fresh board so the active-key count is deterministic (isolated from the
    // keys the other tests create on the shared `boardId`).
    const capBoard = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Cap Board',
      clientMutationId: crypto.randomUUID(),
    });

    // Seed exactly the cap of *active* keys directly (fast — bypasses the bot
    // user + membership churn `create` does). `bot_user_id`/`created_by` reuse an
    // existing user row purely for FK integrity; the limit only counts rows with
    // `revoked_at IS NULL` on this board.
    const seeded = Array.from({ length: MAX_ACTIVE_API_KEYS_PER_BOARD }, (_, i) => ({
      id: newId(`key-cap-${i}`),
      name: `Cap Seed ${i}`,
      tokenHash: `hash-${newId('cap')}`,
      tokenPrefix: `psk_cap${i}`,
      botUserId: ownerId,
      boardId: capBoard.id,
      role: 'member' as const,
      createdBy: ownerId,
    }));
    await db().insert(apiKeys).values(seeded);

    // The (cap+1)th active key is rejected.
    await expect(
      callerFor(ownerId).board.apiKeys.create({ boardId: capBoard.id, name: 'Overflow Bot' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Revoking one seeded key frees a slot (set `revoked_at` directly — the real
    // revoke path would delete the reused user's memberships).
    await db()
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(dbMod.eq(apiKeys.id, seeded[0]!.id));

    const created = await callerFor(ownerId).board.apiKeys.create({
      boardId: capBoard.id,
      name: 'Now Fits Bot',
    });
    createdBotUserIds.push(created.apiKey.botUserId);
    expect(created.apiKey.name).toBe('Now Fits Bot');
  });

  // ------------------------------------------------------------------ list

  it('list: returns metadata (prefix/role/botName) but never a plain token or hash; a non-admin is FORBIDDEN', async () => {
    const rows = await callerFor(ownerId).board.apiKeys.list({ boardId });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('token');
      expect(row).not.toHaveProperty('tokenHash');
      expect(row.tokenPrefix.startsWith('psk_')).toBe(true);
      expect(typeof row.botName).toBe('string');
    }

    await expect(callerFor(memberId).board.apiKeys.list({ boardId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ---------------------------------------------------------------- revoke

  it('revoke: sets revoked_at, deletes bot board + workspace memberships, keeps the bot user; writes api_key.revoked audit; idempotent on a second call', async () => {
    const created = await callerFor(ownerId).board.apiKeys.create({ boardId, name: 'Revoke Bot' });
    createdBotUserIds.push(created.apiKey.botUserId);
    const botUserId = created.apiKey.botUserId;

    const revoked = await callerFor(ownerId).board.apiKeys.revoke({
      boardId,
      apiKeyId: created.apiKey.id,
    });
    expect(revoked).toMatchObject({ id: created.apiKey.id, changed: true });
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    // revoked_at is set on the key row.
    const [keyRow] = await db()
      .select({ revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(dbMod.eq(apiKeys.id, created.apiKey.id))
      .limit(1);
    expect(keyRow!.revokedAt).not.toBeNull();

    // bot board + workspace memberships are gone.
    const bmRows = await db()
      .select()
      .from(boardMembers)
      .where(
        dbMod.and(
          dbMod.eq(boardMembers.boardId, boardId),
          dbMod.eq(boardMembers.userId, botUserId),
        ),
      );
    expect(bmRows).toHaveLength(0);
    const wsRows = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, botUserId),
        ),
      );
    expect(wsRows).toHaveLength(0);

    // bot user row survives (activity/comment attribution).
    const botRows = await db().select().from(users).where(dbMod.eq(users.id, botUserId));
    expect(botRows).toHaveLength(1);

    // forensic audit — `api_key.revoked`.
    const audits = await auditFor(created.apiKey.id);
    const revokedAudit = audits.find((a) => a.action === 'api_key.revoked');
    expect(revokedAudit).toBeDefined();
    expect(revokedAudit!.targetType).toBe('api_key');
    expect(revokedAudit!.actorId).toBe(ownerId);

    // idempotent: a second revoke is a no-op (changed:false), not an error.
    const again = await callerFor(ownerId).board.apiKeys.revoke({
      boardId,
      apiKeyId: created.apiKey.id,
    });
    expect(again).toMatchObject({ id: created.apiKey.id, changed: false });
  });

  it('revoke: a non-admin cannot revoke (FORBIDDEN); an unknown key is NOT_FOUND', async () => {
    const created = await callerFor(ownerId).board.apiKeys.create({ boardId, name: 'Guard Bot' });
    createdBotUserIds.push(created.apiKey.botUserId);

    await expect(
      callerFor(memberId).board.apiKeys.revoke({ boardId, apiKeyId: created.apiKey.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      callerFor(ownerId).board.apiKeys.revoke({ boardId, apiKeyId: newId('key-missing') }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// File-scoped teardown: close the probe pool once after every suite in this file.
afterAll(async () => {
  await probe?.pool.end();
});
