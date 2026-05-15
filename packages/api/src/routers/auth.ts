import { and, asc, eq, isNull } from '@pusula/db';
import { boardMembers, boards, workspaceMembers, workspaces } from '@pusula/db';
import { protectedProcedure, publicProcedure, router } from '../trpc';

/**
 * Thin auth surface for clients. The actual sign-in/up/out flows are served by
 * Better Auth's own HTTP routes in `apps/api`; this router only exposes the
 * resolved session to tRPC consumers. Workspace/board permissions live in the
 * domain layer, not here (architecture doc §10).
 */
export const authRouter = router({
  /** Current session user, or `null` if anonymous. */
  me: publicProcedure.query(({ ctx }) => ctx.session?.user ?? null),

  /** Same as `me` but errors when unauthenticated — useful for guarded screens. */
  requireMe: protectedProcedure.query(({ ctx }) => ctx.session.user),

  /**
   * Post-auth landing target — DEM-126 (2026-05-15).
   *
   * Used by `apps/web` `RedirectIfAuthenticated` when no `?redirect=` is
   * present, so the user lands on a real board rather than the workspace
   * selector. Resolution is deterministic and storage-free:
   *
   *   1. Oldest non-archived workspace the caller is a member of
   *      (`workspaces.createdAt ASC`, `LIMIT 1`).
   *   2. Oldest non-archived board the caller can access in that workspace
   *      — `board.list` semantics: workspace `guest` only sees boards they
   *      have an explicit `board_members` row for, otherwise every board is
   *      reachable via inherited workspace role.
   *
   * Returns `null` when either step yields nothing (0 workspaces, or 0
   * accessible non-archived boards). The frontend falls back to `/` in that
   * case so the onboarding empty state / workspace selector handles it.
   */
  defaultLandingRoute: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [workspace] = await ctx.db
      .select({ id: workspaces.id, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(asc(workspaces.createdAt))
      .limit(1);
    if (!workspace) return null;

    // Guest: only boards with an explicit board_members row are visible.
    // member+: every non-archived board in the workspace is reachable
    // (inherited role for the ones without an explicit row).
    const [board] =
      workspace.role === 'guest'
        ? await ctx.db
            .select({ id: boards.id })
            .from(boards)
            .innerJoin(
              boardMembers,
              and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
            )
            .where(and(eq(boards.workspaceId, workspace.id), isNull(boards.archivedAt)))
            .orderBy(asc(boards.createdAt))
            .limit(1)
        : await ctx.db
            .select({ id: boards.id })
            .from(boards)
            .where(and(eq(boards.workspaceId, workspace.id), isNull(boards.archivedAt)))
            .orderBy(asc(boards.createdAt))
            .limit(1);
    if (!board) return null;

    return { workspaceId: workspace.id, boardId: board.id };
  }),
});
