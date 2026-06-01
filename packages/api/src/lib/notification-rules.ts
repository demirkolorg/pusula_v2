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
  boards,
  boardMembers,
  cardMembers,
  cards,
  notificationPreferences,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import type { ActivityEventType, NotificationChannel, NotificationType } from '@pusula/domain';

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

  const payloadContext = await loadPayloadContext(tx, event);
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
        payload: buildPayload(event, notificationType, payloadContext),
      });
    }
  }
  return rules;
}

// ───────────────────────────────────────────────────────────────────────────
// Event → notification type mapping
// ───────────────────────────────────────────────────────────────────────────

/**
 * Which slot in `NOTIFICATION_TYPES` does an activity event roll up to? The
 * notification taxonomy is still coarser than the activity taxonomy in places
 * (`card.completed` + `card.uncompleted` both report `card_completed`), but
 * DEM-152 split the old `watched_activity` catch-all into seven granular
 * card-activity types so the UI can show a distinct icon + copy per kind. The
 * activity *type* is still carried in the payload (`activityType`) so the
 * worker can pick a precise i18n key (e.g. completed vs uncompleted).
 */
function mapEventToNotificationType(event: ActivityEventForRules): NotificationType | null {
  switch (event.type) {
    case 'card.member_added':
      return 'card_assigned';
    case 'comment.created':
      return 'comment_reply';
    case 'comment.mentioned':
      return 'mention';
    // DEM-152 — `watched_activity` "çöp kovası" 7 granular tipe bölündü.
    // Saf ayrıştırma: recipient hesabı (`collectRecipients` aşağıda hâlâ bu
    // event'leri kart watcher pool'una toplar) + kanal seçimi değişmedi;
    // değişen yalnız bildirim *tipi* — UI her tip için ayrı ikon/metin.
    case 'card.moved':
      return 'card_moved';
    case 'card.archived':
      return 'card_archived';
    case 'card.completed':
    case 'card.uncompleted':
      return 'card_completed';
    case 'card.due_set':
    case 'card.due_cleared':
      return 'card_due_changed';
    case 'card.cover_changed':
    case 'card.cover_cleared':
    case 'card.cover_image_changed':
    case 'card.cover_image_cleared':
      return 'card_cover_changed';
    case 'attachment.added': // Faz 11B (DEM-148) — kart eki commit; push opt-in default
      return 'attachment_added';
    case 'checklist.item_checked':
    case 'checklist.item_unchecked':
      // DEM-153 — madde işaretleme/geri alma tek bildirim tipinde toplanır
      // (`card.completed`/`uncompleted` → `card_completed` paterniyle aynı;
      // `payload.activityType` checked/unchecked'i UI'da ayırır).
      return 'checklist_item_completed';
    // DEM-153 — kartla ilgili kalan tüm aksiyonlar da bildirim üretir. Hepsi
    // in-app only (`pickChannels` push/email opt-in listelerine eklenmez),
    // alıcı kart watcher pool. Detay → `docs/domain/04-bildirim-kurallari.md`.
    case 'card.renamed':
      return 'card_renamed';
    case 'card.description_changed':
      return 'card_description_changed';
    case 'card.label_added':
      return 'card_label_added';
    case 'card.label_removed':
      return 'card_label_removed';
    case 'comment.updated':
      return 'comment_updated';
    case 'comment.deleted':
      return 'comment_deleted';
    case 'checklist.created':
      return 'checklist_created';
    case 'checklist.item_added':
      return 'checklist_item_added';
    case 'checklist.item_removed':
      return 'checklist_item_removed';
    case 'attachment.removed':
      return 'attachment_removed';
    case 'board.member_added':
      // DEM-175 — doğrudan ekleme (hesap zaten var) kendi tipinde. Eskiden
      // `board_invitation` dönüyordu; "davet" metni + kabul/reddet beklentisi
      // yanıltıcıydı (kullanıcı zaten üye) ve `board_invitation` mute-bypass
      // olduğundan susturmuş kullanıcı yine de anlık e-posta alıyordu.
      // `board_member_added`: "ekledi" metni, in-app + email opt-in,
      // mute-bypass DEĞİL. Davet kabulü de bu activity'yi üretir ama actor =
      // yeni üye → self-skip bildirim doğurmaz.
      return 'board_member_added';
    case 'card.member_removed':
      // Faz 10A (DEM-135) — alıcı **çıkarılan kullanıcı** (payload.userId);
      // permission filter atlar (artık karta erişimi yok). `collectRecipients`
      // aşağıda özel branch işler. DEM-152 — granular `card_member_removed`.
      return 'card_member_removed';
    case 'board.member_removed':
    case 'workspace.member_removed':
      // Faz 10A (DEM-135) — alıcı **çıkarılan kullanıcı**; in-app + email.
      // Permission filter atlanır (alıcı artık board/workspace üyesi değil).
      return 'member_removed';
    case 'board.member_role_changed':
    case 'workspace.member_role_changed':
      // Faz 10A (DEM-135) — alıcı **rolü değişen kullanıcı**; in-app.
      // Alıcı hâlâ üye olduğu için normal permission filter geçer.
      return 'member_role_changed';
    case 'board.access_requested':
      // DEM-154 — biri board linkinden erişim talep etti; alıcı board
      // admin'leri (`collectRecipients` özel branch). Talep sahibi actor
      // self-skip ile düşer.
      return 'board_access_requested';
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

interface PayloadContext {
  actorName?: string;
  actorImage?: string;
  cardTitle?: string;
  boardName?: string;
  workspaceName?: string;
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

async function loadPayloadContext(
  tx: Queryable,
  event: ActivityEventForRules,
): Promise<PayloadContext> {
  const context: PayloadContext = {};

  if (event.actorId) {
    const [actor] = await tx
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, event.actorId))
      .limit(1);
    if (actor?.name) context.actorName = actor.name;
    if (actor?.image) context.actorImage = actor.image;
  }

  if (event.cardId) {
    const [card] = await tx
      .select({ title: cards.title })
      .from(cards)
      .where(eq(cards.id, event.cardId))
      .limit(1);
    if (card?.title) context.cardTitle = card.title;
  }

  if (event.boardId) {
    const [board] = await tx
      .select({ title: boards.title })
      .from(boards)
      .where(eq(boards.id, event.boardId))
      .limit(1);
    if (board?.title) context.boardName = board.title;
  }

  const [workspace] = await tx
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, event.workspaceId))
    .limit(1);
  if (workspace?.name) context.workspaceName = workspace.name;

  return context;
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
    case 'card.cover_image_changed':
    case 'card.cover_image_cleared':
    case 'card.cover_changed': // Faz 10A (DEM-135) — kapak rengi watcher pool
    case 'card.cover_cleared':
    case 'checklist.item_checked':
    case 'attachment.added': // Faz 11B (DEM-148) — kart eki watcher pool
    case 'checklist.item_unchecked': // DEM-153 — kartla ilgili kalan tüm aksiyonlar da kart watcher pool'una gider.
    case 'card.renamed':
    case 'card.description_changed':
    case 'card.label_added':
    case 'card.label_removed':
    case 'comment.updated':
    case 'comment.deleted':
    case 'checklist.created':
    case 'checklist.item_added':
    case 'checklist.item_removed':
    case 'attachment.removed':
      // The card's watcher pool — assignees + watchers. The actor is removed
      // below.
      for (const userId of ctx.cardMemberIds) candidates.add(userId);
      break;
    case 'comment.mentioned': {
      const userId = stringField(event.payload, 'mentionedUserId');
      if (userId) candidates.add(userId);
      break;
    }
    case 'board.member_added': {
      const userId = stringField(event.payload, 'userId');
      if (userId) candidates.add(userId);
      break;
    }
    // Faz 10A (DEM-135) — "sen çıkarıldın / rolün değişti" bildirimleri:
    // alıcı doğrudan payload'taki `userId` / `removedUserId` / `targetUserId`.
    // Permission filter aşağıda tip kontrolü ile atlanır.
    case 'card.member_removed':
    case 'board.member_removed':
    case 'workspace.member_removed': {
      const userId =
        stringField(event.payload, 'removedUserId') ?? stringField(event.payload, 'userId');
      if (userId) candidates.add(userId);
      break;
    }
    case 'board.member_role_changed':
    case 'workspace.member_role_changed': {
      const userId =
        stringField(event.payload, 'targetUserId') ?? stringField(event.payload, 'userId');
      if (userId) candidates.add(userId);
      break;
    }
    case 'board.access_requested': {
      // DEM-154 — alıcı board admin'leri: explicit `board_members.role='admin'`
      // ∪ workspace `owner`/`admin` (effectiveBoardRole onları board admin
      // yapar; explicit board satırları olmayabilir). Talep sahibi actor
      // (request mutation `protectedProcedure`) board üyesi değildir; self-skip
      // yine de aşağıda uygulanır. Bu branch erken döner — admin set'i zaten
      // yetkili, generic guest/board permission filter'a gerek yok.
      if (event.boardId) {
        const adminRows = await tx
          .select({ userId: boardMembers.userId })
          .from(boardMembers)
          .where(
            and(eq(boardMembers.boardId, event.boardId), eq(boardMembers.role, 'admin')),
          );
        for (const r of adminRows) candidates.add(r.userId);
      }
      const wsAdminRows = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, event.workspaceId),
            or(eq(workspaceMembers.role, 'owner'), eq(workspaceMembers.role, 'admin')),
          ),
        );
      for (const r of wsAdminRows) candidates.add(r.userId);
      break;
    }
    default:
      return candidates;
  }

  // Actor self-skip — never notify the user who triggered the event.
  if (event.actorId) candidates.delete(event.actorId);
  if (candidates.size === 0) return candidates;

  // Faz 10A (DEM-135) permission-filter istisnası: "X'ten çıkarıldın"
  // bildirimleri mantıken erişim kaybedildikten *sonra* gider. Aksi halde
  // aşağıdaki workspace/board membership filter alıcıyı düşürürdü.
  // `*member_role_changed` alıcısı hâlâ üye olduğu için normal akıştan geçer.
  if (
    event.type === 'card.member_removed' ||
    event.type === 'board.member_removed' ||
    event.type === 'workspace.member_removed'
  ) {
    return candidates;
  }

  // DEM-154 — `board.access_requested` alıcıları `board_members.role='admin'`
  // ∪ workspace owner/admin sorgusundan geldi; hepsi tanım gereği board'a
  // erişebilir. Generic permission filter'ı atla (gereksiz sorgu + guest
  // mantığı admin'leri zaten düşürmez).
  if (event.type === 'board.access_requested') {
    return candidates;
  }

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

  // Faz 10H (DEM-142) — snooze: `mute_until > NOW()` aktif iken `mute_level =
  // 'all'` davranışı uygulanır. Süresi dolmuş satır görmezden gelinir
  // (audit için silinmez). Mute-bypass tipler (mention + *_invitation)
  // snooze sırasında da geçer — kart detay dropdown'ı kullanıcıya `mention`
  // ve davet'in geçeceğini bildirir.
  const muteUntil = preference?.muteUntil ?? null;
  const snoozeActive = muteUntil !== null && muteUntil.getTime() > Date.now();

  if (!muteBypass) {
    if (muteLevel === 'all' || snoozeActive) return [];
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

  // Push: 2026-06-01 (kullanıcı kararı `AskUserQuestion`) → **tüm bildirim
  // tipleri** default push'a gider; `push_enabled` (preference) opt-out gate
  // korunur. Önceki davranış (Faz 6A) yalnız 5 "yüksek değer" tipte default
  // açıktı (`card_assigned`, `mention`, `due_approaching`, `due_overdue`,
  // `attachment_added`); kullanıcı geri kalan 25+ tipi (member değişimleri,
  // davetler, granular kart aksiyonları, checklist, comment edit/delete, vb.)
  // iPhone bildirim merkezinde göremiyordu. Yeni davranış: opt-out matrisi
  // (workspace/board/card scope `notification_preferences.push_enabled`)
  // gürültüyü kullanıcı tarafına devreder. Detay →
  // `docs/domain/04-bildirim-kurallari.md` "Push kanalı kapsamı" bölümü +
  // `docs/architecture/02-teknoloji-kararlari.md` Karar kaydı 2026-06-01.
  //
  // Push'sız kalanlar (mantıken anlamlı değil):
  // - `watched_activity` — DEM-152 sonrası hiç üretilmiyor (fallback enum,
  //   `mapEventToNotificationType` hiç döndürmüyor); pickChannels'a buraya
  //   ulaşmaz ama defansif olarak gelirse push'a yine gönderilir (no-op).
  // - `report_scheduled_ready` — worker direkt outbox'a yazar, pickChannels
  //   devrede değil (event_id null path).
  if (pushEnabled) channels.push('push');

  // Email: per the domain spec, the heavy-touch types — `card_assigned`,
  // `mention`, `due_overdue`, invitations — opt in by default; the rest stay
  // in-app/push. Faz 10A (DEM-135): `member_removed` (board/workspace üyeliği
  // sona erdi) e-postayla da gönderilir — alıcı "bir daha içeride değil"
  // sinyalini posta kutusunda görebilmeli; `member_role_changed` sadece in-app
  // (kullanıcı zaten üye, gürültü olmasın). DEM-154: `board_access_requested`
  // e-posta opt-in default — admin posta kutusunda da görsün (`board_invitation`
  // ile aynı seviye).
  const emailByType =
    notificationType === 'card_assigned' ||
    notificationType === 'mention' ||
    notificationType === 'due_overdue' ||
    notificationType === 'board_invitation' ||
    notificationType === 'workspace_invitation' ||
    notificationType === 'member_removed' ||
    notificationType === 'board_access_requested' ||
    // DEM-175 — board'a doğrudan eklenme posta kutusunda da görünsün
    // (`board_invitation` ile aynı seviye); ama mute-bypass değil.
    notificationType === 'board_member_added';
  if (emailByType && emailEnabled) channels.push('email');

  return channels;
}

