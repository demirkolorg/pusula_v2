/**
 * Bildirim tipi × kanal matrisi (Faz 7K) — bildirim ayar ekranı "Bildirim
 * tipleri" bölümünün veri kaynağı.
 *
 * Bu nesne web `apps/web/.../notifications-shared.ts` `MATRIX_ROWS`'unun mobil
 * kopyasıdır; `MATRIX_ROWS` apps/web'e özeldir (paylaşılan paket değil), bu
 * yüzden mobil kendi kopyasını tutar. İkisi de
 * `notification-rules.ts:pickChannels` koduna tabidir — yeni bir tip
 * eklendiğinde her iki taraf da güncellenmelidir.
 *
 * Web `notifications-type-matrix.tsx`'in fiilî davranışı: tip-bazlı kanal
 * kaydı backend'de YOK; matristeki toggle'lar global kanal flag'ini değiştirir.
 * Mobil bu davranışı birebir aynalar — fazladan yetenek uydurmaz.
 *
 * Saf modül — RN/Expo importu yok; birim test edilir.
 */
import type { NotificationType } from '@pusula/domain';

/** Kanal sütunları — matris render sırası. */
export const NOTIFICATION_CHANNEL_KEYS = ['in_app', 'email', 'push'] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNEL_KEYS)[number];

/**
 * Tip × kanal hücre durumu.
 *  - `'on'`         → kanal varsayılanda açık, kullanıcı toggle edebilir.
 *  - `'mute_bypass'`→ kanal sabit açık (mute-bypass), toggle edilemez.
 *  - `'unavailable'`→ rule-engine bu kombinasyonu zaten göndermiyor.
 */
export type ChannelCellState = 'on' | 'mute_bypass' | 'unavailable';

/** Tip gruplaması — matris bölüm başlıkları. */
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
  /** `strings.notificationSettings.matrix.types.*` anahtarı (camelCase). */
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
 * Tip × kanal matrisi — web `MATRIX_ROWS` ile birebir. `notification-rules.ts`
 * `pickChannels` koduna tabidir. 2026-06-01 push expansion sonrası tüm
 * tiplerin push hücresi `'on'` (`pickChannels` artık `pushEnabled` gate'ine
 * bağlar; push'ta mute-bypass yok). Detay → `docs/domain/04-bildirim-kurallari.md`
 * "Push kanalı kapsamı".
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
  // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). Web
  // `MATRIX_ROWS` ile birebir simetrik. Hepsi in-app + push (email opt-in
  // listesinde DEĞİL); push 2026-06-01 expansion gereği `'on'`.
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

/** Matris satırlarını grup anahtarına göre öbekler (boş gruplar dahil değil). */
export function groupMatrixRows(
  rows: readonly MatrixRow[],
): { group: MatrixGroupKey; rows: MatrixRow[] }[] {
  return MATRIX_GROUPS.map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group),
  })).filter((entry) => entry.rows.length > 0);
}
