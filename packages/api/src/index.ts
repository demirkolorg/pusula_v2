export { appRouter, type AppRouter } from './root';
export {
  createContext,
  type Context,
  type CreateContextOptions,
  type SessionInfo,
  type SessionUser,
  type CompactionScope,
  type EnqueueCompaction,
} from './context';
export {
  router,
  middleware,
  publicProcedure,
  protectedProcedure,
  createCallerFactory,
  mergeRouters,
} from './trpc';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './root';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