type PreferenceRow = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  /**
   * Faz 10H (DEM-142) — kart bazında geçici snooze. `null` snooze yok;
   * `Date` aktif veya dolmuş snooze (rule engine `> Date.now()` karşılaştır).
   * Yalnız kart kapsamı satırından okunur — narrowest-scope-wins zaten
   * en yakın satırı seçer; üst kapsam satırlarındaki değer pratikte hiç
   * okunmaz (UI yalnız kart-scope upsert/snooze yazar).
   */
  muteUntil: Date | null;
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
      muteUntil: notificationPreferences.muteUntil,
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
    muteUntil: best.row.muteUntil,
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
  context: PayloadContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    activityType: event.type,
    notificationType,
  };
  if (event.actorId) payload.actorUserId = event.actorId;
  if (context.actorName) payload.actorName = context.actorName;
  if (context.actorImage) payload.actorImage = context.actorImage;
  if (event.boardId) payload.boardId = event.boardId;
  if (event.cardId) payload.cardId = event.cardId;
  if (event.workspaceId) payload.workspaceId = event.workspaceId;
  if (context.cardTitle) payload.cardTitle = context.cardTitle;
  if (context.boardName) payload.boardName = context.boardName;
  if (context.workspaceName) payload.workspaceName = context.workspaceName;
  // Carry through the small handful of activity payload keys the UI uses for
  // links + previews. Whitelist over copy-everything — activity payloads
  // sometimes carry internal-only fields (clientMutationId, fromCoverColor)
  // that don't belong in a user-facing notification.
  for (const key of [
    'commentId',
    'mentionedUserId',
    'mentionText',
    'checklistId',
    'itemId',
    // DEM-153 — `card.label_added/removed` payload'ında etiket kimliği; UI
    // bildirimi ilgili etikete bağlamak için kullanır.
    'labelId',
    'fromListId',
    'toListId',
    'fromBoardId',
    'toBoardId',
    'invitationId',
    'role',
    'title',
    'dueAt',
    // DEM-154 — board erişim talebi: bildirime tıklayınca / talebi yönetmek
    // için ilgili `board_access_requests` satırının id'si.
    'accessRequestId',
    // Faz 10A (DEM-135) — member_removed / member_role_changed bildirimleri
    // için rol + alıcı bilgisi: email/push template'leri "X kişiyi
    // çıkardı / rolünü Y yaptı" mesajını payload üzerinden render eder.
    'removedUserId',
    'removedRole',
    'targetUserId',
    'fromRole',
    'toRole',
    // Faz 6 review fix (W1 DEM-91): mention / comment-reply email template
    // `commentPreview` bekliyor; producer activity payload'una ekledikleri
    // zaman worker outbox satırına da geçiş yapsın.
    //
    // NOT: `inviteToken` bilinçli olarak BU WHITELIST'TE DEĞİL. Token davet
    // kabul linki için gizli kalmalı ve yalnız **email kanalı** outbox satırı
    // taşımalı (board-members + workspace router'larında direct insert ile);
    // whitelist üzerinden in-app outbox payload'una sızdırılırsa client'ta
    // open token leak riski olur. Email template payload'ta `inviteToken`
    // okur — direct insert satırında zaten var.
    'commentPreview',
    // Faz 11B (DEM-148) — `attachment.added` payload alanlari: in-app
    // notification UI'da "X dosyayi ekledi" satirini render etmek icin
    // attachmentId + fileName lazim. mime/size aynı payload'ta tutuluyor
    // (activity'de) ama notification template'leri yalniz fileName kullanir.
    'attachmentId',
    'fileName',
  ] as const) {
    const v = event.payload[key];
    if (v !== undefined && v !== null) payload[key] = v;
  }
  return payload;
}
