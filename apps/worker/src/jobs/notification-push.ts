/**
 * Notification push job (Faz 6B — DEM-91).
 *
 * Consumer side of the `pusula-notifications-push` queue. The job payload
 * carries `{ outboxId }`; the worker reads the `notification_outbox` row,
 * looks up the recipient's active push tokens (`push_tokens` WHERE
 * `revoked_at IS NULL`), batches them through the Expo Push API client,
 * stamps any token that comes back `DeviceNotRegistered` as revoked, then
 * marks the outbox row `processed_at = NOW() + status='sent'`.
 *
 * Faz 6 ships the *backend*: `apps/mobile` (Faz 7 — DEM-30) is the first
 * client that actually calls `push.tokens.register`. Until then most users
 * have zero active tokens; we log a warning + stamp the row (no-op send)
 * so the outbox flow is observable end-to-end.
 *
 * Mirrors the email processor's design:
 *  - `FOR UPDATE SKIP LOCKED` + `processed_at IS NULL` for idempotency.
 *  - Injectable Expo client so the test suite can assert tickets without
 *    speaking to `exp.host`.
 *  - On any throw from the SDK, the tx rolls back and BullMQ retries. The
 *    `DeviceNotRegistered` ticket is *not* a throw — it's a per-token
 *    delivery failure we handle inline by revoking that token; the rest of
 *    the batch still counts as a successful run.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Push kanalı (Expo, Faz
 * 6B)".
 */
import { and, eq, inArray, isNull, sql } from '@pusula/db';
import { notificationOutbox, pushTokens, users } from '@pusula/db';
import { createRequire } from 'node:module';
import type { Database } from '@pusula/db';
import type { NotificationType } from '@pusula/domain';
import type * as ExpoServerSdk from 'expo-server-sdk';
import { renderNotificationPush } from './notification-templates';

const require = createRequire(import.meta.url);

export const NOTIFICATION_PUSH_JOB_NAME = 'notification-push';

export type NotificationPushJobData = { outboxId: string };

export type NotificationPushOutcome =
  | { kind: 'sent'; ticketCount: number; revokedTokens: number }
  | { kind: 'skipped'; reason: 'missing' | 'no-tokens' | 'no-recipient' };

// ───────────────────────────────────────────────────────────────────────────
// Expo client surface — narrow enough to mock in tests, fat enough to map
// onto `expo-server-sdk` 1:1.
// ───────────────────────────────────────────────────────────────────────────

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicketOk {
  status: 'ok';
  id: string;
}

export interface ExpoPushTicketError {
  status: 'error';
  message: string;
  details?: { error?: string; expoPushToken?: string };
}

export type ExpoPushTicket = ExpoPushTicketOk | ExpoPushTicketError;

