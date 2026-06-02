import type { NotificationType } from '@pusula/domain';

/**
 * Bildirim tercihleri Section 1 + 2 + 3 tarafından paylaşılan veri tipleri.
 * Faz 10D (DEM-138). Backend `notifications.preferences.get` (Section 1+2) ve
 * `.list` (Section 3) iki ayrı endpoint döner; tip-bazlı kanal kararını UI
 * Section 2'de simüle eder (gerçek tip-bazlı backend kaydı Faz 11+).
 */

export type MuteLevel = 'none' | 'mentions_only' | 'all';

/**
 * Faz 10G (DEM-141) — e-posta sıklığı / digest modu. UI Section 6 (form) +
 * backend `notification_preferences.email_mode` kolonu aynı set'i taşır.
 */
export type EmailDigestMode = 'instant' | 'hourly_digest' | 'daily_digest' | 'off';

/** Backend `notifications.preferences.get` çıkışı (null = global default'ta yazılmış satır yok). */
export type PreferenceGetData = {
  muteLevel: MuteLevel;
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  /** Faz 10F (DEM-140) — null üçlü ise pencere kapalı. */
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
  /**
   * Faz 10H (DEM-142) — kart-scope satırı varsa snooze bitiş zamanı; aksi
   * halde `null`. Global tercih satırından gelmesi pratikte beklenmez (UI
   * yalnız kart-scope yazıyor) ama tip simetri için açık tutuluyor. Server
   * `timestamp with timezone` döner; tRPC superjson serileştirmesi sayesinde
   * client tarafında hep `Date` instance'ı olur.
   */
  muteUntil: Date | null;
  /**
   * Faz 10G (DEM-141) — `emailMode` global tercih satırında anlamlı. Backend
   * `notification_preferences.email_mode` text kolonundan DB default'u
   * (`'instant'`) ile dolu döner; bu yüzden tip `string` (required). UI
   * Section 6 (digest form) bu alanı `isEmailDigestMode` ile narrow ederek
   * kullanır. Diğer form'lar optimistic `setQueryData`'da bu alanı korumak
   * için `previous?.emailMode ?? 'instant'` ile spread eder.
   */
  emailMode: string;
} | null;

/**
 * Rule-engine'in fallback varsayılanları. `notification_preferences` satırı
 * yoksa (`PreferenceGetData === null`) UI bu değerleri gösterir; mute-bypass
 * tipler her durumda geçer (notification-rules.ts pickChannels).
 */
export const PREFERENCE_DEFAULTS = {
  muteLevel: 'none' as const,
  mentionOnly: false,
  pushEnabled: true,
  emailEnabled: true,
  quietFrom: null,
  quietTo: null,
  quietTimezone: null,
  muteUntil: null,
  emailMode: 'instant',
} satisfies NonNullable<PreferenceGetData>;

/** Kanal sütunları — matrix render sırası. */
export const NOTIFICATION_CHANNEL_KEYS = ['in_app', 'email', 'push'] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNEL_KEYS)[number];

/**
 * Tip × kanal değer matrisi.
 *  - `'on'`         → kanal varsayılanda açık, kullanıcı toggle edebilir.
 *  - `'mute_bypass'`→ kanal sabit açık (mute-bypass), Switch disabled + ✓.
 *  - `'unavailable'`→ rule-engine bu kombinasyonu zaten göndermiyor (em-dash).
 *
 * `notification-rules.ts` `pickChannels` mantığını birebir yansıtır:
 *   in_app: tüm tipler (mute_bypass davet/mention için sabit)
 *   email : card_assigned, mention, due_overdue, board_invitation,
 *           workspace_invitation, member_removed, board_member_added,
 *           board_access_requested
 *   push  : **tüm tipler** (2026-06-01 push expansion — `pushByType = true`;
 *           kullanıcı `push_enabled=false` ile workspace/board/card scope
 *           bazında opt-out edebilir). Mute-bypass değil — push hücresi her
 *           tip için `'on'`, mention/davet push'u da `push_enabled` ile
 *           kapatılabilir. Detay → `docs/domain/04-bildirim-kurallari.md`
 *           "Push kanalı kapsamı".
 */
export type ChannelCellState = 'on' | 'mute_bypass' | 'unavailable';

/** Tip gruplaması — Section 2 başlıkları. */
export type MatrixGroupKey =
  | 'mentions'
  | 'comment'
  | 'dueDate'
  | 'lifecycle'
  | 'boardLifecycle'
  | 'label'
  | 'membership'
  | 'invitations';

export type MatrixRow = {
  type: NotificationType;
  /** strings.account.notifications.matrix.types.* anahtar (camelCase). */
  i18nKey: string;
  group: MatrixGroupKey;
  channels: Record<NotificationChannelKey, ChannelCellState>;
};

export const MATRIX_GROUPS: readonly MatrixGroupKey[] = [
  'mentions',
  'comment',
  'dueDate',
  'lifecycle',
  'boardLifecycle',
  'label',
  'membership',
  'invitations',
];

/**
 * Tip × kanal matrisi — `notification-rules.ts:pickChannels` koduna birebir
 * tabidir. Yeni bir bildirim tipi eklendiğinde her iki tarafın da
 * güncellenmesi gerekir (testlerle bağlamak için type guard tutulur).
 */
