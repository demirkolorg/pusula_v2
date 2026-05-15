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
  // Phase 6C (DEM-92) — mention parser emits one activity per valid user
  // mention in a comment. Appended to keep the Postgres enum append-only.
  'comment.mentioned',
  // DEM-110 (Card cover photo). Appended to keep the Postgres enum append-only.
  'card.cover_image_changed',
  'card.cover_image_cleared',
  // DEM-109 (List icon + icon colour). Appended to keep the Postgres enum append-only.
  'list.icon_changed',
  'list.icon_cleared',
] as const;

/**
 * Lifecycle states of a `workspace_invitations` row. Backs the `invitation_status`
 * Postgres enum in `@pusula/db` — same APPEND-ONLY discipline as the activity enum
 * (Postgres can't drop/reorder enum values without a destructive recreation).
 */
export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
] as const;

/** Default lifetime of a workspace invitation, in days. */
export const WORKSPACE_INVITATION_TTL_DAYS = 7;

/**
 * Seed data for the new-user onboarding bootstrap (best-effort, runs at signup —
 * see `docs/domain/01-urun-modeli.md` invariant 11 and `docs/architecture/08-web-ve-mobil.md`
 * §8.1.3). The first board acts as a "trailer" for the product: it ships with a board
 * background, a colourful list/icon layout, a board-scoped label palette, and cards that
 * each both *explain* and *visualise* one feature (cover colour, labels, checklists,
 * comments, due dates, members, completion). Persisted *data* — kept here so bootstrap
 * (and any later template work) share one source. User-facing → Turkish (i18n placeholder).
 */
/** Name of the default workspace auto-created for a new user at signup. */
export const ONBOARDING_WORKSPACE_NAME = 'Çalışma Alanım';
/** Title of the board auto-created inside the onboarding workspace. */
export const ONBOARDING_BOARD_TITLE = 'İlk Pano';
/**
 * Board background preset for the onboarding board — a Trello-style peach/orange
 * gradient. Stored verbatim in `boards.background`; format = `gradient:<name>`
 * (`@pusula/ui` mirrors the class map). One of `BOARD_BACKGROUND_GRADIENTS`.
 */
export const ONBOARDING_BOARD_BACKGROUND = 'gradient:trello-peach' as const;

/** Stable key for an onboarding label (referenced from `ONBOARDING_CARDS`). */
export type OnboardingLabelKey = 'urgent' | 'important' | 'design' | 'dev' | 'research' | 'waiting';

/**
 * Board-scope label palette seeded for the onboarding board. Each entry becomes
 * one `labels` row (board-scoped); `card_labels` rows reference it by `key`.
 */
export interface OnboardingLabel {
  readonly key: OnboardingLabelKey;
  readonly name: string;
  readonly color: LabelColor;
}

export const ONBOARDING_LABELS: readonly OnboardingLabel[] = [
  { key: 'urgent', name: 'Acil', color: 'red' },
  { key: 'important', name: 'Önemli', color: 'orange' },
  { key: 'design', name: 'Tasarım', color: 'purple' },
  { key: 'dev', name: 'Geliştirme', color: 'blue' },
  { key: 'research', name: 'Araştırma', color: 'green' },
  { key: 'waiting', name: 'Beklemede', color: 'yellow' },
];

/** Stable key for an onboarding list (referenced from `ONBOARDING_CARDS.listKey`). */
export type OnboardingListKey = 'welcome' | 'features' | 'try' | 'done';

/**
 * One column in the onboarding board. Order in `ONBOARDING_LISTS` = display
 * (left-to-right) order; bootstrap assigns fractional `position` keys in this order.
 * `color`/`icon`/`iconColor` are nullable so the showcase can also seed default-styled
 * columns (the first and last list ship without colour/icon to show the default look).
 * Invariant: when `icon` is `null`, `iconColor` must also be `null`.
 */
export interface OnboardingList {
  readonly key: OnboardingListKey;
  readonly title: string;
  readonly color: ListColor | null;
  readonly icon: ListIcon | null;
  readonly iconColor: ListIconColor | null;
}

