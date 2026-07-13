/**
 * Integration tests for the workspace router. These hit a real Postgres
 * (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`). If no
 * database is reachable the suite is skipped rather than failing on a box
 * without infra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  cardMembers,
  cards,
  notificationOutbox,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { positionsBetween } from '@pusula/domain';
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

const ownerId = newId('u-owner');
const adminId = newId('u-admin');
const memberId = newId('u-member');
const outsiderId = newId('u-outsider');
const createdUserIds = [ownerId, adminId, memberId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db }));
}

describe.runIf(dbAvailable)('workspace router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    await db().delete(workspaces).where(dbMod.eq(workspaces.ownerId, ownerId));
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  it('create: makes the creator an owner member and writes a workspace.created activity', async () => {
    const ws = await callerFor(ownerId).workspace.create({
      name: 'Acme Inc',
      slug: newSlug('acme'),
      icon: 'rocket',
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    expect(ws.name).toBe('Acme Inc');
    expect(ws.icon).toBe('rocket');

    const members = await db()
      .select()
      .from(workspaceMembers)
      .where(dbMod.eq(workspaceMembers.workspaceId, workspaceId));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(acts.some((a) => a.type === 'workspace.created')).toBe(true);
  });

  it('create: rejects a duplicate slug with CONFLICT', async () => {
    const caller = callerFor(ownerId);
    const slug = newSlug('dup');
    await caller.workspace.create({ name: 'First', slug, clientMutationId: crypto.randomUUID() });
    await expect(
      caller.workspace.create({ name: 'Second', slug, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('list: returns the workspaces the user belongs to', async () => {
    const list = await callerFor(ownerId).workspace.list();
    expect(list.some((w) => w.id === workspaceId)).toBe(true);
    expect(list.find((w) => w.id === workspaceId)?.icon).toBe('rocket');
  });

  it('get: a non-member gets FORBIDDEN; a member gets the shell', async () => {
    await expect(callerFor(outsiderId).workspace.get({ workspaceId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const shell = await callerFor(ownerId).workspace.get({ workspaceId });
    expect(shell).toMatchObject({ id: workspaceId, icon: 'rocket', role: 'owner' });
    expect(shell.memberCount).toBeGreaterThanOrEqual(1);
  });

  it('get: an unknown workspace is NOT_FOUND', async () => {
    await expect(
      callerFor(ownerId).workspace.get({ workspaceId: 'does-not-exist' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('members: list + updateRole + remove enforce roles and write activity', async () => {
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: memberId, role: 'member' },
      ]);

    const ownerCaller = callerFor(ownerId);
    const memberList = await ownerCaller.workspace.members.list({ workspaceId });
    expect(memberList.map((m) => m.userId).sort()).toEqual([adminId, memberId, ownerId].sort());

    // A plain member cannot change roles.
    await expect(
      callerFor(memberId).workspace.members.updateRole({
        workspaceId,
        userId: adminId,
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The owner can; activity recorded.
    const res = await ownerCaller.workspace.members.updateRole({
      workspaceId,
      userId: memberId,
      role: 'admin',
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ userId: memberId, role: 'admin', changed: true });
    const roleActs = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(roleActs.some((a) => a.type === 'workspace.member_role_changed')).toBe(true);

    // Owner cannot be touched.
    await expect(
      ownerCaller.workspace.members.updateRole({
        workspaceId,
        userId: ownerId,
        role: 'admin',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      ownerCaller.workspace.members.remove({
        workspaceId,
        userId: ownerId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // A member can remove themselves.
    const removed = await callerFor(adminId).workspace.members.remove({
      workspaceId,
      userId: adminId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(removed).toMatchObject({ userId: adminId, removed: true });
    const after = await ownerCaller.workspace.members.list({ workspaceId });
    expect(after.some((m) => m.userId === adminId)).toBe(false);

    const removeActs = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(removeActs.some((a) => a.type === 'workspace.member_removed')).toBe(true);
  });

  it('update: requires admin+; updates name/slug and writes a workspace.updated activity', async () => {
    const slug = newSlug('renamed');
    const updated = await callerFor(ownerId).workspace.update({
      workspaceId,
      name: 'Acme Renamed',
      slug,
      icon: 'target',
      clientMutationId: crypto.randomUUID(),
    });
    expect(updated).toMatchObject({ name: 'Acme Renamed', slug, icon: 'target', changed: true });

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    const event = acts.find((a) => a.type === 'workspace.updated');
    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({ fromIcon: 'rocket', toIcon: 'target' });
  });

  it('archive: only the owner can archive; afterwards the workspace 404s', async () => {
    // memberId was promoted to admin earlier — still not the owner.
    await expect(
      callerFor(memberId).workspace.archive({ workspaceId, clientMutationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const ownerCaller = callerFor(ownerId);
    const archived = await ownerCaller.workspace.archive({
      workspaceId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(archived.id).toBe(workspaceId);
    expect(archived.archivedAt).toBeInstanceOf(Date);

    await expect(ownerCaller.workspace.get({ workspaceId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const list = await ownerCaller.workspace.list();
    expect(list.some((w) => w.id === workspaceId)).toBe(false);
  });
});

describe.runIf(dbAvailable)('workspace invitations (integration)', () => {
  const db = () => probe!.db;

  const invOwnerId = newId('u-inv-owner');
  const invAdminId = newId('u-inv-admin');
  const invMemberId = newId('u-inv-member');
  const inviteeId = newId('u-inv-invitee'); // has an account
  const otherUserId = newId('u-inv-other'); // wrong-email user
  const invUserIds = [invOwnerId, invAdminId, invMemberId, inviteeId, otherUserId];
  const emailOf = (id: string) => `${id}@example.test`;
  const inviteeEmail = emailOf(inviteeId).toLowerCase();
  const noAccountEmail = `no-account-${Math.random().toString(36).slice(2, 10)}@example.test`;

  let workspaceId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(invUserIds.map((id) => ({ id, name: id, email: emailOf(id) })));
    const ws = await callerFor(invOwnerId).workspace.create({
      name: 'Invite Co',
      slug: newSlug('invite-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: invAdminId, role: 'admin' },
        { workspaceId, userId: invMemberId, role: 'member' },
      ]);
  });

  afterAll(async () => {
    if (workspaceId) {
      // notification_outbox rows for an account-less invitee don't cascade on
      // user delete (recipient_id is null), so clean them up explicitly via payload.
      await db()
        .delete(notificationOutbox)
        .where(dbMod.sql`(payload->>'workspaceId') = ${workspaceId}`);
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    }
    for (const id of invUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const pendingInvites = (wsId: string) =>
    db()
      .select()
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.workspaceId, wsId));

  it('members.invite: a plain member cannot invite', async () => {
    await expect(
      callerFor(invMemberId).workspace.members.invite({
        workspaceId,
        email: emailOf(otherUserId),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('members.invite: rejects the `owner` role at the schema layer', async () => {
    // `assignableWorkspaceRoleSchema` excludes `owner` — this is a type error at
    // compile time and a Zod (BAD_REQUEST) error at runtime; cast to exercise it.
    const badInput = {
      workspaceId,
      email: emailOf(otherUserId),
      role: 'owner',
      clientMutationId: crypto.randomUUID(),
    } as unknown as Parameters<ReturnType<typeof callerFor>['workspace']['members']['invite']>[0];
    await expect(callerFor(invOwnerId).workspace.members.invite(badInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('members.invite: creates a pending invitation + activity + outbox rows (email + in-app for an account holder)', async () => {
    const res = await callerFor(invAdminId).workspace.members.invite({
      workspaceId,
      email: emailOf(inviteeId),
      role: 'member',
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ email: inviteeEmail, role: 'member', status: 'pending' });
    expect(res.expiresAt).toBeInstanceOf(Date);
    expect(res).not.toHaveProperty('token');

    const invites = await pendingInvites(workspaceId);
    const row = invites.find((i) => i.email === inviteeEmail);
    expect(row).toBeDefined();
    expect(row?.status).toBe('pending');
    expect(row?.invitedById).toBe(invAdminId);
    expect(row?.token?.length).toBeGreaterThanOrEqual(20);

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(acts.some((a) => a.type === 'workspace.member_invited')).toBe(true);

    const outbox = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.sql`(payload->>'workspaceId') = ${workspaceId}`);
    const forInvitee = outbox.filter(
      (o) =>
        o.type === 'workspace_invitation' &&
        ((o.payload as { email?: string }).email === inviteeEmail || o.recipientId === inviteeId),
    );
    expect(forInvitee.some((o) => o.channel === 'email')).toBe(true);
    expect(forInvitee.some((o) => o.channel === 'in_app' && o.recipientId === inviteeId)).toBe(
      true,
    );
    // Faz 6 review fix (W2 DEM-91): payload key adı `token` → `inviteToken`.
    // inviteToken sadece email satırının payload'unda; in-app satırında yer
    // almaz (notification-rules buildPayload whitelist'i in-app için `inviteToken`
    // alanını activity payload'ında bulduğunda taşır — bu test in-app satırının
    // activity payload'a değil, builddan üretilen kullanıcı-yüzü payload'a baktığı
    // için inviteToken görmemeli; davet kabul linki kullanıcıya email kanalıyla
    // gider, in-app'te invitation card'ı sadece "kabul et" butonuyla kapanır).
    const emailRow = forInvitee.find((o) => o.channel === 'email');
    expect(
      (emailRow?.payload as { inviteToken?: string }).inviteToken?.length,
    ).toBeGreaterThanOrEqual(20);
    const inAppRow = forInvitee.find((o) => o.channel === 'in_app');
    expect((inAppRow?.payload as { inviteToken?: string }).inviteToken).toBeUndefined();
  });

  it('members.invite: caller cannot invite themselves by e-mail — DEM-298 (BAD_REQUEST)', async () => {
    // invOwnerId already has admin+ on the workspace so the permission gate
    // passes; the self-invite guard must trip on the e-mail match (and survive
    // case normalization).
    await expect(
      callerFor(invOwnerId).workspace.members.invite({
        workspaceId,
        email: emailOf(invOwnerId),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Kendinizi davet edemezsiniz.' });
    await expect(
      callerFor(invOwnerId).workspace.members.invite({
        workspaceId,
        email: emailOf(invOwnerId).toUpperCase(),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Kendinizi davet edemezsiniz.' });
  });

  it('members.invite: a second pending invitation for the same email is CONFLICT', async () => {
    await expect(
      callerFor(invOwnerId).workspace.members.invite({
        workspaceId,
        email: emailOf(inviteeId),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('members.invite: inviting an existing member is CONFLICT', async () => {
    await expect(
      callerFor(invOwnerId).workspace.members.invite({
        workspaceId,
        email: emailOf(invMemberId),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('members.invite: inviting a bot service account by e-mail is FORBIDDEN (Task 9)', async () => {
    // Bot users are API-key-bound machine accounts; they cannot be invited to a
    // workspace. Bot e-mails are synthetic in production, but the guard keys off
    // `users.is_bot` (not the address), so a plain address suffices here.
    const botId = newId('u-inv-bot');
    await db()
      .insert(users)
      .values({ id: botId, name: 'Bot', email: emailOf(botId), isBot: true });
    invUserIds.push(botId);
    await expect(
      callerFor(invOwnerId).workspace.members.invite({
        workspaceId,
        email: emailOf(botId),
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('members: a bot service account is hidden from the member list and cannot be re-roled or removed (MAJOR-3)', async () => {
    // A bot joins a workspace only as a `guest` (via API-key management). It must
    // not surface in the human member roster, and the human member surface must
    // not re-role or remove it — that's the API-key section's job.
    const botId = newId('u-ws-mgmt-bot');
    await db()
      .insert(users)
      .values({ id: botId, name: 'Çalışma Alanı Botu', email: emailOf(botId), isBot: true });
    invUserIds.push(botId);
    await db().insert(workspaceMembers).values({ workspaceId, userId: botId, role: 'guest' });

    // hidden from the member list.
    const list = await callerFor(invOwnerId).workspace.members.list({ workspaceId });
    expect(list.some((m) => m.userId === botId)).toBe(false);

    // cannot be re-roled.
    await expect(
      callerFor(invOwnerId).workspace.members.updateRole({
        workspaceId,
        userId: botId,
        role: 'member',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // cannot be removed.
    await expect(
      callerFor(invOwnerId).workspace.members.remove({
        workspaceId,
        userId: botId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // still a workspace member (untouched).
    const [row] = await db()
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, botId),
        ),
      )
      .limit(1);
    expect(row).toMatchObject({ role: 'guest' });
  });

  it('members.invite: works for an email with no account yet (email outbox row only, recipientId null)', async () => {
    const res = await callerFor(invOwnerId).workspace.members.invite({
      workspaceId,
      email: noAccountEmail,
      role: 'guest',
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ email: noAccountEmail, role: 'guest', status: 'pending' });

    const outbox = await db()
      .select()
      .from(notificationOutbox)
      .where(dbMod.sql`(payload->>'workspaceId') = ${workspaceId}`);
    const forNoAccount = outbox.filter(
      (o) => (o.payload as { email?: string }).email === noAccountEmail,
    );
    expect(forNoAccount).toHaveLength(1);
    expect(forNoAccount[0]?.channel).toBe('email');
    expect(forNoAccount[0]?.recipientId).toBeNull();
  });

  it('invitations.list: returns only pending invitations', async () => {
    const list = await callerFor(invMemberId).workspace.invitations.list({ workspaceId });
    const emails = list.map((i) => i.email);
    expect(emails).toContain(inviteeEmail);
    expect(emails).toContain(noAccountEmail);
    expect(list.every((i) => 'expiresAt' in i)).toBe(true);
    // Inviter's display name is joined in (seed users use `name === id`).
    expect(list.find((i) => i.email === inviteeEmail)?.invitedByName).toBe(invAdminId);
    expect(list.find((i) => i.email === noAccountEmail)?.invitedByName).toBe(invOwnerId);
  });

  it('invitations.list: a non-member is FORBIDDEN', async () => {
    await expect(
      callerFor(otherUserId).workspace.invitations.list({ workspaceId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('invitations.revoke: a non-member is FORBIDDEN', async () => {
    const created = await callerFor(invOwnerId).workspace.members.invite({
      workspaceId,
      email: `revoke-fb-${Math.random().toString(36).slice(2, 10)}@example.test`,
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(otherUserId).workspace.invitations.revoke({
        workspaceId,
        invitationId: created.invitationId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('members.invite: two concurrent invites for the same email — one wins, the other is CONFLICT', async () => {
    // Race test: the partial unique index `workspace_invitations_pending_email_uq`
    // is the DB-level guarantee; this exercises the 23505 → CONFLICT translation.
    const raceEmail = `race-${Math.random().toString(36).slice(2, 10)}@example.test`;
    const owner = callerFor(invOwnerId);
    const results = await Promise.allSettled([
      owner.workspace.members.invite({
        workspaceId,
        email: raceEmail,
        clientMutationId: crypto.randomUUID(),
      }),
      owner.workspace.members.invite({
        workspaceId,
        email: raceEmail,
        clientMutationId: crypto.randomUUID(),
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'CONFLICT' });

    const rows = await db()
      .select()
      .from(workspaceInvitations)
      .where(
        dbMod.and(
          dbMod.eq(workspaceInvitations.workspaceId, workspaceId),
          dbMod.eq(workspaceInvitations.email, raceEmail),
          dbMod.eq(workspaceInvitations.status, 'pending'),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('invitations.accept: a revoked invitation token → BAD_REQUEST', async () => {
    const created = await callerFor(invOwnerId).workspace.members.invite({
      workspaceId,
      email: `revoked-accept-${Math.random().toString(36).slice(2, 10)}@example.test`,
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(invAdminId).workspace.invitations.revoke({
      workspaceId,
      invitationId: created.invitationId,
      clientMutationId: crypto.randomUUID(),
    });
    const [row] = await db()
      .select({ token: workspaceInvitations.token })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, created.invitationId))
      .limit(1);
    if (!row) throw new Error('expected the revoked invitation row');
    await expect(
      callerFor(otherUserId).workspace.invitations.accept({
        token: row.token,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('invitations.revoke: admin+ can revoke a pending invitation; activity recorded', async () => {
    // create a fresh invitation to revoke
    const created = await callerFor(invOwnerId).workspace.members.invite({
      workspaceId,
      email: emailOf(otherUserId),
      clientMutationId: crypto.randomUUID(),
    });
    // member+ cannot revoke
    await expect(
      callerFor(invMemberId).workspace.invitations.revoke({
        workspaceId,
        invitationId: created.invitationId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const res = await callerFor(invAdminId).workspace.invitations.revoke({
      workspaceId,
      invitationId: created.invitationId,
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ invitationId: created.invitationId, revoked: true });

    const rows = await pendingInvites(workspaceId);
    expect(rows.find((r) => r.id === created.invitationId)?.status).toBe('revoked');

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(acts.some((a) => a.type === 'workspace.invitation_revoked')).toBe(true);

    // revoking a non-pending invitation → BAD_REQUEST
    await expect(
      callerFor(invAdminId).workspace.invitations.revoke({
        workspaceId,
        invitationId: created.invitationId,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('invitations.mine: returns pending, non-expired invitations addressed to the caller', async () => {
    const mine = await callerFor(inviteeId).workspace.invitations.mine();
    expect(mine.some((m) => m.workspaceId === workspaceId && m.role === 'member')).toBe(true);
    expect(mine[0]).toMatchObject({ workspaceName: 'Invite Co', invitedByName: invAdminId });
    expect(mine[0]?.token?.length).toBeGreaterThanOrEqual(20);

    // a different user does not see this invitation
    const others = await callerFor(otherUserId).workspace.invitations.mine();
    expect(others.some((m) => m.workspaceId === workspaceId)).toBe(false);
  });

  it('invitations.accept: wrong email → FORBIDDEN; bad/expired token → BAD_REQUEST', async () => {
    const [row] = await db()
      .select({ token: workspaceInvitations.token })
      .from(workspaceInvitations)
      .where(
        dbMod.and(
          dbMod.eq(workspaceInvitations.workspaceId, workspaceId),
          dbMod.eq(workspaceInvitations.email, inviteeEmail),
          dbMod.eq(workspaceInvitations.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) throw new Error('expected a pending invitation for the invitee');

    // wrong-email user trying to accept
    await expect(
      callerFor(otherUserId).workspace.invitations.accept({
        token: row.token,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // unknown token
    await expect(
      callerFor(inviteeId).workspace.invitations.accept({
        token: 'this-token-does-not-exist-padding',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // expired invitation → BAD_REQUEST, status flipped to `expired`
    const [expired] = await db()
      .insert(workspaceInvitations)
      .values({
        workspaceId,
        email: emailOf(otherUserId).toLowerCase(),
        role: 'member',
        token: `expired-${Math.random().toString(36).slice(2, 12)}-padding`,
        invitedById: invOwnerId,
        status: 'pending',
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: workspaceInvitations.id, token: workspaceInvitations.token });
    await expect(
      callerFor(otherUserId).workspace.invitations.accept({
        token: expired!.token,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const [afterExpired] = await db()
      .select({ status: workspaceInvitations.status })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, expired!.id))
      .limit(1);
    expect(afterExpired?.status).toBe('expired');
  });

  it('invitations.accept: a valid invitation adds the member, closes the invitation, writes workspace.member_added', async () => {
    const [row] = await db()
      .select({ token: workspaceInvitations.token, id: workspaceInvitations.id })
      .from(workspaceInvitations)
      .where(
        dbMod.and(
          dbMod.eq(workspaceInvitations.workspaceId, workspaceId),
          dbMod.eq(workspaceInvitations.email, inviteeEmail),
          dbMod.eq(workspaceInvitations.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) throw new Error('expected a pending invitation for the invitee');

    const res = await callerFor(inviteeId).workspace.invitations.accept({
      token: row.token,
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ id: workspaceId, name: 'Invite Co', role: 'member' });

    const member = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, inviteeId),
        ),
      );
    expect(member).toHaveLength(1);
    expect(member[0]?.role).toBe('member');

    const [closed] = await db()
      .select()
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, row.id))
      .limit(1);
    expect(closed?.status).toBe('accepted');
    expect(closed?.acceptedById).toBe(inviteeId);
    expect(closed?.acceptedAt).toBeInstanceOf(Date);

    const acts = await db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.workspaceId, workspaceId));
    expect(
      acts.some(
        (a) =>
          a.type === 'workspace.member_added' &&
          (a.payload as { viaInvitation?: string }).viaInvitation === row.id,
      ),
    ).toBe(true);
  });

  it('invitations.accept: accepting again when already a member is an idempotent no-op (invitation still accepted)', async () => {
    // `invite` rejects re-inviting an existing member, so seed the row directly:
    // a fresh `pending` invitation addressed to a user who is already a member.
    const [created] = await db()
      .insert(workspaceInvitations)
      .values({
        workspaceId,
        email: inviteeEmail,
        role: 'admin',
        token: `idem-${Math.random().toString(36).slice(2, 14)}-padding`,
        invitedById: invOwnerId,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: workspaceInvitations.id, token: workspaceInvitations.token });

    const before = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, inviteeId),
        ),
      );
    expect(before).toHaveLength(1);

    const res = await callerFor(inviteeId).workspace.invitations.accept({
      token: created!.token,
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ id: workspaceId, role: 'admin' });

    const after = await db()
      .select()
      .from(workspaceMembers)
      .where(
        dbMod.and(
          dbMod.eq(workspaceMembers.workspaceId, workspaceId),
          dbMod.eq(workspaceMembers.userId, inviteeId),
        ),
      );
    // membership unchanged — accept does not re-set the role for an existing member
    expect(after).toHaveLength(1);
    expect(after[0]?.role).toBe(before[0]?.role);

    const [closed] = await db()
      .select({ status: workspaceInvitations.status })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, created!.id))
      .limit(1);
    expect(closed?.status).toBe('accepted');

    // and no extra workspace.member_added activity was written for this accept
    const memberAddedActs = await db()
      .select()
      .from(activityEvents)
      .where(
        dbMod.and(
          dbMod.eq(activityEvents.workspaceId, workspaceId),
          dbMod.eq(activityEvents.type, 'workspace.member_added'),
        ),
      );
    expect(
      memberAddedActs.some(
        (a) => (a.payload as { viaInvitation?: string }).viaInvitation === created!.id,
      ),
    ).toBe(false);
  });

  it('invitations.decline: wrong email → FORBIDDEN; matching email → status `declined`', async () => {
    const created = await callerFor(invOwnerId).workspace.members.invite({
      workspaceId,
      email: emailOf(otherUserId),
      clientMutationId: crypto.randomUUID(),
    });
    const [row] = await db()
      .select({ token: workspaceInvitations.token })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, created.invitationId))
      .limit(1);

    await expect(
      callerFor(inviteeId).workspace.invitations.decline({
        token: row!.token,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const res = await callerFor(otherUserId).workspace.invitations.decline({
      token: row!.token,
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toMatchObject({ declined: true });

    const [closed] = await db()
      .select({ status: workspaceInvitations.status })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.id, created.invitationId))
      .limit(1);
    expect(closed?.status).toBe('declined');

    // declining again → BAD_REQUEST
    await expect(
      callerFor(otherUserId).workspace.invitations.decline({
        token: row!.token,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe.runIf(dbAvailable)('workspace.delete (permanent deletion, integration)', () => {
  const db = () => probe!.db;

  const delOwnerId = newId('u-del-owner');
  const delMemberId = newId('u-del-member');
  const delUserIds = [delOwnerId, delMemberId];

  // Workspaces we may leave behind if a test fails before deletion — cleaned up
  // in afterAll (ones already hard-deleted just match nothing).
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(delUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of delUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  const makeWorkspace = async (name: string) => {
    const ws = await callerFor(delOwnerId).workspace.create({
      name,
      slug: newSlug('del'),
      clientMutationId: crypto.randomUUID(),
    });
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: delMemberId, role: 'member' });
    return ws;
  };

  it('rejects a non-owner member with FORBIDDEN', async () => {
    const ws = await makeWorkspace('Del Co A');
    await expect(
      callerFor(delMemberId).workspace.delete({
        workspaceId: ws.id,
        confirmName: ws.name,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // still there
    expect((await callerFor(delOwnerId).workspace.list()).some((w) => w.id === ws.id)).toBe(true);
  });

  it('rejects a wrong confirmName with BAD_REQUEST', async () => {
    const ws = await makeWorkspace('Del Co B');
    await expect(
      callerFor(delOwnerId).workspace.delete({
        workspaceId: ws.id,
        confirmName: `${ws.name} (wrong)`,
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await callerFor(delOwnerId).workspace.list()).some((w) => w.id === ws.id)).toBe(true);
  });

  it('owner + matching confirmName: hard-deletes the workspace; members cascade; list/get no longer see it', async () => {
    const ws = await makeWorkspace('Del Co C');
    // sanity: membership rows exist before deletion
    const membersBefore = await db()
      .select({ value: dbMod.count() })
      .from(workspaceMembers)
      .where(dbMod.eq(workspaceMembers.workspaceId, ws.id));
    expect(membersBefore[0]?.value).toBeGreaterThanOrEqual(2); // owner + delMemberId

    // seed a pending invitation so we can assert it cascades too
    await db()
      .insert(workspaceInvitations)
      .values({
        workspaceId: ws.id,
        email: `del-invite-${Math.random().toString(36).slice(2, 10)}@example.test`,
        role: 'member',
        token: `del-${Math.random().toString(36).slice(2, 14)}-padding`,
        invitedById: delOwnerId,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

    const res = await callerFor(delOwnerId).workspace.delete({
      workspaceId: ws.id,
      confirmName: ws.name,
      clientMutationId: crypto.randomUUID(),
    });
    expect(res).toEqual({ id: ws.id, deleted: true });

    // workspace row gone
    const wsRows = await db().select().from(workspaces).where(dbMod.eq(workspaces.id, ws.id));
    expect(wsRows).toHaveLength(0);

    // cascades
    const membersAfter = await db()
      .select({ value: dbMod.count() })
      .from(workspaceMembers)
      .where(dbMod.eq(workspaceMembers.workspaceId, ws.id));
    expect(membersAfter[0]?.value).toBe(0);
    const invitesAfter = await db()
      .select({ value: dbMod.count() })
      .from(workspaceInvitations)
      .where(dbMod.eq(workspaceInvitations.workspaceId, ws.id));
    expect(invitesAfter[0]?.value).toBe(0);

    // not in list anymore
    expect((await callerFor(delOwnerId).workspace.list()).some((w) => w.id === ws.id)).toBe(false);

    // a workspaceProcedure-backed call now 404s (membership row was cascaded away,
    // and the workspace itself is gone)
    await expect(callerFor(delOwnerId).workspace.get({ workspaceId: ws.id })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });

  it('an unknown workspaceId is NOT_FOUND (workspaceProcedure)', async () => {
    await expect(
      callerFor(delOwnerId).workspace.delete({
        workspaceId: 'does-not-exist',
        confirmName: 'whatever',
        clientMutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe.runIf(dbAvailable)('workspace home metadata (DEM-192, integration)', () => {
  const db = () => probe!.db;

  const homeOwnerId = newId('u-home-owner');
  const homeMemberId = newId('u-home-member');
  const homeOutsiderId = newId('u-home-outsider');
  const homeUserIds = [homeOwnerId, homeMemberId, homeOutsiderId];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(homeUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    await db().delete(workspaces).where(dbMod.eq(workspaces.ownerId, homeOwnerId));
    for (const id of homeUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  // ---------------------------------------------------- list enrichment (DEM-192)

  it('list: rows carry boardCount (active only), memberCount and lastActivityAt', async () => {
    const ws = await callerFor(homeOwnerId).workspace.create({
      name: 'Counted WS',
      slug: newSlug('counted'),
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: homeMemberId, role: 'member' });

    // Two boards, one archived — only the active one counts.
    await callerFor(homeOwnerId).board.create({
      workspaceId: ws.id,
      title: 'Active Board',
      clientMutationId: crypto.randomUUID(),
    });
    const toArchive = await callerFor(homeOwnerId).board.create({
      workspaceId: ws.id,
      title: 'Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(homeOwnerId).board.archive({
      boardId: toArchive.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    const list = await callerFor(homeOwnerId).workspace.list();
    const row = list.find((w) => w.id === ws.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ boardCount: 1, memberCount: 2 });
    // workspace.created + board.created activities exist ⇒ lastActivityAt populated.
    expect(row?.lastActivityAt).toBeInstanceOf(Date);
  });

  it('list: a freshly created workspace with no boards reports boardCount 0', async () => {
    const ws = await callerFor(homeOwnerId).workspace.create({
      name: 'Boardless WS',
      slug: newSlug('boardless'),
      clientMutationId: crypto.randomUUID(),
    });
    const list = await callerFor(homeOwnerId).workspace.list();
    const row = list.find((w) => w.id === ws.id);
    expect(row).toMatchObject({ boardCount: 0, memberCount: 1 });
  });

  // --------------------------------------------------------- stats (DEM-192)

  it('stats: counts open / completed / overdue cards inside the workspace', async () => {
    const ws = await callerFor(homeOwnerId).workspace.create({
      name: 'Stats WS',
      slug: newSlug('stats'),
      clientMutationId: crypto.randomUUID(),
    });
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: homeMemberId, role: 'member' });

    const activeBoard = await callerFor(homeOwnerId).board.create({
      workspaceId: ws.id,
      title: 'Stats Board',
      clientMutationId: crypto.randomUUID(),
    });
    const archivedBoard = await callerFor(homeOwnerId).board.create({
      workspaceId: ws.id,
      title: 'Stats Archived Board',
      clientMutationId: crypto.randomUUID(),
    });
    const activeList = await callerFor(homeOwnerId).list.create({
      boardId: activeBoard.id,
      title: 'Col',
      clientMutationId: crypto.randomUUID(),
    });
    const archivedBoardList = await callerFor(homeOwnerId).list.create({
      boardId: archivedBoard.id,
      title: 'Col',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(homeOwnerId).board.archive({
      boardId: archivedBoard.id,
      archived: true,
      clientMutationId: crypto.randomUUID(),
    });

    const now = Date.now();
    const thisWeekDone = new Date(now - 60 * 60 * 1000); // 1h ago — this week
    const lastWeekDone = new Date(now - 8 * 24 * 60 * 60 * 1000); // 8d ago — last week
    const overdueDue = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3d ago
    const dueToday = new Date(now + 60 * 60 * 1000); // in 1h — today

    const positions = positionsBetween(null, null, 7);
    // Cards on the ACTIVE board:
    //  - open card, no due date
    //  - open card, overdue
    //  - completed card this week
    //  - completed card last week
    //  - completed card with a past due date (must NOT count as overdue)
    //  - archived card (counts nowhere)
    const inserted = await db()
      .insert(cards)
      .values([
        { boardId: activeBoard.id, listId: activeList.id, title: 'Open plain', position: positions[0]! },
        {
          boardId: activeBoard.id,
          listId: activeList.id,
          title: 'Open overdue',
          position: positions[1]!,
          dueAt: overdueDue,
        },
        {
          boardId: activeBoard.id,
          listId: activeList.id,
          title: 'Done this week',
          position: positions[2]!,
          completed: true,
          completedAt: thisWeekDone,
        },
        {
          boardId: activeBoard.id,
          listId: activeList.id,
          title: 'Done last week',
          position: positions[3]!,
          completed: true,
          completedAt: lastWeekDone,
        },
        {
          boardId: activeBoard.id,
          listId: activeList.id,
          title: 'Done but past due',
          position: positions[4]!,
          completed: true,
          completedAt: thisWeekDone,
          dueAt: overdueDue,
        },
        {
          boardId: activeBoard.id,
          listId: activeList.id,
          title: 'Archived open',
          position: positions[5]!,
          archivedAt: new Date(),
        },
        // Card on the ARCHIVED board — must not count anywhere.
        {
          boardId: archivedBoard.id,
          listId: archivedBoardList.id,
          title: 'On archived board',
          position: positions[6]!,
        },
      ])
      .returning({ id: cards.id, title: cards.title });

    const overduePlainCardId = inserted.find((c) => c.title === 'Open overdue')!.id;
    const dueTodayCardId = inserted.find((c) => c.title === 'Open plain')!.id;
    // Give the open overdue card a due date today's-window twin for the
    // assignee due-today counter, and assign both open cards to the owner.
    await db()
      .update(cards)
      .set({ dueAt: dueToday })
      .where(dbMod.eq(cards.id, dueTodayCardId));
    await db()
      .insert(cardMembers)
      .values([
        { cardId: dueTodayCardId, userId: homeOwnerId, role: 'assignee' },
        { cardId: overduePlainCardId, userId: homeOwnerId, role: 'assignee' },
        // A watcher membership must NOT be counted by the assignee filter.
        { cardId: overduePlainCardId, userId: homeMemberId, role: 'watcher' },
      ]);

    const stats = await callerFor(homeOwnerId).workspace.stats({ workspaceId: ws.id });
    // Open (not completed, not archived, active board): 'Open plain' + 'Open overdue' = 2.
    expect(stats.openCount).toBe(2);
    // Completed this week: 'Done this week' + 'Done but past due' = 2.
    expect(stats.completedThisWeek).toBe(2);
    // Completed last week: 'Done last week' = 1.
    expect(stats.completedLastWeek).toBe(1);
    // Overdue: only open + past due → 'Open overdue' = 1 ('Done but past due' is completed).
    expect(stats.overdueCount).toBe(1);
    // Assigned to me + open: both open cards are assigned to the owner = 2.
    expect(stats.assignedToMeOpen).toBe(2);
    // Assigned to me + due today: only 'Open plain' has a due date inside today = 1.
    expect(stats.assignedToMeDueToday).toBe(1);

    // The member is only a `watcher`, so their assignee counters are zero.
    const memberStats = await callerFor(homeMemberId).workspace.stats({ workspaceId: ws.id });
    expect(memberStats.assignedToMeOpen).toBe(0);
    expect(memberStats.assignedToMeDueToday).toBe(0);
    // Workspace-wide counters are caller-independent.
    expect(memberStats.openCount).toBe(2);
  });

  it('stats: a non-member is FORBIDDEN', async () => {
    const ws = await callerFor(homeOwnerId).workspace.create({
      name: 'Stats Locked WS',
      slug: newSlug('stats-locked'),
      clientMutationId: crypto.randomUUID(),
    });
    await expect(
      callerFor(homeOutsiderId).workspace.stats({ workspaceId: ws.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// File-scoped teardown: the suites above share `probe`'s pool — close it once,
// after every suite in this file has finished.
afterAll(async () => {
  await probe?.pool.end();
});
