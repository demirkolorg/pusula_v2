/**
 * Audit log helper + permission guard — Faz 8E (DEM-282).
 *
 * `appendAudit` mutation transaction'ı içinde `audit_log` satırı yazar
 * (worker outbox YOK — kritik kayıt fire-and-forget olamaz; tx başarısız
 * olursa audit de yazılmamış olur). IP / User-Agent / actorId çağıran
 * mutation gövdesi tarafından `ctx.ip` / `ctx.userAgent` /
 * `ctx.session.user.id`'tan parametre olarak verilir — helper `ctx`
 * Type'ına bağımlı değil (`notification-outbox.insertNotificationOutbox`
 * pattern'i).
 *
 * `assertWorkspaceOwner` `audit.list` procedure'ünün permission gate'i:
 * yalnız `owner` rolündeki workspace member audit log görüntüler (admin
 * dahil değil — V1 sıkı tutum, V2'de owner toggle ekleyebilir).
 *
 * Detay: `docs/architecture/17-audit-log-mimarisi.md`.
 */
import { TRPCError } from '@trpc/server';
import { and, auditLog, eq, workspaceMembers } from '@pusula/db';
import type { Database } from '@pusula/db';
import type { AuditAction, AuditTargetType } from '@pusula/domain';
import type { Context } from '../context';

/** The minimal tx-or-db handle the insert needs (notification-outbox pattern). */
type Tx = Pick<Database, 'insert'>;

export interface AppendAuditInput {
  workspaceId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /** `null` = sistem / anonim aktör (kullanıcı silinmişse `ON DELETE SET NULL` aynı sonucu verir). */
  actorId: string | null;
  /** Mutation öncesi delta. `null` ise create-tipi kayıt. */
  before?: unknown;
  /** Mutation sonrası delta. Hard delete'te `null`. */
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * `audit_log` tablosuna satır ekler. **Yalnızca** kritik mutation
 * transaction'ı içinden çağırılır (mutation başarısız olursa audit de
 * yazılmamış olur — tutarlılık garantisi). Worker outbox kullanmaz.
 *
 * `migration 0041`'deki append-only trigger UPDATE/DELETE girişimlerini
 * `RAISE EXCEPTION` ile reddeder; bu helper yalnız INSERT yapar.
 */
export async function appendAudit(tx: Tx, input: AppendAuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/**
 * `audit.list` procedure gate'i — yalnız workspace owner audit log
 * görüntüleyebilir. Admin rolü dahil değil (forensic kapsam; gizlilik
 * gerekçesi: admin "kim kimi çıkardı" görmesi V1'de owner only).
 *
 * Çağırmadan önce caller workspace üyeliğini doğrulamalı
 * (`workspaceProcedure` otomatik); bu helper yalnızca rol kontrolü yapar.
 */
export async function assertWorkspaceOwner(ctx: Context, workspaceId: string): Promise<void> {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Oturum gerekli.' });
  }
  const [member] = await ctx.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, ctx.session.user.id),
      ),
    )
    .limit(1);
  if (!member || member.role !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Audit log yalnızca workspace owner tarafından görüntülenebilir.',
    });
  }
}