export const ONBOARDING_LISTS: readonly OnboardingList[] = [
  { key: 'welcome', title: 'Hoş geldin', color: null, icon: null, iconColor: null },
  { key: 'features', title: 'Özellikler', color: 'mor', icon: 'star', iconColor: 'mor' },
  { key: 'try', title: 'Sen dene', color: 'turuncu', icon: 'zap', iconColor: 'turuncu' },
  { key: 'done', title: 'Bitti', color: null, icon: null, iconColor: null },
];

/** A single checklist on an onboarding card. */
export interface OnboardingChecklist {
  readonly title: string;
  readonly items: readonly { readonly content: string; readonly completed: boolean }[];
}

/** A single comment on an onboarding card; author = the new user (the only user). */
export interface OnboardingComment {
  readonly body: string;
}

/**
 * Card-member entry on an onboarding card. The new user is the only member that
 * can be referenced (signup is a single-user event); the role determines whether
 * the showcase renders them as an assignee chip or a watcher.
 */
export interface OnboardingCardMember {
  readonly role: CardRole;
}

/**
 * One showcase card in the onboarding board. `listKey` points to an
 * `ONBOARDING_LISTS` entry; `labelKeys` to `ONBOARDING_LABELS` entries.
 * Optional fields default to "no value" — the bootstrap only writes the row +
 * activity event when the field is present.
 */
export interface OnboardingCard {
  readonly listKey: OnboardingListKey;
  readonly title: string;
  readonly description?: string;
  readonly coverColor?: CardCoverColor;
  /**
   * Due-date offset in days, **relative to the bootstrap moment**. Positive =
   * future, negative = past. The bootstrap resolves it to a timestamp at runtime.
   */
  readonly dueAtOffsetDays?: number;
  readonly completed?: boolean;
  readonly labelKeys?: readonly OnboardingLabelKey[];
  readonly members?: readonly OnboardingCardMember[];
  readonly checklists?: readonly OnboardingChecklist[];
  readonly comments?: readonly OnboardingComment[];
}

/**
 * The showcase card set. Order within each list is the order cards appear in
 * this array (cards are bucketed by `listKey`, then positioned left-to-right).
 * Each card explains *and* visualises one feature — keep it that way when adding
 * new entries.
 */