export interface ExpoPushClient {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(chunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

export function createDryRunExpoClient(): ExpoPushClient {
  return {
    chunkPushNotifications: (messages) => (messages.length === 0 ? [] : [messages]),
    sendPushNotificationsAsync: async (chunk) => {
      console.warn(
        `[worker:notification-push] dry-run — would send ${chunk.length} push notification(s)`,
      );
      return chunk.map((_, index) => ({ status: 'ok', id: `dry-run-${index}` }));
    },
  };
}

/**
 * Build the production Expo client lazily so worker boot doesn't crash when
 * `expo-server-sdk` isn't installed locally (Faz 6B added the dep; CI may
 * skip optional installs). Tests pass a hand-rolled client and never hit
 * this path.
 */
export function createExpoClient(args: { accessToken?: string }): ExpoPushClient {
  const mod = require('expo-server-sdk') as typeof ExpoServerSdk;
  // expo-server-sdk publishes both ESM-default and CJS named — guard both.
  const Ctor: typeof ExpoServerSdk.Expo =
    (mod as unknown as { default?: typeof ExpoServerSdk.Expo }).default ?? mod.Expo;
  const expo = new Ctor({ accessToken: args.accessToken });
  return {
    // The SDK's `ExpoPushMessage.to` is `string | string[]` (Expo allows
    // batching multiple recipients into one message). We always emit one
    // recipient per message — the cast narrows the shape but the runtime
    // values are identical.
    chunkPushNotifications: (messages) =>
      expo.chunkPushNotifications(messages as never[]) as unknown as ExpoPushMessage[][],
    sendPushNotificationsAsync: async (chunk) => {
      const tickets = await expo.sendPushNotificationsAsync(chunk as never[]);
      return tickets as unknown as ExpoPushTicket[];
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Processor
// ───────────────────────────────────────────────────────────────────────────

type OutboxRow = {
  id: string;
  recipientId: string | null;
  type: NotificationType;
  payload: unknown;
};

export async function processNotificationPushJob(
  db: Database,
  client: ExpoPushClient,
  config: { appUrl: string },
  data: NotificationPushJobData,
): Promise<NotificationPushOutcome> {
  return db.transaction(async (tx) => {
    const [row] = (await tx
      .select({
        id: notificationOutbox.id,
        recipientId: notificationOutbox.recipientId,
        type: notificationOutbox.type,
        payload: notificationOutbox.payload,
      })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.id, data.outboxId),
          eq(notificationOutbox.channel, 'push'),
          isNull(notificationOutbox.processedAt),
        ),
      )
      .limit(1)
      .for('update', { skipLocked: true })) as OutboxRow[];

    if (!row) return { kind: 'skipped', reason: 'missing' };

    if (!row.recipientId) {
      // Push notifications without a recipient_id make no sense (push is
      // device-scoped, devices are user-scoped). Stamp + skip so the sweeper
      // moves on.
      await stampSent(tx, row.id);
      return { kind: 'skipped', reason: 'no-recipient' };
    }

    const recipient = await loadRecipient(tx, row.recipientId);
    if (!recipient) {
      // The user was deleted between the outbox insert and this run.
      await stampSent(tx, row.id);
      return { kind: 'skipped', reason: 'no-recipient' };
    }

    // Active tokens only. `revoked_at IS NULL` is index-backed (Faz 6B
    // partial index `push_tokens_user_active_idx`).
    const tokens = await tx
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(
        and(
          eq(pushTokens.userId, row.recipientId),
          isNull(pushTokens.revokedAt),
        ),
      );

    if (tokens.length === 0) {
      // The common case in Faz 6: apps/mobile (Faz 7) isn't wired yet, so
      // no user has registered tokens. Warn + stamp so the outbox flow is
      // visible in logs.
      console.warn(
        `[worker:notification-push] no active tokens for user ${row.recipientId} — outbox=${row.id}`,
      );
      await stampSent(tx, row.id);
      return { kind: 'skipped', reason: 'no-tokens' };
    }

    const rendered = renderNotificationPush({
      type: row.type,
      recipient,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      appUrl: config.appUrl,
    });

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: rendered.title,
      body: rendered.body,
      data: rendered.data,
      sound: 'default',
      priority: 'high',
    }));

    const chunks = client.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      const batch = await client.sendPushNotificationsAsync(chunk);
      tickets.push(...batch);
    }

    // Find every token Expo says is dead (`DeviceNotRegistered`) and stamp it
    // revoked. Other errors (`MessageTooBig`, network) leave the token
    // active — they're operational issues, not "this device is gone".
    const deadTokens: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]!;
      if (ticket.status === 'error') {
        const code = ticket.details?.error;
        const token = messages[i]?.to;
        if (code === 'DeviceNotRegistered' && token) {
          deadTokens.push(token);
        }
      }
    }
    if (deadTokens.length > 0) {
      await tx
        .update(pushTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            inArray(pushTokens.token, deadTokens),
            isNull(pushTokens.revokedAt),
          ),
        );
    }

    // Touch last_used_at on every token we actually sent to (or tried) —
    // gives operations a "freshness" signal for stale-token pruning later.
    await tx
      .update(pushTokens)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          inArray(
            pushTokens.token,
            tokens.map((t) => t.token),
          ),
          isNull(pushTokens.revokedAt),
        ),
      );

    await stampSent(tx, row.id);
    return { kind: 'sent', ticketCount: tickets.length, revokedTokens: deadTokens.length };
  });
}

async function stampSent(tx: Database, outboxId: string): Promise<void> {
  await tx
    .update(notificationOutbox)
    .set({
      processedAt: new Date(),
      status: 'sent',
      attempts: sql`${notificationOutbox.attempts} + 1`,
    })
    .where(eq(notificationOutbox.id, outboxId));
}

async function loadRecipient(
  tx: Database,
  userId: string,
): Promise<{ name: string; email: string } | null> {
  const [row] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
