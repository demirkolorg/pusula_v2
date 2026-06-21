/**
 * Bildirim sunum yardımcıları (Faz 7K) — bildirim merkezi satırlarının
 * ikon/sistem-bildirimi/özet metin türetmesi.
 *
 * Web `notification-type-icon.tsx` (lucide) + `notification-center.tsx`
 * (`SYSTEM_NOTIFICATION_TYPES`) + `activity-summary.ts` desenlerinin mobil
 * karşılığı. İkonlar Feather'a (mobil `Icon` bileşeni) eşlenir; lucide ile
 * görsel dil tutarlı (Feather lucide'ın atası).
 *
 * Saf modül — RN/Expo importu yok; birim test edilir.
 */
import type { IconName } from '@/components/icon';
import type { ThemeTokens } from '@/theme/tokens';
import { strings } from '@/lib/strings';

/**
 * Scheduler kaynaklı (aktörsüz) bildirim tipleri — bunları bir kullanıcı
 * tetiklemez, dolayısıyla satırda aktör adı gösterilmez (web
 * `notification-center.tsx` `SYSTEM_NOTIFICATION_TYPES` ile aynı küme). Bkz.
 * `docs/domain/04-bildirim-kurallari.md` → "Sistem (aktörsüz) bildirimler".
 */
const SYSTEM_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'due_approaching',
  'due_overdue',
  'due_reminder_1d',
  'due_reminder_1h',
]);

/** Bildirim sistem (aktörsüz) tipi mi — satırda aktör adı basılmaz. */
export function isSystemNotification(type: string): boolean {
  return SYSTEM_NOTIFICATION_TYPES.has(type);
}

/**
 * Bildirim tipi → Feather ikon adı. Web `notification-type-icon.tsx`'in
 * tip→ikon eşlemesini Feather karşılıklarıyla yansıtır; bilinmeyen tip için
 * genel `message-square`.
 */
export function notificationTypeIcon(type: string): IconName {
  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
    case 'board_member_added':
    case 'board.member_added':
      return 'user-plus';
    case 'mention':
    case 'comment.mentioned':
      return 'at-sign';
    case 'comment_reply':
    case 'comment.created':
    case 'comment_updated':
    case 'comment.updated':
    case 'comment_deleted':
    case 'comment.deleted':
    case 'watched_activity':
      return 'message-square';
    case 'due_approaching':
    case 'due_reminder_1d':
    case 'due_reminder_1h':
    case 'due_overdue':
      return 'clock';
    case 'board_invitation':
    case 'board.member_invited':
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return 'mail';
    case 'card_moved':
    case 'card.moved':
      return 'shuffle';
    case 'card_archived':
    case 'card.archived':
      return 'archive';
    case 'card_completed':
    case 'checklist_item_completed':
    case 'card.completed':
      return 'check-circle';
    case 'card_due_changed':
    case 'card.due_set':
    case 'card.due_cleared':
      return 'calendar';
    case 'card_cover_changed':
    case 'card.cover_changed':
    case 'card.cover_image_changed':
      return 'image';
    case 'card_member_removed':
    case 'card.member_removed':
    case 'member_removed':
      return 'user-minus';
    case 'attachment_added':
    case 'attachment.added':
    case 'attachment_removed':
    case 'attachment.removed':
      return 'paperclip';
    case 'card_renamed':
    case 'card.renamed':
      return 'edit-2';
    case 'card_description_changed':
    case 'card.description_changed':
      return 'align-left';
    case 'card_label_added':
    case 'card.label_added':
    case 'card_label_removed':
    case 'card.label_removed':
      return 'tag';
    case 'checklist_created':
    case 'checklist.created':
    case 'checklist_item_added':
    case 'checklist.item_added':
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return 'check-square';
    case 'member_role_changed':
      return 'shield';
    case 'board_access_requested':
    case 'board.access_requested':
      return 'key';
    // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). Kart
    // oluşturma + liste / board / etiket yaşam döngüsü. Web `lucide`
    // karşılıklarının Feather eşlenikleri (görsel dil tutarlı).
    case 'card_created':
    case 'card.created':
      return 'file-plus';
    case 'list_created':
    case 'list.created':
      return 'plus-square';
    case 'list_renamed':
    case 'list.renamed':
      return 'edit-2';
    case 'list_moved':
    case 'list.moved':
      return 'columns';
    case 'list_archived':
    case 'list.archived':
    case 'board_archived':
    case 'board.archived':
      return 'archive';
    case 'list_deleted':
    case 'list.deleted':
      return 'trash-2';
    case 'board_created':
    case 'board.created':
      return 'grid';
    case 'board_renamed':
    case 'board.renamed':
      return 'edit-2';
    case 'board_background_changed':
    case 'board.background_changed':
      return 'droplet';
    case 'label_created':
    case 'label.created':
    case 'label_updated':
    case 'label.updated':
    case 'label_deleted':
    case 'label.deleted':
      return 'tag';
    default:
      return 'message-square';
  }
}

