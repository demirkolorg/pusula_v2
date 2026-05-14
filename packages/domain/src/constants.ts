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

/**
 * Activity event types written to `activity_events`. Backs the `activity_event_type`
 * Postgres enum in `@pusula/db` — **APPEND ONLY**: never reorder or remove entries
 * (Postgres can't drop or reorder enum values without a destructive type recreation).
 * Add new values, then run `pnpm db:generate`. Extend as features land.
 */
export const ACTIVITY_EVENT_TYPES = [
  'workspace.created',
  'workspace.updated',
  'workspace.archived',
  'workspace.member_added',
  'workspace.member_removed',
  'workspace.member_role_changed',
  'workspace.member_invited',
  'workspace.invitation_revoked',
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
  // Phase 2A (Board/List/Card CRUD) — rename / description-change variants. Appended
  // to keep the Postgres enum append-only; aligned with `docs/domain/05-aktivite-kurallari.md`.
  'board.renamed',
  'list.renamed',
  'card.renamed',
  'card.description_changed',
  // Phase 2.5A (Comment / Checklist CRUD — DEM-50) — checklist item lifecycle.
  // Appended to keep the Postgres enum append-only; `comment.created/updated/deleted`
  // and `checklist.created` already exist above. The Phase-0 `checklist.item_completed`
  // entry stays as cruft (toggle uses `checklist.item_checked` / `checklist.item_unchecked`).
  // See `docs/domain/05-aktivite-kurallari.md`.
  'checklist.item_added',
  'checklist.item_checked',
  'checklist.item_unchecked',
  'checklist.item_removed',
  // Phase 2.5C (Board member management / invitations — DEM-52). `board.member_added`
  // and `board.member_removed` already exist above; these cover an explicit
  // member's role change and the email-invitation lifecycle. Appended to keep the
  // Postgres enum append-only. See `docs/domain/05-aktivite-kurallari.md`.
  'board.member_role_changed',
  'board.member_invited',
  'board.invitation_revoked',
  // Phase 2.7 (Card completion + cover colour — DEM-66 / DEM-67). `cards` gains
  // `completed`/`completed_at`/`completed_by` and `cover_color`. Appended to keep
  // the Postgres enum append-only. See `docs/domain/05-aktivite-kurallari.md`.
  'card.completed',
  'card.uncompleted',
  'card.cover_changed',
  'card.cover_cleared',
  // DEM-98 (List colour). Appended to keep the Postgres enum append-only.
  'list.color_changed',
  'list.color_cleared',
  // Phase 2.7 follow-up #4 (Board background colour — DEM-100). Appended to
  // keep the Postgres enum append-only. See docs/domain/05-aktivite-kurallari.md.
  'board.background_changed',
  'board.background_cleared',
  // DEM-109 (List icon + icon colour). Appended to keep the Postgres enum append-only.
  'list.icon_changed',
  'list.icon_cleared',
] as const;

/**
 * Lifecycle states of a `workspace_invitations` row. Backs the `invitation_status`
 * Postgres enum in `@pusula/db` — same APPEND-ONLY discipline as the activity enum
 * (Postgres can't drop/reorder enum values without a destructive recreation).
 */
export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked', 'expired'] as const;

/** Default lifetime of a workspace invitation, in days. */
export const WORKSPACE_INVITATION_TTL_DAYS = 7;

/**
 * Seed data for the new-user onboarding bootstrap (best-effort, runs at signup —
 * see `docs/domain/01-urun-modeli.md` invariant 11 and `docs/architecture/08-web-ve-mobil.md`
 * §8.1.3). These are persisted *data* (workspace/board names, list titles, welcome
 * card titles), not UI chrome — kept here so the bootstrap (and any later board-template
 * work) share one source. User-facing → Turkish; an i18n placeholder for now, and the
 * welcome copy is written against what's actually shipped — refresh it as features land.
 */
/** Name of the default workspace auto-created for a new user at signup. */
export const ONBOARDING_WORKSPACE_NAME = 'Çalışma Alanım';
/** Title of the board auto-created inside the onboarding workspace. */
export const ONBOARDING_BOARD_TITLE = 'İlk Pano';
/** Default list titles seeded into the onboarding board, in display (left-to-right) order. */
export const ONBOARDING_LIST_TITLES = ['Yapılacak', 'Devam Eden', 'Bitti'] as const;
/** Welcome / sample card titles seeded into the onboarding board's first list (`Yapılacak`), in order. */
export const ONBOARDING_WELCOME_CARDS = [
  '👋 Pusula’ya hoş geldin',
  'Bu pano senin için otomatik oluşturuldu — listeleri ve kartları dilediğin gibi düzenle',
  'Yeni kart ve liste ekle, panoyu yeniden adlandır (üst bar ve liste altındaki butonlar)',
  'Bu örnek kartları ve listeleri silip panonu sıfırdan kurabilirsin',
] as const;

