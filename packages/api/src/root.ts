import { router } from './trpc';
import { authRouter } from './routers/auth';
import { boardRouter } from './routers/board';
import { cardRouter } from './routers/card';
import { healthRouter } from './routers/health';
import { listRouter } from './routers/list';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  workspace: workspaceRouter,
  board: boardRouter,
  list: listRouter,
  card: cardRouter,
});

export type AppRouter = typeof appRouter;