/**
 * Bildirim tipi → ikon vurgu rengi. **Yalnız tema token'ları** (renk paletiyle
 * uyumlu; sabit palet renkleri kullanılmaz — 2026-06-21). Sade, anlamsal bir
 * skala: kırmızı=acil, turuncu=teslim, yeşil=tamamlandı, primary=sana doğrudan
 * yönelik (atama/bahsetme/davet), gri=genel aktivite. Önceki sürüm tip başına
 * 9 farklı renk (mavi/mor/sky/indigo dahil) kullanıyordu → liste "çok karışık"
 * görünüyordu (kullanıcı geri bildirimi); bu skala görsel gürültüyü azaltıp
 * tarama kolaylığını korur. Saf fonksiyon — birim test edilir.
 */
export function notificationTypeTone(type: string, theme: ThemeTokens): string {
  switch (type) {
    // Aciliyet / durum — evrensel anlamsal renkler.
    case 'due_overdue':
      return theme.destructive;
    case 'due_approaching':
    case 'due_reminder_1d':
    case 'due_reminder_1h':
    case 'card_due_changed':
    case 'card.due_set':
    case 'card.due_cleared':
      return theme.warning;
    case 'card_completed':
    case 'card.completed':
    case 'checklist_item_completed':
      return theme.success;
    // Doğrudan sana yönelik (atama / bahsetme / davet / erişim talebi) — birincil vurgu.
    case 'card_assigned':
    case 'card.member_added':
    case 'board_member_added':
    case 'board.member_added':
    case 'mention':
    case 'comment.mentioned':
    case 'board_invitation':
    case 'board.member_invited':
    case 'workspace_invitation':
    case 'workspace.member_invited':
    case 'board_access_requested':
    case 'board.access_requested':
      return theme.primary;
    // Geri kalan tüm aktivite (yorum, oluşturma, liste/board/etiket yaşam döngüsü) — nötr.
    default:
      return theme.mutedForeground;
  }
}

type NotificationPayloadRecord = Record<string, unknown>;

