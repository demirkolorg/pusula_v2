import { sql } from '@pusula/db';
import { publicProcedure, router } from '../trpc';

export const healthRouter = router({
  /** Liveness — cheap, no I/O. */
  ping: publicProcedure.query(() => ({ ok: true as const, ts: new Date().toISOString() })),

  /** Readiness — verifies the database round-trips. */
  db: publicProcedure.query(async ({ ctx }) => {
    const started = Date.now();
    await ctx.db.execute(sql`select 1`);
    return { ok: true as const, latencyMs: Date.now() - started };
  }),
});
