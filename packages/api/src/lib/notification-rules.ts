/**
 * Notification rules — Faz 6A (DEM-90).
 *
 * Pure-ish function that maps an `activity_events` row to the set of
 * (recipient × channel) notification outbox rows that should fire. "Pure-ish"
 * because the rule does need to read a few rows (card members, notification
 * preferences) — but the I/O is delegated to a `Queryable` handle that the
 * caller passes in (a transaction handle when called from a mutation body, so
 * the lookups race-safely see the same domain state the activity row was
 * written against).
 *
 * Why this layer exists
 * ---------------------
 * Mutation bodies stay tiny. After inserting an `activity_events` row, the
 * mutation calls `computeNotifications(activityEvent, ctx)` and hands the
 * result to `insertNotificationOutbox` (cooldown 60 s + per-channel row); the
 * worker `pusula-notifications` queue consumes the outbox and fans out to
 * in-app / email / push.
 *
 * Domain rules implemented here (see `docs/domain/04-bildirim-kurallari.md`):
 *  - Actor self-skip (the user who caused the event never receives a row).
 *  - Permission check: a recipient who can no longer reach the board (deleted
 *    workspace membership, no effective board role) is skipped silently.
 *  - Role merge: a user who is both `assignee` and `watcher` on the same card
 *    receives a single row, not two.
 *  - Mute-bypass: `mention` + `*_invitation` events ignore the preference's
 *    `mute_level` / `mention_only` flags. Other events respect them.
 *  - Channel hierarchy: `notification_preferences` rows are picked from the
 *    narrowest scope (card → board → workspace → global default).
 *
 * What's out of scope here
 * ------------------------
 * - The 60 s cooldown sits in `notification-outbox.ts` (it's an insert-time
 *   concern, not a rule concern).
 * - Email/push delivery (Faz 6B — DEM-91) reads the channel column off the
 *   outbox row; this layer only decides *which* channels to write.
 * - The mention parser (Faz 6C — DEM-92) lives next door
 *   (`mention-parser.ts`); it emits a `comment.mentioned` activity event,
 *   which the `comment.mentioned` rule below then consumes.
 */
import { and, eq, isNull, or } from '@pusula/db';
import type { Queryable } from '../middleware/board-access';
import {
  boardMembers,
  cardMembers,
  notificationPreferences,
  workspaceMembers,
} from '@pusula/db';
import type {
  ActivityEventType,
  NotificationChannel,
  NotificationType,
} from '@pusula/domain';

/** Minimal slice of an `activity_events` row this layer needs. */
export interface ActivityEventForRules {
  id: string;
  type: ActivityEventType;
  workspaceId: string;
  boardId: string | null;
  cardId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
}

/** One per-channel notification row to insert into `notification_outbox`. */
export interface NotificationRule {
  recipientUserId: string;
  /** One of `@pusula/domain` `NOTIFICATION_TYPES`. */
  type: NotificationType;
  channel: NotificationChannel;
  /**
   * Payload mirrored onto the outbox row; the worker hands it to whichever
   * fan-out channel ends up delivering the notification. Always carries
   * `activityType` so the worker can resolve the correct in-app copy + the
   * UI can de-duplicate when collapsing notifications by source.
   */
  payload: Record<string, unknown>;
}

/**
 * Compute the notifications that should fire for an `activity_events` row.
 * Returns one row per `(recipient, channel)` — the caller pushes each through
 * `insertNotificationOutbox` (which handles the cooldown).
 */
export async function computeNotifications(
  tx: Queryable,
  event: ActivityEventForRules,
): Promise<NotificationRule[]> {
  // Pick the rule branch by activity type. Branches share a recipient computer
  // + a channel hierarchy lookup — they only differ in *who* the audience is
  // and *which* notification type to write.
  const ctx = await loadEventContext(tx, event);
  const recipients = await collectRecipients(tx, event, ctx);
  if (recipients.size === 0) return [];

  const notificationType: NotificationType | null = mapEventToNotificationType(event);
  if (!notificationType) return [];

  const rules: NotificationRule[] = [];
  // Iterating an array keeps the order stable + lets the helper dedupe by
  // userId (role merge: same user as assignee + watcher → one entry).
  for (const recipientUserId of recipients) {
    const channels = await pickChannels(tx, recipientUserId, event, notificationType);
    for (const channel of channels) {
      rules.push({
        recipientUserId,
        type: notificationType,
        channel,
        payload: buildPayload(event, notificationType),
      });
    }
  }
  return rules;
}

