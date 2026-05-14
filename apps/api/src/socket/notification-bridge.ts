/**
 * Notification worker -> Socket.IO bridge (Faz 6E / DEM-94).
 *
 * The notification publish worker writes persistent `notifications` rows and
 * publishes a compact user-message on Redis. This API-side bridge subscribes
 * to that channel and emits a regular `notification.created` realtime envelope
 * to the local `user:{userId}` room so open web clients invalidate their
 * notification list/badge caches.
 */
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { roomName, type RealtimeEventEnvelope } from '@pusula/domain';
import { REALTIME_EVENT_CHANNEL } from './emit';

/** Channel name: must stay in sync with `apps/worker/src/jobs/notification-publish.ts`. */
export const NOTIFICATION_USER_CHANNEL = 'pusula:notifications:user';

export interface NotificationBridgeHandle {
  close: () => Promise<void>;
}

interface NotificationUserMessage {
  userId: string;
  notificationId: string;
  notificationType: string;
  payload: unknown;
  createdAt: string;
}

export async function attachNotificationBridge(
  io: Server,
  client: Redis,
): Promise<NotificationBridgeHandle> {
  await client.subscribe(NOTIFICATION_USER_CHANNEL);

  const onMessage = (channel: string, raw: string) => {
    if (channel !== NOTIFICATION_USER_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(
        '[api:notification-bridge] malformed message (json parse):',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (!isNotificationUserMessage(parsed)) {
      console.warn('[api:notification-bridge] malformed message (shape mismatch)');
      return;
    }

    const payload = objectPayload(parsed.payload);
    const envelope: RealtimeEventEnvelope = {
      id: `notification:${parsed.notificationId}`,
      type: 'notification.created',
      workspaceId: stringField(payload, 'workspaceId') ?? `user:${parsed.userId}`,
      boardId: stringField(payload, 'boardId') ?? undefined,
      cardId: stringField(payload, 'cardId') ?? undefined,
      actorUserId: stringField(payload, 'actorUserId') ?? parsed.userId,
      seq: 0,
      payload: {
        notificationId: parsed.notificationId,
        notificationType: parsed.notificationType,
        ...payload,
      },
      createdAt: parsed.createdAt,
    };

    io.local.to(roomName('user', parsed.userId)).emit(REALTIME_EVENT_CHANNEL, envelope);
  };

  client.on('message', onMessage);

  return {
    close: async () => {
      client.off('message', onMessage);
      await client.unsubscribe(NOTIFICATION_USER_CHANNEL).catch(() => {});
      await client.quit().catch(() => {});
    },
  };
}

function isNotificationUserMessage(value: unknown): value is NotificationUserMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<NotificationUserMessage>;
  return (
    typeof v.userId === 'string' &&
    typeof v.notificationId === 'string' &&
    typeof v.notificationType === 'string' &&
    typeof v.createdAt === 'string'
  );
}

function objectPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
