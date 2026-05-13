export { appRouter, type AppRouter } from './root';
export {
  createContext,
  type Context,
  type CreateContextOptions,
  type SessionInfo,
  type SessionUser,
  type CompactionScope,
  type EnqueueCompaction,
  type RealtimeEmit,
} from './context';
export {
  router,
  middleware,
  publicProcedure,
  protectedProcedure,
  createCallerFactory,
  mergeRouters,
} from './trpc';
// Board-access resolver — re-exported for host apps that need to gate
// non-tRPC entry points by the same rule (e.g. the Faz 5 Socket.IO server
// joining a `board:{boardId}` room). The tRPC procedures use it internally.
export { resolveBoardAccess, type BoardAccess } from './middleware/board-access';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './root';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