function payloadText(payload: NotificationPayloadRecord, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Pano bağlamı öneki (içerik sözleşmesi 2026-06-20). `boardName` payload'ta
 * varsa `"<pano>" panosunda ` döner (ek-güvenli kalıp — locative ek jenerik
 * "pano" kelimesine gelir), yoksa boş string → cümle graceful kalır. Eski
 * bildirimlerde `boardName` olmayabilir → her zaman fallback. Worker
 * `boardContextPrefix` + web simetriği.
 */
function boardCtxOf(payload: NotificationPayloadRecord): string {
  return strings.notifications.summary.boardCtx(payloadText(payload, 'boardName'));
}

const TR_MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

const TR_WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

/**
 * `card_due_changed` (set) için kısa, **cihaz-yerel** teslim tarihi metni:
 * gün-içi saat yoksa "25 Haz Cmt" (gün + ay + kısa hafta günü), saat varsa
 * "25 Haz 14:00". Worker `formatDueTr` ile simetrik **ama** cihaz saat dilimini
 * kullanır (worker sabit Europe/Istanbul; mobil kullanıcının cihaz TZ'si).
 *
 * Tarih bileşenleri (gün/ay/hafta günü/saat) cihaz yerel saatinden okunur
 * (`getDate`/`getMonth`/`getDay`/`getHours`); TR ay/gün kısaltmaları elle
 * çevrilir — `format-date.ts` deseni (Hermes/`Intl` weekday tutarsızlığından
 * bağımsız, deterministik, test edilebilir). `dueAt` yoksa/geçersizse `null`
 * → metin tarihsiz (bağlamsız) yedeğe düşer.
 */
function formatDueLabel(payload: NotificationPayloadRecord): string | undefined {
  const raw = payloadText(payload, 'dueAt');
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = d.getDate();
  const month = TR_MONTHS_SHORT[d.getMonth()];
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (hasTime) {
    const hh = d.getHours() < 10 ? `0${d.getHours()}` : String(d.getHours());
    const mm = d.getMinutes() < 10 ? `0${d.getMinutes()}` : String(d.getMinutes());
    return `${day} ${month} ${hh}:${mm}`;
  }
  return `${day} ${month} ${TR_WEEKDAYS_SHORT[d.getDay()]}`;
}

/** Türkçe rol etiketi — worker `roleLabelTr` ile aynı (sahip/yönetici/üye/...). */
function roleLabel(role: string | undefined): string | undefined {
  if (!role) return undefined;
  switch (role) {
    case 'owner':
      return 'sahip';
    case 'admin':
      return 'yönetici';
    case 'member':
      return 'üye';
    case 'viewer':
      return 'görüntüleyici';
    case 'guest':
      return 'misafir';
    default:
      return role;
  }
}

function cardTitleOf(payload: NotificationPayloadRecord): string {
  return (
    payloadText(payload, 'cardTitle') ??
    payloadText(payload, 'title') ??
    strings.notifications.fallbackCardTitle
  );
}

function boardNameOf(payload: NotificationPayloadRecord): string {
  return payloadText(payload, 'boardName') ?? strings.notifications.fallbackBoardName;
}

/**
 * Liste adı — yeniden adlandırmada `toTitle`, oluşturma/silmede `title`,
 * taşımada ad taşınmaz. Hiçbiri yoksa entity-bağımsız jenerik yedek. Web
 * `activity-summary.ts:listName` ile aynı.
 */
function listNameOf(payload: NotificationPayloadRecord): string {
  return (
    payloadText(payload, 'toTitle') ??
    payloadText(payload, 'title') ??
    payloadText(payload, 'name') ??
    strings.notifications.fallbackListName
  );
}

/** Etiket adı — `name` payload alanı; yoksa jenerik yedek. */
function labelNameOf(payload: NotificationPayloadRecord): string {
  return payloadText(payload, 'name') ?? strings.notifications.fallbackLabelName;
}

/** Board adı — rename sonrası yeni başlık (`toTitle`) varsa onu yeğle. */
function boardTitleOf(payload: NotificationPayloadRecord): string {
  return payloadText(payload, 'toTitle') ?? boardNameOf(payload);
}

/** `payload.archived` boolean'ından arşivleme yönünü çözer (true = arşivlendi). */
function isArchivedOf(payload: NotificationPayloadRecord): boolean {
  return payload.archived !== false;
}

/**
 * Bildirim satırının aktör-prefixsiz özet metni — web `activity-summary.ts`'in
 * mobil karşılığı. Satır aktör adını ayrı (kalın) basar; bu metin yeniden
 * kullanılabilir + test edilebilir kalsın diye aktör adını içermez.
 */
export function notificationSummary(type: string, payload: unknown): string {
  const p: NotificationPayloadRecord =
    typeof payload === 'object' && payload !== null ? (payload as NotificationPayloadRecord) : {};
  const copy = strings.notifications.summary;

  const boardCtx = boardCtxOf(p);

  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
      return copy.cardMemberAdded(cardTitleOf(p), boardCtx);
    case 'mention':
    case 'comment.mentioned':
      return copy.commentMentioned(cardTitleOf(p), payloadText(p, 'commentPreview'), boardCtx);
    case 'comment_reply':
    case 'comment.created':
      return copy.commentCreated(cardTitleOf(p), payloadText(p, 'commentPreview'), boardCtx);
    case 'due_approaching': {
      // DEM-170 — scheduler 1g/1s hatırlatmasının ikisine de `due_approaching`
      // tipini verir; tier-özel metni `reminderTier` payload alanından seç.
      const tier = payloadText(p, 'reminderTier');
      if (tier === 'due_reminder_1h') return copy.dueReminder1h(cardTitleOf(p));
      if (tier === 'due_reminder_1d') return copy.dueReminder1d(cardTitleOf(p));
      return copy.dueApproaching(cardTitleOf(p));
    }
    case 'due_reminder_1d':
      return copy.dueReminder1d(cardTitleOf(p));
    case 'due_reminder_1h':
      return copy.dueReminder1h(cardTitleOf(p));
    case 'due_overdue':
      return copy.dueOverdue(cardTitleOf(p));
    case 'board_invitation':
    case 'board.member_invited':
      return copy.boardMemberInvited(boardNameOf(p));
    case 'board_member_added':
    case 'board.member_added':
      return copy.boardMemberAdded(boardNameOf(p));
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return copy.workspaceMemberInvited(
        payloadText(p, 'workspaceName') ?? strings.notifications.fallbackWorkspaceName,
      );
    case 'board_access_requested':
    case 'board.access_requested':
      return copy.boardAccessRequested(boardNameOf(p));
    case 'card_moved':
    case 'card.moved':
      // Liste geçişi (`fromListTitle`/`toListTitle`) — worker `card_moved` ile
      // simetrik; alanlar yoksa düz "taşıdı" yedeğine düşer.
      return copy.cardMoved(
        cardTitleOf(p),
        payloadText(p, 'fromListTitle'),
        payloadText(p, 'toListTitle'),
        boardCtx,
      );
    case 'card_archived':
    case 'card.archived':
      return copy.cardArchived(cardTitleOf(p), boardCtx);
    case 'card_completed':
    case 'card.completed':
      return payloadText(p, 'activityType') === 'card.uncompleted'
        ? copy.cardUncompleted(cardTitleOf(p), boardCtx)
        : copy.cardCompleted(cardTitleOf(p), boardCtx);
    case 'card_due_changed':
      // Set durumunda yeni tarih cihaz-yerel kısa TR formatta; clear'da kaldırıldı.
      return payloadText(p, 'activityType') === 'card.due_cleared'
        ? copy.cardDueCleared(cardTitleOf(p), boardCtx)
        : copy.cardDueSet(cardTitleOf(p), formatDueLabel(p), boardCtx);
    case 'card_cover_changed':
      return copy.cardCoverChanged(cardTitleOf(p), boardCtx);
    case 'card_member_removed':
    case 'card.member_removed':
      return copy.cardMemberRemoved(cardTitleOf(p));
    case 'member_removed':
      return copy.memberRemoved(boardNameOf(p));
    case 'member_role_changed':
      // Rol geçişi (`fromRole`→`toRole`, TR etiket); alanlar yoksa "rolünü değiştirdi".
      return copy.memberRoleChanged(
        boardNameOf(p),
        roleLabel(payloadText(p, 'fromRole')),
        roleLabel(payloadText(p, 'toRole')),
      );
    case 'attachment_added':
    case 'attachment.added':
      return copy.attachmentAdded(cardTitleOf(p), payloadText(p, 'fileName'), boardCtx);
    case 'attachment_removed':
    case 'attachment.removed':
      return copy.attachmentRemoved(cardTitleOf(p), payloadText(p, 'fileName'), boardCtx);
    case 'card_renamed':
    case 'card.renamed':
      return copy.cardRenamed(cardTitleOf(p), boardCtx);
    case 'card_description_changed':
    case 'card.description_changed':
      return copy.cardDescriptionChanged(cardTitleOf(p), boardCtx);
    case 'card_label_added':
    case 'card.label_added':
      // Etiket adı (`labelName`) taşınır; yoksa jenerik "bir etiket".
      return copy.cardLabelAdded(cardTitleOf(p), payloadText(p, 'labelName'), boardCtx);
    case 'card_label_removed':
    case 'card.label_removed':
      return copy.cardLabelRemoved(cardTitleOf(p), payloadText(p, 'labelName'), boardCtx);
    case 'comment_updated':
    case 'comment.updated':
      return copy.commentUpdated(cardTitleOf(p), boardCtx);
    case 'comment_deleted':
    case 'comment.deleted':
      return copy.commentDeleted(cardTitleOf(p), boardCtx);
    case 'checklist_created':
    case 'checklist.created':
      return copy.checklistCreated(cardTitleOf(p), boardCtx);
    case 'checklist_item_added':
    case 'checklist.item_added':
      return copy.checklistItemAdded(cardTitleOf(p), payloadText(p, 'content'), boardCtx);
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return copy.checklistItemRemoved(cardTitleOf(p), payloadText(p, 'content'), boardCtx);
    case 'checklist_item_completed':
      return copy.checklistItemCompleted(cardTitleOf(p), payloadText(p, 'content'), boardCtx);
    case 'watched_activity':
      return copy.watchedActivity(cardTitleOf(p), boardCtx);
    // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). Kart
    // oluşturma + liste / board / etiket yaşam döngüsü. Web `activity-summary.ts`
    // ile aynı metin seti (mobil `strings.notifications.summary` kopyası).
    case 'card_created':
    case 'card.created':
      return copy.cardCreated(cardTitleOf(p), boardCtx);
    case 'list_created':
    case 'list.created':
      return copy.listCreated(listNameOf(p));
    case 'list_renamed':
    case 'list.renamed':
      return copy.listRenamed(listNameOf(p));
    case 'list_moved':
    case 'list.moved':
      return copy.listMoved(listNameOf(p));
    case 'list_archived':
    case 'list.archived':
      return isArchivedOf(p)
        ? copy.listArchived(listNameOf(p))
        : copy.listUnarchived(listNameOf(p));
    case 'list_deleted':
    case 'list.deleted':
      return copy.listDeleted(listNameOf(p));
    case 'board_created':
    case 'board.created':
      return copy.boardCreated(boardTitleOf(p));
    case 'board_renamed':
    case 'board.renamed':
      return copy.boardRenamed(boardTitleOf(p));
    case 'board_archived':
    case 'board.archived':
      return isArchivedOf(p)
        ? copy.boardArchived(boardNameOf(p))
        : copy.boardUnarchived(boardNameOf(p));
    case 'board_background_changed':
    case 'board.background_changed':
      return copy.boardBackgroundChanged(boardNameOf(p));
    case 'label_created':
    case 'label.created':
      return copy.labelCreated(labelNameOf(p));
    case 'label_updated':
    case 'label.updated':
      return copy.labelUpdated(labelNameOf(p));
    case 'label_deleted':
    case 'label.deleted':
      return copy.labelDeleted(labelNameOf(p));
    default:
      return copy.default;
  }
}

/** Bildirim payload'ından aktör adını okur (yoksa `null`). */
export function notificationActorName(payload: unknown): string | null {
  const p: NotificationPayloadRecord =
    typeof payload === 'object' && payload !== null ? (payload as NotificationPayloadRecord) : {};
  return payloadText(p, 'actorName') ?? null;
}

/**
 * Bildirim payload'ından aktör profil görselini okur (yoksa `null`). Liste
 * satırı avatarında kullanılır — `byId` üst-seviye `actorImage` taşır ama
 * `notifications.list` satırı taşımaz; görsel yalnız payload'tan gelir (web
 * `notification-center.tsx` `payload.actorImage` ile simetrik).
 */
export function notificationActorImage(payload: unknown): string | null {
  const p: NotificationPayloadRecord =
    typeof payload === 'object' && payload !== null ? (payload as NotificationPayloadRecord) : {};
  return payloadText(p, 'actorImage') ?? null;
}
