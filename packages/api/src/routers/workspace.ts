import { and, count, eq, isNull } from '@pusula/db';
import { activityEvents, users, workspaceMembers, workspaces } from '@pusula/db';
import {
  archiveWorkspaceInput,
  canManageWorkspace,
  createWorkspaceInput,
  removeWorkspaceMemberInput,
  updateWorkspaceInput,
  updateWorkspaceMemberRoleInput,
  type WorkspaceRole,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { workspaceProcedure } from '../middleware/workspace';
import { protectedProcedure, router } from '../trpc';

/**
 * Workspace router — Phase 1A surface (create / read / update / archive +
 * member management). All authorization is server-side: `workspaceProcedure`
 * checks membership; the procedure body checks the finer role with
 * `@pusula/domain/permissions`. Invites (token flow) and realtime/outbox land
 * in later phases. See `docs/domain/02-yetkilendirme-kurallari.md`.
 */

/** Build an `AccessContext` from a resolved workspace role (no board context here). */
const accessFromWorkspaceRole = (workspaceRole: WorkspaceRole) => ({ workspaceRole, boardRole: null });

const workspaceMembersRouter = router({
  /** Members of the workspace, with their user profile. */
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        userId: workspaceMembers.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, ctx.workspace.id))
      .orderBy(workspaceMembers.createdAt),
  ),

  /** Change a member's workspace role. `owner` cannot be assigned or changed here. */
  updateRole: workspaceProcedure
    .input(updateWorkspaceMemberRoleInput)
    .mutation(async ({ ctx, input }) => {
      if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye rolünü değiştirme yetkiniz yok.' });
      }

      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspace.id),
              eq(workspaceMembers.userId, input.userId),
            ),
          )
          .limit(1);
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Üye bulunamadı.' });
        }
        if (target.role === 'owner') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Owner rolü değiştirilemez; önce devredilmeli.',
          });
        }
        if (target.role === input.role) {
          return { userId: input.userId, role: input.role, changed: false as const };
        }

        await tx
          .update(workspaceMembers)
          .set({ role: input.role })
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspace.id),
              eq(workspaceMembers.userId, input.userId),
            ),
          );

        await tx.insert(activityEvents).values({
          workspaceId: ctx.workspace.id,
          actorId: ctx.session.user.id,
          type: 'workspace.member_role_changed',
          payload: { userId: input.userId, fromRole: target.role, toRole: input.role },
        });

        return { userId: input.userId, role: input.role, changed: true as const };
      });
    }),

  /** Remove a member. Managers may remove anyone (except an `owner`); anyone may remove themselves. */
  remove: workspaceProcedure.input(removeWorkspaceMemberInput).mutation(async ({ ctx, input }) => {
    const isSelf = input.userId === ctx.session.user.id;
    if (!isSelf && !canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Üye çıkarma yetkiniz yok.' });
    }

    return ctx.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspace.id),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Üye bulunamadı.' });
      }
      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Owner çıkarılamaz; önce sahipliği devredin.',
        });
      }

      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspace.id),
            eq(workspaceMembers.userId, input.userId),
          ),
        );

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        type: 'workspace.member_removed',
        payload: { userId: input.userId, removedRole: target.role, self: isSelf },
      });

      return { userId: input.userId, removed: true as const };
    });
  }),

  // `members.invite` (token-based invitation flow) is a separate work item — see
  // docs/process/02-mvp-faz-plani.md (Phase 1). Not implemented in Phase 1A.
});

