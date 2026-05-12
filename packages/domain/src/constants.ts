/**
 * Single source of truth for the domain's enumerated string literals.
 *
 * These arrays are consumed by:
 *  - `@pusula/db`   → `pgEnum(...)` definitions (DB-level enums)
 *  - `@pusula/domain` → zod enums + TS union types (see `roles.ts`, `events.ts`)
 *
 * Keeping them here avoids drift between the database and the API contract.
 */

/** Workspace-level membership roles (most → least privileged). */
export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const;

/** Board-level membership roles (most → least privileged). */
export const BOARD_ROLES = ['admin', 'member', 'viewer'] as const;

/** Card-level relationships a user can have. */
export const CARD_ROLES = ['assignee', 'watcher'] as const;

/** Activity event types written to `activity_events`. Extend as features land. */
export const ACTIVITY_EVENT_TYPES = [
  'workspace.created',
  'workspace.member_added',
  'workspace.member_removed',
  'board.created',
  'board.updated',
  'board.archived',
  'board.member_added',
  'board.member_removed',
  'list.created',
  'list.updated',
  'list.moved',
  'list.archived',
  'card.created',
  'card.updated',
  'card.moved',
  'card.archived',
  'card.member_added',
  'card.member_removed',
  'card.label_added',
  'card.label_removed',
  'card.due_set',
  'card.due_cleared',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'checklist.created',
  'checklist.item_completed',
  'attachment.added',
  'attachment.removed',
] as const;

/** Realtime event channels delivered over Socket.IO rooms. */
export const REALTIME_ROOM_KINDS = ['workspace', 'board', 'card', 'user'] as const;

/** Notification delivery channels. */
export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const;

/** Notification source kinds (what produced the notification). */
export const NOTIFICATION_TYPES = [
  'card_assigned',
  'mention',
  'comment_reply',
  'due_approaching',
  'due_overdue',
  'board_invitation',
  'workspace_invitation',
  'watched_activity',
  'checklist_item_completed',
] as const;

/** Notification mute levels for a (user, scope) pair in `notification_preferences`. */
export const MUTE_LEVELS = ['none', 'mentions_only', 'all'] as const;

/** Outbox / search-outbox processing states. */
export const OUTBOX_STATUSES = ['pending', 'processing', 'sent', 'failed', 'dead'] as const;

/** Entity kinds indexed in `search_documents`. */
export const SEARCH_ENTITY_TYPES = ['board', 'card', 'comment', 'label'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type BoardRole = (typeof BOARD_ROLES)[number];
export type CardRole = (typeof CARD_ROLES)[number];
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
export type RealtimeRoomKind = (typeof REALTIME_ROOM_KINDS)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type MuteLevel = (typeof MUTE_LEVELS)[number];
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