export const ONBOARDING_CARDS: readonly OnboardingCard[] = [
  // --- Hoş geldin (default-styled list) ---
  {
    listKey: 'welcome',
    title: 'Pusula’ya hoş geldin',
    description:
      'Bu pano, Pusula’nın liste ve kart yetkinliklerini bir fragman gibi sergiler. Her kart bir özelliği hem anlatır hem de görsel olarak gösterir — kapak rengine, etiketlere, checklist’e ve yorumlara dikkat et.',
    labelKeys: ['dev', 'design'],
    members: [{ role: 'watcher' }],
  },
  {
    listKey: 'welcome',
    title: 'Pano arka planı + ikon',
    description:
      'Üst bardaki pano başlığının yanındaki ⋮ menüsünden “Pano arka planı”nı aç; preset gradient’ler ve düz renkler arasından seç. Bu panonun arka planı `gradient:trello-peach` ile geldi.',
    labelKeys: ['design'],
  },
  {
    listKey: 'welcome',
    title: 'Liste rengi + ikonu',
    description:
      'Bir kolonun üst sağındaki ⋮ menüsünden “Liste rengi” ve “Liste ikonu”nu değiştirebilirsin. Bu panoda “Özellikler” ve “Sen dene” listeleri renk + ikon ile geldi; ilk ve son liste ise varsayılan görünümde — kendi kolonlarına uygula.',
    labelKeys: ['design'],
  },

  // --- Özellikler ---
  {
    listKey: 'features',
    title: 'Kapak rengi',
    description:
      'Kart kapağına 12 renkten birini atayabilirsin (kart detay modalı → kapak rengi şeridi). Bu kart kapak rengini canlı gösterir. Kart kapak görseli (resim) de var — kartın açıklamasından bir resim yükleyebilir, ardından kapak olarak seçebilirsin.',
    coverColor: 'kirmizi',
    labelKeys: ['design'],
  },
  {
    listKey: 'features',
    title: 'Etiketler',
    description:
      'Etiketler pano kapsamlıdır — bu pano 6 hazır etiketle (Acil, Önemli, Tasarım, Geliştirme, Araştırma, Beklemede) geliyor. Bir karta birden fazla etiket atayabilir, kendi etiketlerini de oluşturabilirsin.',
    labelKeys: ['urgent', 'important', 'design', 'dev', 'research', 'waiting'],
  },
  {
    listKey: 'features',
    title: 'Checklist’ler',
    description:
      'Bir kart birden fazla checklist taşıyabilir; her madde tek tek işaretlenir, kart kapağında “2 / 5” gibi ilerleme görülür. Aşağıdaki checklist’i deneyerek başla.',
    labelKeys: ['dev'],
    members: [{ role: 'assignee' }],
    checklists: [
      {
        title: 'Pusula ile ilk adımlar',
        items: [
          { content: 'Hesabı oluştur', completed: true },
          { content: 'Showcase panosunu gez', completed: true },
          { content: 'Bir kartı başka listeye sürükle', completed: false },
          { content: 'Bir karta etiket ata', completed: false },
          { content: 'Bir karta yorum yaz', completed: false },
        ],
      },
    ],
  },
  {
    listKey: 'features',
    title: 'Yorumlar',
    description:
      'Her karta yorum bırakabilirsin; başka bir üyeyi `@kullanıcı` ile mention’layabilirsin ve o kişi bildirim alır. Aşağıdaki örnek yorumlar bunun nasıl göründüğünü gösteriyor.',
    labelKeys: ['waiting'],
    comments: [
      { body: 'Yorum alanı kart altında akışta görünür — yorumları düzenleyebilir veya silebilirsin.' },
      { body: 'İpucu: Bir takım arkadaşını davet ettiğinde `@adı` yazarak ona bildirim gönderebilirsin.' },
    ],
  },
  {
    listKey: 'features',
    title: 'Vade tarihi',
    description:
      'Karta vade tarihi atayabilirsin; yaklaşan vade kart altında turuncu, geçmiş vade kırmızı görünür ve sahiplerine hatırlatma bildirimi gider. Bu kartın vadesi 3 gün sonra.',
    dueAtOffsetDays: 3,
    labelKeys: ['urgent'],
  },
  {
    listKey: 'features',
    title: 'Kart tamamlama',
    description:
      'Kart kapağındaki onay kutusundan kartı tamamlandı olarak işaretleyebilirsin. Bu kart örnek olarak işaretli — kart başlığı üstü çizili gösterilir.',
    completed: true,
    labelKeys: ['important', 'dev'],
  },

  // --- Sen dene ---
  {
    listKey: 'try',
    title: 'Bu kartı sürükle',
    description:
      'Bu kartı tutup başka bir kolona bırak. Sürüklerken arka planda mutation atılmaz — yalnızca bıraktığında atılır ve optimistic olarak hemen görünür.',
  },
  {
    listKey: 'try',
    title: 'Bir etiket ekle',
    description:
      'Kart detayını aç → etiket bölümünden “Acil” veya kendi etiketini ekle. Etiket eklenince kart üstünde renkli bir şerit görünür.',
    labelKeys: ['research'],
  },
  {
    listKey: 'try',
    title: 'Bir yorum yaz',
    description:
      'Kart detayını aç → en altta “Yorum yaz” alanını kullan. Yazılan yorumlar anlık olarak akışta görünür.',
    labelKeys: ['waiting'],
  },
  {
    listKey: 'try',
    title: 'Bu kartı tamamla',
    description:
      'Kart kapağındaki tamamla işaretine tıkla. Vade geçmiş bir kart bu işaretle “tamamlanmış geç” olarak kapanır.',
    dueAtOffsetDays: -2,
    labelKeys: ['urgent'],
    members: [{ role: 'assignee' }],
  },

  // --- Bitti (default-styled list) ---
  {
    listKey: 'done',
    title: 'Pusula’yı keşfettim',
    description:
      'Bu kart örnek bir tamamlanmış kart. Aynı disiplinle kendi “Bitti” kolonunu oluşturabilirsin.',
    completed: true,
    labelKeys: ['dev'],
  },
  {
    listKey: 'done',
    title: 'İlk panomu kurdum',
    description:
      'Showcase panosunu örnek aldığında kendi panonun nasıl görüneceğini bu kart anlatır.',
    completed: true,
    labelKeys: ['design'],
  },
];

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
 * Curated workspace/board icon set. Stored verbatim in `workspaces.icon` and
 * `boards.icon`; UI maps these stable tokens to lucide-react components.
 */
