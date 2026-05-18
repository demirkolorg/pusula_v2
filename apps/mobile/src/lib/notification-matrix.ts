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
  'membership',
  'invitations',
];

/**
 * Tip × kanal matrisi — web `MATRIX_ROWS` ile birebir. `notification-rules.ts`
 * `pickChannels` koduna tabidir.
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
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'comment_updated',
    i18nKey: 'commentUpdated',
    group: 'comment',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'comment_deleted',
    i18nKey: 'commentDeleted',
    group: 'comment',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
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
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_moved',
    i18nKey: 'cardMoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_archived',
    i18nKey: 'cardArchived',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_completed',
    i18nKey: 'cardCompleted',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_cover_changed',
    i18nKey: 'cardCoverChanged',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
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
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_description_changed',
    i18nKey: 'cardDescriptionChanged',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_label_added',
    i18nKey: 'cardLabelAdded',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_label_removed',
    i18nKey: 'cardLabelRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'checklist_created',
    i18nKey: 'checklistCreated',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'checklist_item_added',
    i18nKey: 'checklistItemAdded',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'checklist_item_removed',
    i18nKey: 'checklistItemRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'attachment_removed',
    i18nKey: 'attachmentRemoved',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'checklist_item_completed',
    i18nKey: 'checklistItemCompleted',
    group: 'lifecycle',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'card_member_removed',
    i18nKey: 'cardMemberRemoved',
    group: 'membership',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'member_removed',
    i18nKey: 'memberRemoved',
    group: 'membership',
    channels: { in_app: 'on', email: 'on', push: 'unavailable' },
  },
  {
    type: 'member_role_changed',
    i18nKey: 'memberRoleChanged',
    group: 'membership',
    channels: { in_app: 'on', email: 'unavailable', push: 'unavailable' },
  },
  {
    type: 'board_member_added',
    i18nKey: 'boardMemberAdded',
    group: 'membership',
    channels: { in_app: 'on', email: 'on', push: 'unavailable' },
  },
  {
    type: 'board_invitation',
    i18nKey: 'boardInvitation',
    group: 'invitations',
    channels: { in_app: 'mute_bypass', email: 'mute_bypass', push: 'unavailable' },
  },
  {
    type: 'workspace_invitation',
    i18nKey: 'workspaceInvitation',
    group: 'invitations',
    channels: { in_app: 'mute_bypass', email: 'mute_bypass', push: 'unavailable' },
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
