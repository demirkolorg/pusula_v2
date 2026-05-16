/**
 * Notification email job (Faz 6B — DEM-91).
 *
 * Consumer side of the `pusula-notifications-email` queue. The job payload
 * carries `{ outboxId }`; the worker reads the `notification_outbox` row,
 * joins it with `users` to get the recipient's address, renders the email
 * via `notification-templates.ts`, hands it to a Resend client, then stamps
 * `processed_at = NOW() + status='sent'`. Mirrors the Faz 5B realtime-publish
 * processor's idempotency discipline (`FOR UPDATE SKIP LOCKED` + the
 * `processed_at IS NULL` filter).
 *
 * Why a separate queue (vs. routing inside `pusula-notifications`)?
 * `notification-publish` (Faz 6A, `pusula-notifications`) is the *fan-out*
 * job — one row in, three jobs out (in_app + email + push). Each channel
 * fans out to its own dedicated queue so the channels can fail / retry /
 * dead-letter independently. The 6A producer enqueues `{ outboxId }` onto
 * `pusula-notifications-email` (this queue) when `channel='email'`.
 *
 * Best-effort with respect to the API request: a Resend failure does NOT
 * roll back the outbox row — the BullMQ retry policy on the queue gives
 * the worker three attempts (exponential backoff); a final failure marks
 * the row `status='failed'` so the dead-letter dashboard can flag it. The
 * outbox sweeper (Faz 6A) does NOT re-enqueue failed rows — only ones
 * the producer never managed to publish (`processed_at IS NULL`).
 *
 * Mailer is injectable so the test suite can assert what would have been
 * sent without speaking to Resend. The default factory wires a real
 * Resend client when `RESEND_API_KEY` is set; without a key (dev / CI) it
 * returns a logging stub that still stamps the row (so the outbox flow
 * tests work on a box with no Resend creds).
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Email kanalı (Resend,
 * Faz 6B)" and `docs/architecture/03-backend.md` "Faz 6 — notification &
 * push procedure'leri".
 */
import { and, eq, isNull, sql } from '@pusula/db';
import { notificationOutbox, notificationPreferences, users } from '@pusula/db';
import type { Database } from '@pusula/db';
import type { NotificationType } from '@pusula/domain';
import type * as ResendSdk from 'resend';
import {
  QUIET_HOURS_DEAD_REASON,
  isQuietHoursBypassType,
  isWithinQuietHours,
} from '../lib/quiet-hours';
import { renderNotificationEmail, type RenderedEmail } from './notification-templates';

export const NOTIFICATION_EMAIL_JOB_NAME = 'notification-email';

export type NotificationEmailJobData = { outboxId: string };

/** Outcome of one processor run — useful for tests + structured logs. */
export type NotificationEmailOutcome =
  | { kind: 'sent'; messageId: string | null }
  | {
      kind: 'skipped';
      reason: 'missing' | 'preference-disabled' | 'no-recipient' | 'quiet-hours';
    };