export const ENTITY_ICONS = [
  'layout-grid',
  'briefcase',
  'folder',
  'building',
  'users',
  'target',
  'rocket',
  'flag',
  'star',
  'bookmark',
  'calendar',
  'clock',
  'map',
  'compass',
  'inbox',
  'zap',
  'archive',
] as const;
export type EntityIcon = (typeof ENTITY_ICONS)[number];
export const DEFAULT_WORKSPACE_ICON = 'briefcase' satisfies EntityIcon;
export const DEFAULT_BOARD_ICON = 'layout-grid' satisfies EntityIcon;

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
export type CardCoverColor = (typeof CARD_COVER_COLORS)[number];

/** Allowed MIME types for card cover image uploads (DEM-110). */
export const CARD_COVER_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type CardCoverImageMimeType = (typeof CARD_COVER_IMAGE_MIME_TYPES)[number];

/** Maximum card cover image upload size: 5 MiB. */
export const CARD_COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

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
  'lagoon',
  'ember',
  'blossom',
  'meadow',
  'dusk',
  'pearl',
  'trello-bubble',
  'trello-snow',
  'trello-ocean',
  'trello-crystal',
  'trello-rainbow',
  'trello-peach',
  'trello-flower',
  'trello-earth',
  'trello-alien',
  'trello-volcano',
] as const;
export type BoardBackgroundGradient = (typeof BOARD_BACKGROUND_GRADIENTS)[number];

/**
 * Board solid background presets. Starts with the card cover palette, then adds
 * board-only neutral/white variants that should not appear as card cover colours.
 */
export const BOARD_BACKGROUND_SOLID_COLORS = [
  ...CARD_COVER_COLORS,
  'beyaz',
  'kirik-beyaz',
  'fildisi',
  'buz-beyazi',
  'gumus',
] as const;
export type BoardBackgroundSolidColor = (typeof BOARD_BACKGROUND_SOLID_COLORS)[number];

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

/**
 * Kart paylaşım linkleri için izin verilen süreler (gün). Üye paylaşım linki
 * oluştururken bu setten birini seçer; parolasız token sonsuz yaşamaz. Bkz.
 * `docs/domain/08-paylasim-linki-kurallari.md` "Link davranışı".
 */
export const SHARE_LINK_EXPIRY_PRESETS = [7, 30, 90] as const;
export type ShareLinkExpiryPreset = (typeof SHARE_LINK_EXPIRY_PRESETS)[number];

/** Varsayılan paylaşım linki ömrü (gün). */
export const DEFAULT_SHARE_LINK_EXPIRY_DAYS: ShareLinkExpiryPreset = 90;

/**
 * Misafir (anonim) yorumcunun sabit yazar etiketi. `comments.author_id IS NULL
 * AND share_link_id IS NOT NULL` satırları UI ve bildirim template'lerinde bu
 * etiketle resolve edilir. Bkz. `docs/domain/08-paylasim-linki-kurallari.md`
 * "Misafir yorum yapma".
 */
export const GUEST_AUTHOR_LABEL = 'Misafir';

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
