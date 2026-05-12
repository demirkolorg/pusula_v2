import { router } from './trpc';
import { authRouter } from './routers/auth';
import { boardRouter } from './routers/board';
import { cardRouter } from './routers/card';
import { checklistRouter } from './routers/checklist';
import { commentRouter } from './routers/comment';
import { healthRouter } from './routers/health';
import { labelRouter } from './routers/label';
import { listRouter } from './routers/list';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  workspace: workspaceRouter,
  board: boardRouter,
  list: listRouter,
  card: cardRouter,
  comment: commentRouter,
  checklist: checklistRouter,
  label: labelRouter,
});

export type AppRouter = typeof appRouter;