export const workspaceRouter = router({
  /** Workspaces the current user is a member of (active, i.e. not archived). */
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

  /** Create a workspace. The creator becomes its `owner` member. */
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

      const [workspace] = await withSlugConflict(() =>
        tx.insert(workspaces).values({ name: input.name, slug, ownerId: userId }).returning(),
      );
      if (!workspace) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: 'owner' });

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: userId,
        type: 'workspace.created',
        payload: { name: workspace.name, slug: workspace.slug },
      });

      // Realtime publish + notification outbox are added in later phases.
      return workspace;
    });
  }),

  /** Workspace shell for a member. (Board list arrives in Phase 2.) */
  get: workspaceProcedure.query(async ({ ctx }) => {
    const [workspace] = await ctx.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspace.id))
      .limit(1);
    if (!workspace) {
      // The middleware already loaded it; a race could still delete it.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
    }

    const memberCountRows = await ctx.db
      .select({ value: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ctx.workspace.id));

    return { ...workspace, role: ctx.workspace.role, memberCount: memberCountRows[0]?.value ?? 0 };
  }),

  /** Update workspace name and/or slug. Requires `admin+`. */
  update: workspaceProcedure.input(updateWorkspaceInput).mutation(async ({ ctx, input }) => {
    if (!canManageWorkspace(accessFromWorkspaceRole(ctx.workspace.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Workspace ayarlarını değiştirme yetkiniz yok.' });
    }
    if (input.name === undefined && input.slug === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Güncellenecek bir alan belirtin (name veya slug).' });
    }

    const workspaceCols = {
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      ownerId: workspaces.ownerId,
      createdAt: workspaces.createdAt,
    } as const;

    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select(workspaceCols)
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .limit(1);
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      if (input.slug !== undefined && input.slug !== current.slug) {
        const [clash] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.slug, input.slug))
          .limit(1);
        if (clash) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Bu slug zaten kullanımda.' });
        }
      }

      const patch: { name?: string; slug?: string } = {};
      if (input.name !== undefined && input.name !== current.name) patch.name = input.name;
      if (input.slug !== undefined && input.slug !== current.slug) patch.slug = input.slug;

      if (Object.keys(patch).length === 0) {
        return { ...current, changed: false as const };
      }

      const [updated] = await withSlugConflict(() =>
        tx.update(workspaces).set(patch).where(eq(workspaces.id, ctx.workspace.id)).returning(workspaceCols),
      );
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        type: 'workspace.updated',
        payload: {
          ...(patch.name !== undefined ? { fromName: current.name, toName: patch.name } : {}),
          ...(patch.slug !== undefined ? { fromSlug: current.slug, toSlug: patch.slug } : {}),
        },
      });

      return { ...updated, changed: true as const };
    });
  }),

  /** Soft-archive a workspace (`archived_at`). Owner only. */
  archive: workspaceProcedure.input(archiveWorkspaceInput).mutation(async ({ ctx }) => {
    if (ctx.workspace.role !== 'owner') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Yalnızca owner workspace arşivleyebilir.' });
    }

    return ctx.db.transaction(async (tx) => {
      const archivedAt = new Date();
      const [archived] = await tx
        .update(workspaces)
        .set({ archivedAt })
        .where(and(eq(workspaces.id, ctx.workspace.id), isNull(workspaces.archivedAt)))
        .returning({ id: workspaces.id, archivedAt: workspaces.archivedAt });
      if (!archived) {
        // Already archived (or deleted): the middleware would normally 404 first,
        // but guard against a race.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace bulunamadı.' });
      }

      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        type: 'workspace.archived',
        payload: { archivedAt: archived.archivedAt?.toISOString() ?? archivedAt.toISOString() },
      });

      return { id: archived.id, archivedAt: archived.archivedAt };
    });
  }),

  // `workspace.delete` (permanent deletion) is intentionally disabled for now —
  // see docs/domain/02-yetkilendirme-kurallari.md.

  members: workspaceMembersRouter,
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

/** True if `err` (or its cause) is a Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown): unknown =>
    typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined;
  if (codeOf(err) === '23505') return true;
  return typeof err === 'object' && err !== null && 'cause' in err
    ? codeOf((err as { cause: unknown }).cause) === '23505'
    : false;
}

/**
 * Runs `fn`, translating a Postgres unique-constraint violation into a `CONFLICT`.
 * The only user-input-driven unique constraint on `workspaces` is the slug index,
 * so a 23505 from a workspace insert/update means the slug is already taken. The
 * pre-checks in `create`/`update` give a fast, friendly path for the common case;
 * this guards the check-then-write race.
 */
async function withSlugConflict<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Bu slug zaten kullanımda.' });
    }
    throw err;
  }
}