export const MATRIX_ROWS: readonly MatrixRow[] = [
  {
    type: 'card_assigned',
    i18nKey: 'cardAssigned',
    group: 'mentions',
    channels: { in_app: 'on', email: 'on', push: 'on' },
  },
  {
    type: 'mention',
    i18nKey: 'mention',
    group: 'mentions',
    channels: { in_app: 'mute_bypass', email: 'mute_bypass', push: 'on' },
  },
  {
    type: 'comment_reply',
    i18nKey: 'commentReply',
    group: 'comment',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  // DEM-153 — yorum düzenleme / silme bildirimleri (in-app only).
  {
    type: 'comment_updated',
    i18nKey: 'commentUpdated',
    group: 'comment',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'comment_deleted',
    i18nKey: 'commentDeleted',
    group: 'comment',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'due_approaching',
    i18nKey: 'dueApproaching',
    group: 'dueDate',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'due_overdue',
    i18nKey: 'dueOverdue',
    group: 'dueDate',
    channels: { in_app: 'on', email: 'on', push: 'on' },
  },
  // DEM-152 — granular kart-aktivite tipleri (eski `watched_activity` çöp
  // kovasının yerini aldı). `watched_activity` artık üretilmediği için
  // matristen çıkarıldı; enum'da fallback değer olarak kalır. Kanal davranışı
  // değişmedi: hepsi in_app, yalnız `attachment_added` push opt-in.
  {
    type: 'card_due_changed',
    i18nKey: 'dueChanged',
    group: 'dueDate',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_moved',
    i18nKey: 'cardMoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_archived',
    i18nKey: 'cardArchived',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_completed',
    i18nKey: 'cardCompleted',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_cover_changed',
    i18nKey: 'cardCoverChanged',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'attachment_added',
    i18nKey: 'attachmentAdded',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  // DEM-153 — kartla ilgili kalan granular tipler (hepsi in-app only).
  {
    type: 'card_renamed',
    i18nKey: 'cardRenamed',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_description_changed',
    i18nKey: 'cardDescriptionChanged',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_label_added',
    i18nKey: 'cardLabelAdded',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_label_removed',
    i18nKey: 'cardLabelRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'checklist_created',
    i18nKey: 'checklistCreated',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'checklist_item_added',
    i18nKey: 'checklistItemAdded',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'checklist_item_removed',
    i18nKey: 'checklistItemRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'attachment_removed',
    i18nKey: 'attachmentRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'checklist_item_completed',
    i18nKey: 'checklistItemCompleted',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). Kart
  // oluşturma (kart yaşam döngüsü) + liste/board yaşam döngüsü + etiket CRUD.
  // Hepsi in-app + push (email opt-in listesinde DEĞİL — `notification-rules.ts`
  // `emailByType` bunları içermez). Push 2026-06-01 expansion gereği `'on'`.
  {
    type: 'card_created',
    i18nKey: 'cardCreated',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'list_created',
    i18nKey: 'listCreated',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'list_renamed',
    i18nKey: 'listRenamed',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'list_moved',
    i18nKey: 'listMoved',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'list_archived',
    i18nKey: 'listArchived',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'list_deleted',
    i18nKey: 'listDeleted',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'board_created',
    i18nKey: 'boardCreated',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'board_renamed',
    i18nKey: 'boardRenamed',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'board_archived',
    i18nKey: 'boardArchived',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'board_background_changed',
    i18nKey: 'boardBackgroundChanged',
    group: 'boardLifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'label_created',
    i18nKey: 'labelCreated',
    group: 'label',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'label_updated',
    i18nKey: 'labelUpdated',
    group: 'label',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'label_deleted',
    i18nKey: 'labelDeleted',
    group: 'label',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'card_member_removed',
    i18nKey: 'cardMemberRemoved',
    group: 'membership',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  {
    type: 'member_removed',
    i18nKey: 'memberRemoved',
    group: 'membership',
    channels: { in_app: 'on', email: 'on', push: 'on' },
  },
  {
    type: 'member_role_changed',
    i18nKey: 'memberRoleChanged',
    group: 'membership',
    channels: { in_app: 'on', email: 'unavailable', push: 'on' },
  },
  // DEM-175 — board'a doğrudan eklenme. `board_invitation`'dan farklı:
  // mute-bypass DEĞİL (kullanıcı toggle edebilir), in-app + email opt-in.
  {
    type: 'board_member_added',
    i18nKey: 'boardMemberAdded',
    group: 'membership',
    channels: { in_app: 'on', email: 'on', push: 'on' },
  },
  // DEM-154 — paylaşılan board linkinden erişim talebi. Board admin'lerine
  // gider; `board_invitation` gibi mute-bypass DEĞİL, in-app + email opt-in.
  {
    type: 'board_access_requested',
    i18nKey: 'boardAccessRequested',
    group: 'invitations',
    channels: { in_app: 'on', email: 'on', push: 'on' },
  },
  {
    type: 'board_invitation',
    i18nKey: 'boardInvitation',
    group: 'invitations',
    channels: { in_app: 'mute_bypass', email: 'mute_bypass', push: 'on' },
  },
  {
    type: 'workspace_invitation',
    i18nKey: 'workspaceInvitation',
    group: 'invitations',
    channels: { in_app: 'mute_bypass', email: 'mute_bypass', push: 'on' },
  },
];
