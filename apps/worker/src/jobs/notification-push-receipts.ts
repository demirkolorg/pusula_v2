/**
 * Expo push receipt poller (push-receipt-polling follow-up).
 *
 * `notification-push.ts` only sees *tickets* — "Expo accepted the message".
 * Real APNs/FCM delivery is reported minutes later via *receipts*, fetched by
 * ticket id. Without polling them a `DeviceNotRegistered` / `MessageTooBig` /
 * `MismatchSenderId` delivery failure is invisible and dead tokens linger
 * forever — the blind spot behind the 2026-05-31 push incident triage.
 *
 * Every tick this drains `push_receipts` rows past the settle window:
 *  - `getPushNotificationReceiptsAsync(ticketIds)` returns a map keyed by
 *    ticket id; a *missing* key means Expo doesn't have a verdict yet → leave
 *    the row `checked_at IS NULL` for the next tick.
 *  - `status:'ok'`           → stamp `checked_at` (delivered).
 *  - `DeviceNotRegistered`   → revoke the token + stamp `checked_at`.
 *  - any other error         → log + stamp `checked_at` (operational, token
 *                              stays active).
 *  - older than Expo's ~24h retention with still no verdict → stamp
 *    `checked_at` so it stops being polled (`expired`).
 *
 * Mirrors the notification/realtime sweeper shape: pure function, injectable
 * Expo client, registered as a repeatable BullMQ job in `index.ts`.
 */
import { and, inArray, isNull, lt, sql } from '@pusula/db';
import { pushReceipts, pushTokens } from '@pusula/db';
import type { Database } from '@pusula/db';
import type { ExpoPushClient, ExpoPushReceipt } from './notification-push';

/** Repeatable job name registered against `pusula-notifications-push`. */
export const PUSH_RECEIPT_POLL_JOB_NAME = 'notification-push-receipts';

/** How often the poller ticks. Expo receipts settle within a few minutes. */
export const PUSH_RECEIPT_POLL_INTERVAL_MS = 15 * 60_000;

/** Minimum age before a receipt is worth fetching (avoids "not ready" churn). */
export const PUSH_RECEIPT_SETTLE_SECONDS = 60;

/** Expo retains receipts ~24h; past this with no verdict we give up. */
export const PUSH_RECEIPT_EXPIRE_HOURS = 24;

/** Cap on receipts pulled per tick (Expo's per-request ceiling is 1000). */
export const PUSH_RECEIPT_BATCH = 1000;

export interface PushReceiptSweepResult {
  /** Rows stamped `checked_at` this tick (verdicts + expirations). */
  checked: number;
  /** Distinct tokens revoked due to `DeviceNotRegistered`. */
  revokedTokens: number;
  /** Non-fatal delivery errors logged (token left active). */
  deliveryErrors: number;
  /** Rows abandoned because Expo no longer holds the receipt. */
  expired: number;
}

/**
 * One poll tick: fetch verdicts for settled-but-unchecked receipts, revoke
 * dead tokens, stamp rows. Errors from a single chunk are logged + swallowed
 * so a transient Expo blip doesn't strand the whole batch (rows stay
 * `checked_at IS NULL` and retry next tick).
 */
export async function sweepPushReceipts(
  db: Database,
  client: ExpoPushClient,
): Promise<PushReceiptSweepResult> {
  const rows = await db
    .select({
      id: pushReceipts.id,
      ticketId: pushReceipts.ticketId,
      pushTokenId: pushReceipts.pushTokenId,
      createdAt: pushReceipts.createdAt,
    })
    .from(pushReceipts)
    .where(
      and(
        isNull(pushReceipts.checkedAt),
        lt(
          pushReceipts.createdAt,
          sql`NOW() - (${PUSH_RECEIPT_SETTLE_SECONDS} * INTERVAL '1 second')`,
        ),
      ),
    )
    .orderBy(pushReceipts.createdAt)
    .limit(PUSH_RECEIPT_BATCH);

  if (rows.length === 0) {
    return { checked: 0, revokedTokens: 0, deliveryErrors: 0, expired: 0 };
  }

  // DISTINCT ticket ids — multiple receipt rows can in theory share a ticket.
  const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
  const receipts: Record<string, ExpoPushReceipt> = {};
  for (const chunk of client.chunkPushNotificationReceiptIds(ticketIds)) {
    try {
      Object.assign(receipts, await client.getPushNotificationReceiptsAsync(chunk));
    } catch (err) {
      console.warn(
        '[worker:push-receipts] receipt fetch failed for a chunk (retried next tick):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const now = Date.now();
  const expireMs = PUSH_RECEIPT_EXPIRE_HOURS * 3_600_000;
  const checkedReceiptIds: string[] = [];
  const deadTokenIds: string[] = [];
  let deliveryErrors = 0;
  let expired = 0;

  for (const r of rows) {
    const receipt = receipts[r.ticketId];
    if (!receipt) {
      // No verdict yet. Past Expo's retention window → stop polling it.
      if (now - r.createdAt.getTime() > expireMs) {
        checkedReceiptIds.push(r.id);
        expired++;
      }
      continue;
    }
    if (receipt.status === 'error') {
      const code = receipt.details?.error;
      if (code === 'DeviceNotRegistered') {
        deadTokenIds.push(r.pushTokenId);
      } else {
        deliveryErrors++;
        console.warn(
          `[worker:push-receipts] delivery error ticket=${r.ticketId} ` +
            `code=${code ?? 'unknown'}: ${receipt.message}`,
        );
      }
    }
    checkedReceiptIds.push(r.id);
  }

  const distinctDeadTokens = [...new Set(deadTokenIds)];
  if (checkedReceiptIds.length > 0 || distinctDeadTokens.length > 0) {
    await db.transaction(async (tx) => {
      if (distinctDeadTokens.length > 0) {
        await tx
          .update(pushTokens)
          .set({ revokedAt: new Date() })
          .where(and(inArray(pushTokens.id, distinctDeadTokens), isNull(pushTokens.revokedAt)));
      }
      if (checkedReceiptIds.length > 0) {
        await tx
          .update(pushReceipts)
          .set({ checkedAt: new Date() })
          .where(inArray(pushReceipts.id, checkedReceiptIds));
      }
    });
  }

  return {
    checked: checkedReceiptIds.length,
    revokedTokens: distinctDeadTokens.length,
    deliveryErrors,
    expired,
  };
}
