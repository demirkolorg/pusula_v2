import { and, eq, isNull } from '@pusula/db';
import { workspaceMembers, workspaces } from '@pusula/db';
import { createWorkspaceInput } from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

/**
 * Workspace router — minimal surface for the skeleton. Phase 1 expands this
 * (invites, member management, archiving). All checks are server-side;
 * `protectedProcedure` guarantees a session.
 */
export const workspaceRouter = router({
  /** Workspaces the current user is a member of. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(workspaces.createdAt);
  }),

  create: protectedProcedure.input(createWorkspaceInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const slug = input.slug ?? slugify(input.name);

    return ctx.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, slug))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Bu slug zaten kullanımda.' });
      }

      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: input.name, slug, ownerId: userId })
        .returning();
      if (!workspace) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: 'owner' });

      // TODO(Phase 1): activity_events + realtime_events + notification_outbox in this tx.
      return workspace;
    });
  }),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : suffix;
}
