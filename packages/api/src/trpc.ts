import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;
export const mergeRouters = t.mergeRouters;

/** Base procedure: no auth required. */
export const publicProcedure = t.procedure;

/** Requires an authenticated session; narrows `ctx.session` to non-null. */
const enforceAuth = middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Oturum gerekli.' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// A relaxed UUID-shape guard for `clientMutationId` propagation: any 8-4-4-4-12
// hex value. The authoritative validation is still the procedure's Zod input
// (`@pusula/domain`'s `clientMutationIdSchema` → `z.string().uuid()`); this
// middleware only filters out obviously non-UUID junk so it never lands on
// `ctx.clientMutationId` (or, in turn, in an `activity_events.payload`).
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 4A (DEM-78) — best-effort `clientMutationId` propagation. Reads the
 * raw input (`getRawInput` runs before Zod validation) and copies a
 * well-formed `clientMutationId` onto `ctx.clientMutationId` so procedure
 * bodies can fold it into the `activity_events.payload` they write inside the
 * mutation's transaction (the persistent audit record). A missing or
 * malformed value is silently ignored — invalid clientMutationIds are
 * rejected downstream by the procedure's Zod input
 * (`@pusula/domain`'s `clientMutationIdSchema`). This is recording only;
 * server-side short-window dedupe lands in Phase 5 alongside outbox +
 * realtime echo filtering. See `docs/architecture/05-board-mekanigi.md` §5.2.
 */
const enforceClientMutationId = middleware(async ({ ctx, next, getRawInput }) => {
  let clientMutationId: string | undefined;
  try {
    const raw = (await getRawInput()) as { clientMutationId?: unknown } | undefined;
    const value = raw && typeof raw === 'object' ? raw.clientMutationId : undefined;
    if (typeof value === 'string' && UUID_LIKE.test(value)) {
      clientMutationId = value;
    }
  } catch {
    // `getRawInput()` throws when the procedure has no input — that just means
    // no `clientMutationId`. Same default as a missing field.
  }
  return next({ ctx: { ...ctx, clientMutationId } });
});

export const protectedProcedure = t.procedure.use(enforceClientMutationId).use(enforceAuth);
