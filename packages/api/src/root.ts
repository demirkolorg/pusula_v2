import { router } from './trpc';
import { authRouter } from './routers/auth';
import { attachmentRouter } from './routers/attachment';
import { boardRouter } from './routers/board';
import { cardRouter } from './routers/card';
import { checklistRouter } from './routers/checklist';
import { commentRouter } from './routers/comment';
import { healthRouter } from './routers/health';
import { labelRouter } from './routers/label';
import { listRouter } from './routers/list';
import { notificationsRouter } from './routers/notifications';
import { pushRouter } from './routers/push';
import { workspaceRouter } from './routers/workspace';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  attachment: attachmentRouter,
  workspace: workspaceRouter,
  board: boardRouter,
  list: listRouter,
  card: cardRouter,
  comment: commentRouter,
  checklist: checklistRouter,
  label: labelRouter,
  notifications: notificationsRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