/**
 * Trello-style fixed label palette. A card label's `color` is one of these
 * tokens (UI maps each to a swatch); the colour picker offers exactly this set.
 * Stored verbatim in `labels.color`. Extend with care — clients hardcode the
 * swatch for each token.
 */
export const LABEL_COLORS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/**
 * List colour palette. A list's `color`, when set, is one of these 10 palette
 * names; `null` = no custom column colour. Stored verbatim in `lists.color`
 * (plain `text` — validated here, not at the DB).
 */
export const LIST_COLORS = [
  'yesil',
  'sari',
  'turuncu',
  'kirmizi',
  'mor',
  'mavi',
  'sky',
  'lime',
  'pembe',
  'gri',
] as const;
export type ListColor = (typeof LIST_COLORS)[number];

/**
 * Curated list icon set. Stored verbatim in `lists.icon`; `null` = no icon.
 * UI maps these stable tokens to lucide-react components.
 */
export const LIST_ICONS = [
  'circle',
  'check',
  'star',
  'flag',
  'bookmark',
  'tag',
  'clock',
  'calendar',
  'user',
  'users',
  'briefcase',
  'zap',
  'target',
  'rocket',
  'inbox',
  'archive',
] as const;
export type ListIcon = (typeof LIST_ICONS)[number];

/**
 * List icon colour palette. Mirrors the 12 design-token palette names; `null`
 * means "use the column header's default/current text colour".
 */
export const LIST_ICON_COLORS = [
  'kirmizi',
  'turuncu',
  'sari',
  'lime',
  'yesil',
  'sky',
  'mavi',
  'indigo',
  'mor',
  'pembe',
  'gri',
  'siyah',
] as const;
export type ListIconColor = (typeof LIST_ICON_COLORS)[number];

/**
 * Card cover colour palette — one of the 12 design-token palette names
 * (`@pusula/ui` `theme.css` `--palet-*` / `PaletteName`). A card's `cover_color`,
 * when set, is one of these; `null` = no cover colour. Stored verbatim in
 * `cards.cover_color` (plain `text` — validated here, not at the DB). Includes
 * `indigo` and `gri`, which the 10-colour label palette doesn't use.
 * `@pusula/ui` `PaletteName` mirrors this list (kept in sync by hand — `@pusula/ui`
 * doesn't depend on `@pusula/domain`).
 */
export const CARD_COVER_COLORS = [
  'kirmizi', 'turuncu', 'sari', 'lime', 'yesil', 'sky',
  'mavi', 'indigo', 'mor', 'pembe', 'gri', 'siyah',
] as const;
export type CardCoverColor = (typeof CARD_COVER_COLORS)[number];

/**
 * Board background gradient presets (DEM-100). Stored as `gradient:<name>` in
 * `boards.background`; UI mirrors this list in `@pusula/ui` for CSS class maps.
 */
export const BOARD_BACKGROUND_GRADIENTS = [
  'sunset',
  'ocean',
  'rainbow',
  'forest',
  'lavender',
  'sunrise',
  'midnight',
  'mint',
  'aurora',
  'coral',
] as const;
export type BoardBackgroundGradient = (typeof BOARD_BACKGROUND_GRADIENTS)[number];

/**
 * Position compaction trigger threshold: if any newly-produced fractional
 * `position` key reaches this many characters, the affected scope (a list's
 * cards / a board's lists) is queued for compaction (background re-balance —
 * `positionsBetween(null, null, n)`). Picked high enough not to fire on normal
 * use; may later move to a worker env var. See `@pusula/domain` `shouldCompact`
 * and `docs/domain/03-siralama-kurallari.md` "Compaction" /
 * `docs/architecture/06-bildirim-altyapisi.md` "Position compaction".
 */
export const POSITION_COMPACTION_MAX_LEN = 50;

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
export const SEARCH_ENTITY_TYPES = ['board', 'list', 'card', 'comment', 'label'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type BoardRole = (typeof BOARD_ROLES)[number];
export type CardRole = (typeof CARD_ROLES)[number];
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
export type RealtimeRoomKind = (typeof REALTIME_ROOM_KINDS)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type MuteLevel = (typeof MUTE_LEVELS)[number];
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
