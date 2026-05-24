/**
 * Audit log router — Faz 8E (DEM-282). Yalnız `audit.list`: workspace
 * owner audit log akışını okur. Mutation tarafı yok — audit yazımı kritik
 * mutationların kendi transaction'ı içinde `appendAudit` ile yapılır
 * (`packages/api/src/lib/audit-log.ts`).
 *
 * Permission: `workspaceProcedure` workspace üyeliğini doğrular,
 * `assertWorkspaceOwner` ek olarak `owner` rolünü zorlar (admin DAHİL
 * DEĞİL — forensic kapsam, V1 sıkı tutum).
 *
 * Pagination: (createdAt DESC, id DESC) bileşik cursor — aynı ms'de
 * yazılmış iki satır ayrılabilsin diye. Cursor base64-encoded JSON:
 * `{ createdAt: ISO, id: string }`.
 *
 * Detay: `docs/architecture/17-audit-log-mimarisi.md` + DEM-282.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { and, auditLog, desc, eq, lt, or, users } from '@pusula/db';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  idSchema,
  type AuditAction,
  type AuditTargetType,
} from '@pusula/domain';
import { assertWorkspaceOwner } from '../lib/audit-log';
import { workspaceProcedure } from '../middleware/workspace';
import { router } from '../trpc';

const auditListInput = z.object({
  workspaceId: idSchema,
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
});

interface CursorPayload {
  createdAt: string;
  id: string;
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export const auditRouter = router({
  /**
   * Cursor-paginated audit log akışı. Yalnız workspace owner. En yeni önce
   * (`created_at DESC, id DESC`). Filtre: action + targetType opsiyonel.
   */
  list: workspaceProcedure.input(auditListInput).query(async ({ ctx, input }) => {
    await assertWorkspaceOwner(ctx, input.workspaceId);

    const conditions = [eq(auditLog.workspaceId, input.workspaceId)];
    if (input.action) conditions.push(eq(auditLog.action, input.action satisfies AuditAction));
    if (input.targetType) {
      conditions.push(eq(auditLog.targetType, input.targetType satisfies AuditTargetType));
    }

    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      if (!cursor) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz cursor.' });
      }
      // Compound cursor: (created_at, id) < (cursor.createdAt, cursor.id).
      // SQL strict tuple comparison: `created_at < x OR (created_at = x AND id < y)`.
      const cursorDate = new Date(cursor.createdAt);
      const tupleCursor = or(
        lt(auditLog.createdAt, cursorDate),
        and(eq(auditLog.createdAt, cursorDate), lt(auditLog.id, cursor.id)),
      );
      if (tupleCursor) conditions.push(tupleCursor);
    }

    const rows = await ctx.db
      .select({
        id: auditLog.id,
        workspaceId: auditLog.workspaceId,
        actorId: auditLog.actorId,
        actorName: users.name,
        actorEmail: users.email,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        before: auditLog.before,
        after: auditLog.after,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(input.limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > input.limit) {
      const last = rows[input.limit - 1];
      rows.length = input.limit;
      if (last) nextCursor = encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
    }

    return { items: rows, nextCursor };
  }),
});
