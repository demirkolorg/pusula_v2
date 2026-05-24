/**
 * `workspaceProcedure` — `protectedProcedure` + a middleware that resolves the
 * `workspaceId` from the procedure input, loads the workspace row, and checks
 * that the current user is a member.
 *
 * This is the *enforcement* point only ("is the caller a member?"); fine-grained
 * authorization (`canManageWorkspace`, owner-only actions, …) is done in the
 * procedure body with `@pusula/domain/permissions`. See
 * `docs/architecture/03-backend.md` and `docs/domain/02-yetkilendirme-kurallari.md`.
 *
 * - Workspace not found OR archived → `NOT_FOUND`.
 * - Caller is not a `workspace_members` row → `FORBIDDEN`.
 * - Otherwise `ctx.workspace = { id, role }` is added for downstream use.
 *
 * The procedure pre-declares `{ workspaceId: string }` as input; consumers may
 * `.input(...)` additional fields. The middleware reads only `workspaceId` from
 * the raw input.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { and, eq } from '@pusula/db';
import { workspaceMembers, workspaces } from '@pusula/db';
import type { Database } from '@pusula/db';
import { idSchema } from '@pusula/domain';
import type { WorkspaceRole } from '@pusula/domain';
import { protectedProcedure } from '../trpc';

/**
 * Faz 13N (DEM-270) — workspace üyelik resolver'ı socket
 * `workspace:join` handshake'i için. Sunucu workspace_members satırını
 * okur, üye değilse null döner. Archived workspace de aktif workspace
 * gibi davranır — UI tarafında archived rapor da görünebilir, stale
 * event'i de o workspace'in üyelerine ulaşır.
 */
export async function resolveWorkspaceMembership(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<{ role: WorkspaceRole } | null> {
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  if (!membership) return null;
  return { role: membership.role as WorkspaceRole };
}

/** Minimal shape the workspace middleware needs from the procedure input. */
const workspaceIdInput = z.object({ workspaceId: idSchema });

/** The workspace context attached by `workspaceProcedure`. */
export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
}

/**
 * Procedure for any operation scoped to a workspace the caller is a member of.
 * Input always includes `workspaceId: string`.
 */
export const workspaceProcedure = protectedProcedure
  .input(workspaceIdInput)
  .use(async ({ ctx, next, getRawInput }) => {
    const parsed = workspaceIdInput.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId gerekli.' });
    }
    const { workspaceId } = parsed.data;

    const [workspace] = await ctx.db
      .select({ id: workspaces.id, archivedAt: workspaces.archivedAt })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace || workspace.archivedAt) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
    }

    const [membership] = await ctx.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, ctx.session.user.id),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bu workspace üyesi değilsiniz.' });
    }

    return next({
      ctx: {
        ...ctx,
        workspace: { id: workspace.id, role: membership.role } satisfies WorkspaceContext,
      },
    });
  });
