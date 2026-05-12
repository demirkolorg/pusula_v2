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
});
