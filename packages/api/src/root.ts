import { router } from './trpc';
import { authRouter } from './routers/auth';
import { healthRouter } from './routers/health';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
