/**
 * Audit log integration tests — Faz 8E (DEM-282).
 *
 * Kapsam:
 *  - `appendAudit` helper: tx-içi insert + cascade davranışı (user delete →
 *    actor_id SET NULL).
 *  - Immutability trigger: UPDATE ve DELETE girişimleri RAISE EXCEPTION ile
 *    reddedilir.
 *  - `audit.list` permission: yalnız workspace owner (admin / member /
 *    outsider FORBIDDEN).
 *  - Pagination: compound cursor (createdAt, id).
 *  - Workspace izolasyonu: workspace A audit'i workspace B owner'ı tarafından
 *    görülmez.
 *  - Mutation entegrasyonu: `workspace.members.updateRole` audit row yazar.
 *
 * Diğer DB testleriyle aynı pattern: gerçek Postgres bağlantısı yoksa
 * suite skip edilir.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import { auditLog, users, workspaceMembers } from '@pusula/db';
import { appendAudit } from '../lib/audit-log';
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

const ownerId = newId('u-aud-owner');
const adminId = newId('u-aud-admin');
const memberId = newId('u-aud-member');
const outsiderId = newId('u-aud-outsider');
const removableId = newId('u-aud-removable');
const otherOwnerId = newId('u-aud-other-owner');
const createdUserIds = [ownerId, adminId, memberId, outsiderId, removableId, otherOwnerId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: session(userId),
      db: probe.db,
      ip: '203.0.113.1',
      userAgent: 'vitest/audit-test',
    }),
  );
}

describe.runIf(dbAvailable)('audit log (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    // Owner için workspace + üyeler
    const ws = await callerFor(ownerId).workspace.create({
      name: 'Audit WS',
      slug: newSlug('audit'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: removableId, role: 'member' },
      ]);

    // Cross-workspace izolasyon kontrolü için ikinci workspace + owner
    const other = await callerFor(otherOwnerId).workspace.create({
      name: 'Other WS',
      slug: newSlug('other'),
      clientMutationId: crypto.randomUUID(),
    });
    otherWorkspaceId = other.id;
  });

  afterAll(async () => {
    // audit_log tx içinde silinemez (trigger), test setup'ında workspace_id
    // FK RESTRICT — temizlik için sırasıyla audit'i SQL `DROP TRIGGER` ile
    // bypass etmek gerekirdi; bunun yerine workspace'i bırakıyoruz (test DB
    // ephemeral). Sadece kullanıcıları silelim.
    for (const id of createdUserIds) {
      try {
        await db().delete(users).where(dbMod.eq(users.id, id));
      } catch {
        // workspace owner FK RESTRICT — sessiz geç.
      }
    }
  });

  describe('appendAudit helper', () => {
    it('writes a row with actor + ip + userAgent and reads it back', async () => {
      const targetId = newId('t');
      await appendAudit(db(), {
        workspaceId,
        action: 'workspace.member.role_change',
        targetType: 'user',
        targetId,
        actorId: ownerId,
        before: { role: 'member' },
        after: { role: 'admin' },
        ip: '203.0.113.42',
        userAgent: 'vitest/append',
      });

      const [row] = await db()
        .select()
        .from(auditLog)
        .where(
          dbMod.and(
            dbMod.eq(auditLog.workspaceId, workspaceId),
            dbMod.eq(auditLog.targetId, targetId),
          ),
        );
      expect(row).toBeDefined();
      expect(row?.action).toBe('workspace.member.role_change');
      expect(row?.targetType).toBe('user');
      expect(row?.actorId).toBe(ownerId);
      expect(row?.ip).toBe('203.0.113.42');
      expect(row?.userAgent).toBe('vitest/append');
      expect(row?.before).toEqual({ role: 'member' });
      expect(row?.after).toEqual({ role: 'admin' });
    });

    it('accepts actorId=null for system / anonymous audit', async () => {
      const targetId = newId('t');
      await appendAudit(db(), {
        workspaceId,
        action: 'workspace.invitation.revoke',
        targetType: 'workspace',
        targetId,
        actorId: null,
      });
      const [row] = await db()
        .select()
        .from(auditLog)
        .where(dbMod.eq(auditLog.targetId, targetId));
      expect(row?.actorId).toBeNull();
    });
  });

  describe('immutability (DB trigger)', () => {
    // Drizzle DrizzleQueryError → cause = pg native error (message:
    // "audit_log is append-only: …"). Vitest `toThrow(regex)` üst seviye
    // mesajla eşler; underlying pg mesajı `cause.message`'da.
    const auditTriggerCause = expect.objectContaining({
      message: expect.stringMatching(/append-only/i),
    });

    it('rejects UPDATE on audit_log with RAISE EXCEPTION', async () => {
      const targetId = newId('t-immut-upd');
      await appendAudit(db(), {
        workspaceId,
        action: 'board.member.remove',
        targetType: 'user',
        targetId,
        actorId: ownerId,
      });
      await expect(
        db()
          .update(auditLog)
          .set({ action: 'card.delete' })
          .where(dbMod.eq(auditLog.targetId, targetId)),
      ).rejects.toMatchObject({ cause: auditTriggerCause });
    });

    // NOT: 0044 migration'ında `audit_log_no_delete` trigger'ı düşürüldü
    // (workspace.delete cascade DELETE'ini bloklamamak için). DELETE
    // koruması artık app convention: `appendAudit` dışında bir yerde
    // `db.delete(auditLog)` çağrısı YOKtur (code review + grep gate).
    // Workspace cascade DELETE testi `workspace.delete` integration'da.
    it('allows DELETE only via workspace cascade — direct DELETE permitted at DB level (0044 trade-off)', async () => {
      const targetId = newId('t-direct-del');
      await appendAudit(db(), {
        workspaceId,
        action: 'attachment.delete',
        targetType: 'attachment',
        targetId,
        actorId: ownerId,
      });
      // Direct DELETE SUCCEEDS (no trigger) — bu kasıtlı; app code
      // konvansiyonla audit'i silmez.
      await db().delete(auditLog).where(dbMod.eq(auditLog.targetId, targetId));
      const remaining = await db()
        .select()
        .from(auditLog)
        .where(dbMod.eq(auditLog.targetId, targetId));
      expect(remaining).toHaveLength(0);
    });
  });

  describe('actor cascade (user delete → SET NULL)', () => {
    it('keeps the audit row but anonymises actor_id when the user is removed', async () => {
      const transientId = newId('u-transient');
      await db()
        .insert(users)
        .values({ id: transientId, name: transientId, email: `${transientId}@example.test` });
      const targetId = newId('t-cascade');
      await appendAudit(db(), {
        workspaceId,
        action: 'board.member.role_change',
        targetType: 'user',
        targetId,
        actorId: transientId,
      });

      await db().delete(users).where(dbMod.eq(users.id, transientId));

      const [row] = await db()
        .select()
        .from(auditLog)
        .where(dbMod.eq(auditLog.targetId, targetId));
      expect(row).toBeDefined();
      expect(row?.actorId).toBeNull();
    });
  });

  describe('audit.list permission', () => {
    it('owner: returns the workspace audit feed', async () => {
      const result = await callerFor(ownerId).audit.list({ workspaceId });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('admin: FORBIDDEN (owner-only)', async () => {
      await expect(callerFor(adminId).audit.list({ workspaceId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('member: FORBIDDEN', async () => {
      await expect(callerFor(memberId).audit.list({ workspaceId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('outsider: NOT_FOUND (workspaceProcedure middleware reddi, audit gate öncesi)', async () => {
      // outsider workspaceMembers'ta yok → workspaceProcedure NOT_FOUND/FORBIDDEN
      // verir (audit gate'e ulaşmadan). Kontrat: hangisi olursa olsun read yok.
      await expect(callerFor(outsiderId).audit.list({ workspaceId })).rejects.toMatchObject({
        code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/),
      });
    });
  });

  describe('audit.list workspace isolation', () => {
    it('owner of WS A does not see WS B audit rows', async () => {
      // WS A'ya (workspaceId) bir audit row daha yazalım, sonra otherOwnerId
      // (WS B owner'ı) WS A audit'ini iste — workspaceProcedure middleware
      // FORBIDDEN/NOT_FOUND verir (member değil).
      await appendAudit(db(), {
        workspaceId,
        action: 'share.create',
        targetType: 'share_link',
        targetId: newId('shr'),
        actorId: ownerId,
      });
      await expect(
        callerFor(otherOwnerId).audit.list({ workspaceId }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
    });

    it('audit.list scope: WS A owner görsün ama WS B kayıtları görünmesin', async () => {
      // WS B'ye bir audit yaz, owner kendisi.
      const otherTarget = newId('t-other');
      await appendAudit(db(), {
        workspaceId: otherWorkspaceId,
        action: 'share.create',
        targetType: 'share_link',
        targetId: otherTarget,
        actorId: otherOwnerId,
      });

      const result = await callerFor(ownerId).audit.list({ workspaceId });
      const targetIds = result.items.map((r) => r.targetId);
      expect(targetIds).not.toContain(otherTarget);
    });
  });

  describe('audit.list filter + pagination', () => {
    it('action filter: yalnız belirtilen action satırlarını döner', async () => {
      // Belirgin bir action ile birkaç row ekle.
      const dedicatedAction = 'card.delete' as const;
      for (let i = 0; i < 3; i++) {
        await appendAudit(db(), {
          workspaceId,
          action: dedicatedAction,
          targetType: 'card',
          targetId: newId('c'),
          actorId: ownerId,
        });
      }
      const filtered = await callerFor(ownerId).audit.list({
        workspaceId,
        action: dedicatedAction,
      });
      expect(filtered.items.length).toBeGreaterThanOrEqual(3);
      expect(filtered.items.every((r) => r.action === dedicatedAction)).toBe(true);
    });

    it('targetType filter: hedef türüne göre süzer', async () => {
      const filtered = await callerFor(ownerId).audit.list({
        workspaceId,
        targetType: 'card',
      });
      expect(filtered.items.every((r) => r.targetType === 'card')).toBe(true);
    });

    it('pagination: cursor ile sonraki sayfayı getirir, çakışma yok', async () => {
      const page1 = await callerFor(ownerId).audit.list({ workspaceId, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeTruthy();
      if (page1.nextCursor) {
        const page2 = await callerFor(ownerId).audit.list({
          workspaceId,
          limit: 2,
          cursor: page1.nextCursor,
        });
        const ids1 = new Set(page1.items.map((r) => r.id));
        const ids2 = new Set(page2.items.map((r) => r.id));
        for (const id of ids2) expect(ids1.has(id)).toBe(false);
      }
    });
  });

  describe('mutation integration', () => {
    it('workspace.members.updateRole writes a workspace.member.role_change audit row', async () => {
      // Aynı (workspaceId, action, targetId) tuple'ına filtre uygulayarak
      // başlangıç ve son sayıyı karşılaştırırız — başka testlerden gelen
      // diğer targetId satırları sayıma sızmaz.
      const filter = dbMod.and(
        dbMod.eq(auditLog.workspaceId, workspaceId),
        dbMod.eq(auditLog.action, 'workspace.member.role_change'),
        dbMod.eq(auditLog.targetId, memberId),
      );
      const before = await db().select().from(auditLog).where(filter);
      const beforeCount = before.length;

      await callerFor(ownerId).workspace.members.updateRole({
        workspaceId,
        userId: memberId,
        role: 'admin',
        clientMutationId: crypto.randomUUID(),
      });

      const after = await db().select().from(auditLog).where(filter);
      expect(after.length).toBe(beforeCount + 1);
      const fresh = after[after.length - 1];
      expect(fresh?.actorId).toBe(ownerId);
      expect(fresh?.before).toEqual({ role: 'member' });
      expect(fresh?.after).toEqual({ role: 'admin' });
    });

    it('workspace.members.remove writes a workspace.member.remove audit row', async () => {
      await callerFor(ownerId).workspace.members.remove({
        workspaceId,
        userId: removableId,
        clientMutationId: crypto.randomUUID(),
      });

      const [row] = await db()
        .select()
        .from(auditLog)
        .where(
          dbMod.and(
            dbMod.eq(auditLog.workspaceId, workspaceId),
            dbMod.eq(auditLog.action, 'workspace.member.remove'),
            dbMod.eq(auditLog.targetId, removableId),
          ),
        );
      expect(row).toBeDefined();
      expect(row?.actorId).toBe(ownerId);
      expect(row?.before).toEqual({ role: 'member' });
      expect(row?.after).toBeNull();
    });
  });
});