/** Minimal mailer surface — `resend.emails.send` shape; injectable for tests. */
export interface EmailMailer {
  send: (input: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<{ messageId: string | null }>;
}

/** Build the production mailer (Resend client) lazily; null without a key. */
export function createResendMailer(args: {
  apiKey: string | undefined;
  from: string;
  nodeEnv: 'development' | 'test' | 'production';
  dryRun?: boolean;
}): EmailMailer {
  if (args.dryRun || !args.apiKey) {
    return {
      // No Resend creds (or explicit dry-run) → log + pretend-success.
      // Dev/CI ergonomics; the row still gets stamped so the processor flow is
      // observable end-to-end.
      send: async (msg) => {
        const where = args.dryRun
          ? `${args.nodeEnv} dry-run`
          : args.nodeEnv === 'production'
            ? 'PROD (missing key!)'
            : args.nodeEnv;
        console.warn(
          `[worker:notification-email] RESEND_API_KEY not set (${where}) — would send to ${msg.to} (subject: ${msg.subject})`,
        );
        return { messageId: null };
      },
    };
  }
  // Lazy-load the SDK so the worker boot doesn't pay for it when Resend is
  // disabled. Keep it ESM-native because the worker app runs as `"type":
  // "module"` under tsx.
  let resend: InstanceType<typeof ResendSdk.Resend> | null = null;
  const getResend = async () => {
    if (!resend) {
      const { Resend } = await import('resend');
      resend = new Resend(args.apiKey);
    }
    return resend;
  };
  return {
    send: async (msg) => {
      const resendClient = await getResend();
      const { data, error } = await resendClient.emails.send({
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      if (error) {
        // Resend SDK returns `{ data, error }` instead of throwing on 4xx/5xx.
        // Surfacing as an Error keeps BullMQ's retry policy in charge.
        throw new Error(`resend.emails.send failed: ${error.message ?? JSON.stringify(error)}`);
      }
      return { messageId: data?.id ?? null };
    },
  };
}

/** What we read out of `notification_outbox` for one job. */
type OutboxRow = {
  id: string;
  recipientId: string | null;
  type: NotificationType;
  payload: unknown;
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
};

/**
 * Read the row, render the email, send it, stamp the outbox. Returns the
 * outcome so callers (tests + structured logs) can branch on it. `'missing'`
 * is the common idempotent case (re-enqueue after a successful run).
 */
export async function processNotificationEmailJob(
  db: Database,
  mailer: EmailMailer,
  config: { from: string; appUrl: string },
  data: NotificationEmailJobData,
): Promise<NotificationEmailOutcome> {
  return db.transaction(async (tx) => {
    // Lock the outbox row so two concurrent workers can't double-send. The
    // `processed_at IS NULL` filter makes a re-run after a crash mid-send a
    // no-op once the previous run committed.
    const [row] = (await tx
      .select({
        id: notificationOutbox.id,
        recipientId: notificationOutbox.recipientId,
        type: notificationOutbox.type,
        payload: notificationOutbox.payload,
        workspaceId: sql<string | null>`(${notificationOutbox.payload}->>'workspaceId')`,
        boardId: sql<string | null>`(${notificationOutbox.payload}->>'boardId')`,
        cardId: sql<string | null>`(${notificationOutbox.payload}->>'cardId')`,
      })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.id, data.outboxId),
          eq(notificationOutbox.channel, 'email'),
          isNull(notificationOutbox.processedAt),
        ),
      )
      .limit(1)
      .for('update', { skipLocked: true })) as OutboxRow[];

    if (!row) {
      return { kind: 'skipped', reason: 'missing' };
    }

    if (!row.recipientId) {
      // Email-only invitations (no Pusula account yet) put the destination
      // address in payload.email instead of `recipient_id` (`notification_
      // outbox.recipient_id` is nullable for exactly this case). Faz 6B's
      // first cut handles the account-having recipients only — the
      // accountless invitation flow (DEM-52) sends its own outbox row inline
      // from `board-invitations.add`, so this branch is observation-only.
      const standalone = await renderStandaloneEmail(row, config);
      if (!standalone) {
        await stampSent(tx, row.id);
        return { kind: 'skipped', reason: 'no-recipient' };
      }
      await mailer.send({ from: config.from, ...standalone });
      await stampSent(tx, row.id);
      return { kind: 'sent', messageId: null };
    }

    // Recipient lookup + preference check. Preferences pick by narrowest
    // scope (card → board → workspace → global default); a `false` toggle
    // anywhere up that chain skips the channel. `notification.created` push
    // / in-app cases live in the 6A processor — this layer only filters
    // `email_enabled`.
    const recipient = await loadRecipient(tx, row.recipientId);
    if (!recipient) {
      // The user was deleted between the outbox insert and this run. Stamp
      // the row so the sweeper doesn't keep re-enqueueing it.
      await stampSent(tx, row.id);
      return { kind: 'skipped', reason: 'no-recipient' };
    }

    const decision = await loadEmailDecision(tx, {
      userId: row.recipientId,
      workspaceId: row.workspaceId,
      boardId: row.boardId,
      cardId: row.cardId,
    });
    if (!decision.emailEnabled) {
      // Preference says "no email for this scope". Mark delivered (audit:
      // the row was *handled* — just not sent) so the sweeper moves on.
      await stampSent(tx, row.id);
      return { kind: 'skipped', reason: 'preference-disabled' };
    }

    // Faz 10F (DEM-140) — quiet hours filter. The window lives only on the
    // global preference row; mute-bypass types (mention/invitations) skip
    // this branch upstream so the user's most urgent notifications still
    // arrive inside the window. A `true` here stamps `status='dead'` with a
    // `quiet_hours_window` reason so the sweeper doesn't keep re-enqueuing
    // and the dead-letter dashboard can surface it.
    if (
      !isQuietHoursBypassType(row.type) &&
      isWithinQuietHours(decision.quietHours, { now: new Date() })
    ) {
      await stampDead(tx, row.id, QUIET_HOURS_DEAD_REASON);
      return { kind: 'skipped', reason: 'quiet-hours' };
    }

    const rendered = renderNotificationEmail({
      type: row.type,
      recipient,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      appUrl: config.appUrl,
    });

    const sent = await mailer.send({
      from: config.from,
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await stampSent(tx, row.id);
    return { kind: 'sent', messageId: sent.messageId };
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

/**
 * Faz 10F (DEM-140) — terminal stamp for "we deliberately did not send this".
 * Used by the quiet-hours filter; the row stays in the outbox for audit but
 * `status='dead'` keeps the sweeper from re-enqueuing it.
 */
async function stampDead(tx: Database, outboxId: string, reason: string): Promise<void> {
  await tx
    .update(notificationOutbox)
    .set({
      processedAt: new Date(),
      status: 'dead',
      lastError: reason,
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

/**
 * Resolve the email-channel decision for a recipient + scope:
 *
 *  - `emailEnabled` follows narrowest-scope-wins (card → board → workspace
 *    → global default = true). Mirrors `pickChannels` in
 *    `packages/api/src/lib/notification-rules.ts` — duplicated here because
 *    the rule engine emits the channel pre-decision into the outbox row,
 *    but a user can flip preferences after the row was written and the
 *    email processor must respect the latest state.
 *  - `quietHours` is the global-default triplet (Faz 10F / DEM-140). Quiet
 *    hours live only on the global row; scope overrides never carry a
 *    window (the upsert path rejects that). We always read the global row
 *    when it exists; absent global row → no window.
 *
 * One query covers both lookups since we already needed the global row for
 * the scope-cascade fallback.
 */
async function loadEmailDecision(
  tx: Database,
  scope: {
    userId: string;
    workspaceId: string | null;
    boardId: string | null;
    cardId: string | null;
  },
): Promise<{
  emailEnabled: boolean;
  quietHours: {
    quietFrom: string | null;
    quietTo: string | null;
    quietTimezone: string | null;
  } | null;
}> {
  const candidates = await tx
    .select({
      workspaceId: notificationPreferences.workspaceId,
      boardId: notificationPreferences.boardId,
      cardId: notificationPreferences.cardId,
      emailEnabled: notificationPreferences.emailEnabled,
      quietFrom: notificationPreferences.quietFrom,
      quietTo: notificationPreferences.quietTo,
      quietTimezone: notificationPreferences.quietTimezone,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, scope.userId));

  const score = (c: (typeof candidates)[number]) => {
    let s = 0;
    if (c.cardId && c.cardId === scope.cardId) s += 4;
    if (c.boardId && c.boardId === scope.boardId) s += 2;
    if (c.workspaceId && c.workspaceId === scope.workspaceId) s += 1;
    return s;
  };
  const matched = candidates
    .map((c) => ({ c, s: score(c) }))
    .filter((r) => r.s > 0 || (!r.c.workspaceId && !r.c.boardId && !r.c.cardId))
    .sort((a, b) => b.s - a.s);
  const best = matched[0]?.c;
  const emailEnabled = best ? best.emailEnabled : true;

  const globalRow = candidates.find(
    (c) => !c.workspaceId && !c.boardId && !c.cardId,
  );
  const quietHours = globalRow
    ? {
        quietFrom: globalRow.quietFrom,
        quietTo: globalRow.quietTo,
        quietTimezone: globalRow.quietTimezone,
      }
    : null;
  return { emailEnabled, quietHours };
}

/** For email-only invitations (no `recipient_id`): try to render from payload. */
function renderStandaloneEmail(
  row: OutboxRow,
  config: { appUrl: string },
): { to: string; subject: string; html: string; text: string } | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const to = typeof payload.email === 'string' ? payload.email : '';
  if (!to) return null;
  const rendered = renderNotificationEmail({
    type: row.type,
    recipient: { name: '', email: to },
    payload,
    appUrl: config.appUrl,
  });
  return { to, subject: rendered.subject, html: rendered.html, text: rendered.text };
}

export type { RenderedEmail };
