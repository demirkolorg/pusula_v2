export { appRouter, type AppRouter } from './root';
export {
  createContext,
  type Context,
  type CreateContextOptions,
  type SessionInfo,
  type SessionUser,
  type AttachmentCleanupJobInput,
  type CompactionScope,
  type EnqueueAttachmentCleanup,
  type EnqueueCompaction,
  type EnqueueNotificationPublish,
  type EnqueueRealtimePublish,
  type InsertRealtimeEventInput,
  type ObjectStorage,
  type RealtimePayloadEnvelope,
  type RealtimeEmit,
} from './context';
export { maybeEnqueueAttachmentCleanup } from './lib/attachment-cleanup';
export { insertRealtimeEvent, maybeEnqueueRealtimePublish } from './lib/realtime-publish';
export { generateShareToken, hashShareToken } from './lib/share-token';
export {
  insertNotificationOutbox,
  maybeEnqueueNotificationPublish,
  dispatchNotificationsForActivity,
  NOTIFICATION_COOLDOWN_SECONDS,
  type InsertNotificationOutboxInput,
  type InsertOutcome as InsertNotificationOutcome,
} from './lib/notification-outbox';
export {
  computeNotifications,
  type ActivityEventForRules,
  type NotificationRule,
} from './lib/notification-rules';
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

// Workspace membership resolver — Faz 13N (DEM-270). `apps/api` socket
// `workspace:join` handler permission gate'i için.
export { resolveWorkspaceMembership } from './middleware/workspace';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './root';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
