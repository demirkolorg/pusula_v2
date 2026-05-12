import { router } from './trpc';
import { authRouter } from './routers/auth';
import { boardRouter } from './routers/board';
import { healthRouter } from './routers/health';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  workspace: workspaceRouter,
  board: boardRouter,
});

export type AppRouter = typeof appRouter;
