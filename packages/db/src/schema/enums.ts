import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ACTIVITY_EVENT_TYPES,
  BOARD_ROLES,
  CARD_ROLES,
  MUTE_LEVELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  OUTBOX_STATUSES,
  SEARCH_ENTITY_TYPES,
  WORKSPACE_ROLES,
} from '@pusula/domain/constants';

// Postgres enums — names mirror the literal arrays in `@pusula/domain`.
export const workspaceRoleEnum = pgEnum('workspace_role', WORKSPACE_ROLES);
export const boardRoleEnum = pgEnum('board_role', BOARD_ROLES);
export const cardRoleEnum = pgEnum('card_role', CARD_ROLES);
export const activityEventTypeEnum = pgEnum('activity_event_type', ACTIVITY_EVENT_TYPES);
export const notificationChannelEnum = pgEnum('notification_channel', NOTIFICATION_CHANNELS);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const muteLevelEnum = pgEnum('mute_level', MUTE_LEVELS);
export const outboxStatusEnum = pgEnum('outbox_status', OUTBOX_STATUSES);
export const searchEntityTypeEnum = pgEnum('search_entity_type', SEARCH_ENTITY_TYPES);