// ───────────────────────────────────────────────────────────────────────────
// Event → notification type mapping
// ───────────────────────────────────────────────────────────────────────────

/**
 * Which slot in `NOTIFICATION_TYPES` does an activity event roll up to? Note
 * the domain notification taxonomy is intentionally coarser than the activity
 * taxonomy — e.g. all `card.completed` / `card.uncompleted` / `card.archived`
 * / `card.moved` events report as `watched_activity` so the UI can group them
 * under one "kart üzerinde aktivite" badge. The activity *type* is carried in
 * the payload (`activityType`) so the worker still picks a precise i18n key.
 */
function mapEventToNotificationType(
  event: ActivityEventForRules,
): NotificationType | null {
  switch (event.type) {
    case 'card.member_added':
      return 'card_assigned';
    case 'comment.created':
      return 'comment_reply';
    // `comment.mentioned` lands in Faz 6C (DEM-92) — once the mention parser
    // is in, it appends a new activity type and that branch picks `'mention'`.
    // Faz 6A stops at `comment.created` (watchers).
    case 'card.due_set':
    case 'card.due_cleared':
    case 'card.completed':
    case 'card.uncompleted':
    case 'card.archived':
    case 'card.moved':
      return 'watched_activity';
    case 'checklist.item_checked':
      return 'checklist_item_completed';
    case 'board.member_added':
      // Direct-add (account already exists) — Faz 2.5 `board-members.add (a)`
      // also writes an `email` outbox row inline. We layer an in-app row on
      // top so the recipient sees the membership in their notification
      // centre, not just in their inbox.
      return 'board_invitation';
    default:
      return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Recipient collection
// ───────────────────────────────────────────────────────────────────────────

interface EventContext {
  /** Card members on the event's card, if any (assignee + watcher). */
  cardMemberIds: Set<string>;
}

async function loadEventContext(
  tx: Queryable,
  event: ActivityEventForRules,
): Promise<EventContext> {
  const cardMemberIds = new Set<string>();
  if (event.cardId) {
    const rows = await tx
      .select({ userId: cardMembers.userId })
      .from(cardMembers)
      .where(eq(cardMembers.cardId, event.cardId));
    for (const r of rows) cardMemberIds.add(r.userId);
  }
  return { cardMemberIds };
}

/**
 * Build the `Set<userId>` of recipients for an event. Excludes the actor and
 * filters out users without effective board access (board deleted, workspace
 * membership revoked, …).
 */
async function collectRecipients(
  tx: Queryable,
  event: ActivityEventForRules,
  ctx: EventContext,
): Promise<Set<string>> {
  const candidates = new Set<string>();

  switch (event.type) {
    case 'card.member_added': {
      // The assignee/watcher being added gets the notification — they're in
      // payload.userId, not in `cardMembers` yet (the insert is in the same
      // tx; payload is the authoritative source for this branch).
      const userId = stringField(event.payload, 'userId');
      if (userId) candidates.add(userId);
      break;
    }
    case 'comment.created':
    case 'card.due_set':
    case 'card.due_cleared':
    case 'card.completed':
    case 'card.uncompleted':
    case 'card.archived':
    case 'card.moved':
    case 'checklist.item_checked':
      // The card's watcher pool — assignees + watchers. The actor is removed
      // below.
      for (const userId of ctx.cardMemberIds) candidates.add(userId);
      break;
    case 'board.member_added': {
      const userId = stringField(event.payload, 'userId');
      if (userId) candidates.add(userId);
      break;
    }
    default:
      return candidates;
  }

  // Actor self-skip — never notify the user who triggered the event.
  if (event.actorId) candidates.delete(event.actorId);
  if (candidates.size === 0) return candidates;

  // Permission filter: drop anyone who can't reach the board any more.
  // Cheaper than a per-user `resolveBoardAccess` call: one query against
  // `workspace_members` / `board_members` for the whole batch.
  if (!event.boardId) return candidates;

  const userIds = [...candidates];
  const wsRows = await tx
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, event.workspaceId));
  const wsMembers = new Set(wsRows.map((r) => r.userId));

  const bmRows = await tx
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(eq(boardMembers.boardId, event.boardId));
  const explicitBoardMembers = new Set(bmRows.map((r) => r.userId));

  // A user can reach the board if either: (a) they have an explicit
  // `board_members` row, or (b) they're a workspace member that is *not* a
  // `guest` (owner/admin/member all see every board in the workspace). Guests
  // need the explicit row. The rule mirrors `effectiveBoardRole` in
  // `@pusula/domain/permissions`.
  const wsGuestIds = new Set<string>();
  if (userIds.length > 0) {
    const guestRows = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, event.workspaceId),
          eq(workspaceMembers.role, 'guest'),
        ),
      );
    for (const r of guestRows) wsGuestIds.add(r.userId);
  }

  const filtered = new Set<string>();
  for (const userId of userIds) {
    const hasExplicit = explicitBoardMembers.has(userId);
    const isWsMember = wsMembers.has(userId);
    if (!isWsMember) continue; // workspace membership revoked
    if (wsGuestIds.has(userId) && !hasExplicit) continue; // guest, no board seat
    filtered.add(userId);
  }
  return filtered;
}

// ───────────────────────────────────────────────────────────────────────────
// Channel hierarchy lookup
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pick the channels (`in_app` / `email` / `push`) the recipient wants for this
 * event. Walks the narrowest-scope-wins hierarchy in
 * `notification_preferences` (card → board → workspace → global default). All
 * channels default to ON; `mute_level=all` / `mention_only` / explicit
 * `*_enabled=false` toggles knock channels out. `mention` + `*_invitation`
 * always reach the recipient (mute-bypass).
 */
async function pickChannels(
  tx: Queryable,
  recipientUserId: string,
  event: ActivityEventForRules,
  notificationType: NotificationType,
): Promise<NotificationChannel[]> {
  const muteBypass =
    notificationType === 'mention' ||
    notificationType === 'board_invitation' ||
    notificationType === 'workspace_invitation';

  const preference = await loadPreference(tx, recipientUserId, event);

  // Effective preference (preferred-then-default) — `null` means "no override
  // anywhere" → use defaults.
  const muteLevel = preference?.muteLevel ?? 'none';
  const mentionOnly = preference?.mentionOnly ?? false;
  const pushEnabled = preference?.pushEnabled ?? true;
  const emailEnabled = preference?.emailEnabled ?? true;

  if (!muteBypass) {
    if (muteLevel === 'all') return [];
    // Cast through `string` so the TS control-flow analysis doesn't narrow
    // `notificationType` to whatever subset of literals `mapEventToNotificationType`
    // currently emits — Faz 6C extends this with `'mention'`, and we want the
    // mute-bypass branch to keep working without churn.
    const typeStr = notificationType as string;
    if (mentionOnly && typeStr !== 'mention') return [];
    if (muteLevel === 'mentions_only' && typeStr !== 'mention') return [];
  }

  // In-app is always written when *any* channel is on — the badge needs it.
  const channels: NotificationChannel[] = ['in_app'];

  // Push: per the domain spec, `card_assigned` + `mention` + `due_*` opt in by
  // default; the rest (`watched_activity`, `comment_reply`, `checklist_*`) are
  // in-app only unless the user explicitly opted in (push_enabled is a *gate*,
  // not a request — the rule decides whether to even consider push).
  const pushByType =
    notificationType === 'card_assigned' ||
    notificationType === 'mention' ||
    notificationType === 'due_approaching' ||
    notificationType === 'due_overdue';
  if (pushByType && pushEnabled) channels.push('push');

  // Email: per the domain spec, the heavy-touch types — `card_assigned`,
  // `mention`, `due_overdue`, invitations — opt in by default; the rest stay
  // in-app/push.
  const emailByType =
    notificationType === 'card_assigned' ||
    notificationType === 'mention' ||
    notificationType === 'due_overdue' ||
    notificationType === 'board_invitation' ||
    notificationType === 'workspace_invitation';
  if (emailByType && emailEnabled) channels.push('email');

  return channels;
}

type PreferenceRow = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
};

/**
 * Resolve the most specific `notification_preferences` row that applies — card
 * scope wins, then board, then workspace, then the global (all-null) default.
 * Issues *one* query (an `OR` over the four scopes) + picks the narrowest hit
 * in code so we don't round-trip four times.
 */
async function loadPreference(
  tx: Queryable,
  userId: string,
  event: ActivityEventForRules,
): Promise<PreferenceRow | null> {
  const scopes = [
    event.cardId ? eq(notificationPreferences.cardId, event.cardId) : undefined,
    event.boardId ? eq(notificationPreferences.boardId, event.boardId) : undefined,
    eq(notificationPreferences.workspaceId, event.workspaceId),
    // Global default (all-null) — picked last.
    and(
      isNull(notificationPreferences.workspaceId),
      isNull(notificationPreferences.boardId),
      isNull(notificationPreferences.cardId),
    ),
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  const rows = await tx
    .select({
      muteLevel: notificationPreferences.muteLevel,
      mentionOnly: notificationPreferences.mentionOnly,
      pushEnabled: notificationPreferences.pushEnabled,
      emailEnabled: notificationPreferences.emailEnabled,
      workspaceId: notificationPreferences.workspaceId,
      boardId: notificationPreferences.boardId,
      cardId: notificationPreferences.cardId,
    })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), or(...scopes)));

  if (rows.length === 0) return null;

  // Narrowest-scope-wins. Score each row + take the highest score.
  let best: { row: (typeof rows)[number]; score: number } | null = null;
  for (const row of rows) {
    let score = 0;
    if (row.cardId && event.cardId && row.cardId === event.cardId) score = 4;
    else if (row.boardId && event.boardId && row.boardId === event.boardId) score = 3;
    else if (row.workspaceId && row.workspaceId === event.workspaceId) score = 2;
    else if (!row.workspaceId && !row.boardId && !row.cardId) score = 1;
    if (!best || score > best.score) best = { row, score };
  }
  if (!best) return null;
  return {
    muteLevel: best.row.muteLevel,
    mentionOnly: best.row.mentionOnly,
    pushEnabled: best.row.pushEnabled,
    emailEnabled: best.row.emailEnabled,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Notification outbox payload mirrors a tight slice of the activity payload
 * plus the bookkeeping the UI / worker need at delivery time. Keep it small —
 * outbox rows get cloned into `notifications.payload` for the in-app channel.
 */
function buildPayload(
  event: ActivityEventForRules,
  notificationType: NotificationType,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    activityType: event.type,
    notificationType,
  };
  if (event.actorId) payload.actorUserId = event.actorId;
  if (event.boardId) payload.boardId = event.boardId;
  if (event.cardId) payload.cardId = event.cardId;
  if (event.workspaceId) payload.workspaceId = event.workspaceId;
  // Carry through the small handful of activity payload keys the UI uses for
  // links + previews. Whitelist over copy-everything — activity payloads
  // sometimes carry internal-only fields (clientMutationId, fromCoverColor)
  // that don't belong in a user-facing notification.
  for (const key of [
    'commentId',
    'checklistId',
    'itemId',
    'fromListId',
    'toListId',
    'fromBoardId',
    'toBoardId',
    'invitationId',
    'role',
    'title',
    'dueAt',
  ] as const) {
    const v = event.payload[key];
    if (v !== undefined && v !== null) payload[key] = v;
  }
  return payload;
}
