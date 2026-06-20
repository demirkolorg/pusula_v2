import { formatDueShort } from './format';
import { strings } from './strings';

type ActivityPayload = Record<string, unknown>;

function text(payload: ActivityPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Ek-güvenli pano bağlamı öneki — `"<pano>" panosunda `. Worker'ın
 * `boardContextPrefix`'iyle birebir simetrik: locative ek jenerik **"pano"**
 * kelimesine gelir (kullanıcı verisi pano adına değil), bu yüzden ek-uyumu her
 * zaman doğru. Pano adı yoksa boş string döner → cümle pano bağlamı olmadan da
 * anlamlı kalır (graceful fallback, eski payload'larda `boardName` olmayabilir).
 */
function boardContext(payload: ActivityPayload): string {
  const board = text(payload, 'boardName');
  return board ? `"${board}" panosunda ` : '';
}

/** `card_moved` liste geçişi alanları (`fromListTitle` / `toListTitle`). */
function fromListTitle(payload: ActivityPayload): string {
  return text(payload, 'fromListTitle') ?? '';
}

function toListTitle(payload: ActivityPayload): string {
  return text(payload, 'toListTitle') ?? '';
}

/** Etiket adı — `labelName` payload alanı (`card_label_*`); yoksa boş string. */
function cardLabelName(payload: ActivityPayload): string {
  return text(payload, 'labelName') ?? '';
}

/** Ek (attachment) dosya adı — `fileName` payload alanı; yoksa boş string. */
function attachmentFileName(payload: ActivityPayload): string {
  return text(payload, 'fileName') ?? '';
}

/**
 * Yeni teslim tarihi kısa, **cihaz-yerel** TR etiketi (`formatDueShort`). Worker
 * push/email'i sabit Europe/Istanbul kullanır; in-app metin kullanıcının
 * tarayıcı saat dilimine göre formatlanır. Geçersiz/eksik `dueAt` → boş string.
 */
function dueLabel(payload: ActivityPayload): string {
  return formatDueShort(text(payload, 'dueAt')) ?? '';
}

function cardTitle(payload: ActivityPayload): string {
  return (
    text(payload, 'cardTitle') ?? text(payload, 'title') ?? strings.notifications.fallbackCardTitle
  );
}

function boardName(payload: ActivityPayload): string {
  return text(payload, 'boardName') ?? strings.notifications.fallbackBoardName;
}

/**
 * Liste adı — yeniden adlandırmada `toTitle` (yeni başlık), oluşturma/silmede
 * `title`, taşımada hiç ad taşınmaz (payload yalnız pozisyon). Hiçbiri yoksa
 * entity-bağımsız jenerik yedek. Bkz. `notification-rules.ts:buildPayload`
 * whitelist (`title`/`toTitle`/`name`).
 */
function listName(payload: ActivityPayload): string {
  return (
    text(payload, 'toTitle') ??
    text(payload, 'title') ??
    text(payload, 'name') ??
    strings.notifications.fallbackListName
  );
}

/** Etiket adı — `name` payload alanı (label CRUD); yoksa jenerik yedek. */
function labelName(payload: ActivityPayload): string {
  return text(payload, 'name') ?? strings.notifications.fallbackLabelName;
}

/** Board adı — rename sonrası yeni başlık (`toTitle`) varsa onu yeğle. */
function boardTitle(payload: ActivityPayload): string {
  return text(payload, 'toTitle') ?? boardName(payload);
}

/** `payload.archived` boolean'ından arşivleme yönünü çözer (true = arşivlendi). */
function isArchived(payload: ActivityPayload): boolean {
  return payload.archived !== false;
}

/**
 * Rol kodunu TR etiketine çevirir — worker `roleLabelTr` + mobil `roleLabel`
 * ile birebir. `member_role_changed` özetinde "üye → yönetici" geçişini yazar.
 * Bilinmeyen/boş rol → boş string (metin "rolünü değiştirdi"ye düşer).
 */
function roleLabelTr(role: string | undefined): string {
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
      return role ?? '';
  }
}

/**
 * Notification summary copy without the actor prefix. Notification rows render
 * the actor separately so the name can stay bold while the action text remains
 * reusable and testable.
 */
export function activitySummary(type: string, payload: unknown): string {
  const p = typeof payload === 'object' && payload !== null ? (payload as ActivityPayload) : {};
  const copy = strings.notifications.summary;

  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
      return copy.cardMemberAdded(cardTitle(p), boardContext(p));
    case 'mention':
    case 'comment.mentioned':
      return copy.commentMentioned(cardTitle(p), boardContext(p));
    case 'comment_reply':
    case 'comment.created':
      return copy.commentCreated(cardTitle(p), boardContext(p));
    case 'due_approaching': {
      // DEM-170 — scheduler 1g/1s hatırlatmasının ikisine de `due_approaching`
      // tipini verir; tier-özel metni `reminderTier` payload alanından seç.
      const tier = text(p, 'reminderTier');
      if (tier === 'due_reminder_1h') return copy.dueReminder1h(cardTitle(p));
      if (tier === 'due_reminder_1d') return copy.dueReminder1d(cardTitle(p));
      return copy.dueApproaching(cardTitle(p));
    }
    case 'due_reminder_1d':
      return copy.dueReminder1d(cardTitle(p));
    case 'due_reminder_1h':
      return copy.dueReminder1h(cardTitle(p));
    case 'due_overdue':
      return copy.dueOverdue(cardTitle(p));
    case 'board_invitation':
    case 'board.member_invited':
      return copy.boardMemberInvited(boardName(p));
    // DEM-175 — board'a doğrudan eklenme: "davet etti" değil "ekledi".
    case 'board_member_added':
    case 'board.member_added':
      return copy.boardMemberAdded(boardName(p));
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return copy.workspaceMemberInvited(
        text(p, 'workspaceName') ?? strings.notifications.fallbackWorkspaceName,
      );
    // DEM-154 — board erişim talebi bildirimi (alıcı board admin'i).
    case 'board_access_requested':
    case 'board.access_requested':
      return copy.boardAccessRequested(boardName(p));
    // DEM-152 — granular kart-aktivite tipleri. Her tip kendi özet metniyle;
    // iki activity tipi tek bildirim tipini paylaştığında (`card_completed`,
    // `card_due_changed`) `activityType` payload alanı doğru fiili seçer.
    case 'card_moved':
    case 'card.moved':
      return copy.cardMoved(cardTitle(p), boardContext(p), fromListTitle(p), toListTitle(p));
    case 'card_archived':
      return copy.cardArchived(cardTitle(p), boardContext(p));
    case 'card_completed':
      return text(p, 'activityType') === 'card.uncompleted'
        ? copy.cardUncompleted(cardTitle(p), boardContext(p))
        : copy.cardCompleted(cardTitle(p), boardContext(p));
    case 'card_due_changed':
      return text(p, 'activityType') === 'card.due_cleared'
        ? copy.cardDueCleared(cardTitle(p), boardContext(p))
        : copy.cardDueSet(cardTitle(p), boardContext(p), dueLabel(p));
    case 'card_cover_changed':
      return copy.cardCoverChanged(cardTitle(p), boardContext(p));
    case 'card_member_removed':
    case 'card.member_removed':
      return copy.cardMemberRemoved(cardTitle(p));
    // Faz 10A (DEM-135) — board/workspace üyelikten çıkarma + rol değişimi.
    // Worker push/email + mobil in-app ile simetrik (board-merkezli metin).
    case 'member_removed':
    case 'board.member_removed':
    case 'workspace.member_removed':
      return copy.memberRemoved(boardName(p));
    case 'member_role_changed':
    case 'board.member_role_changed':
    case 'workspace.member_role_changed':
      return copy.memberRoleChanged(
        boardName(p),
        roleLabelTr(text(p, 'fromRole')),
        roleLabelTr(text(p, 'toRole')),
      );
    case 'attachment_added':
    case 'attachment.added':
      return copy.attachmentAdded(cardTitle(p), boardContext(p), attachmentFileName(p));
    // DEM-153 — kartla ilgili kalan granular tipler (notification tipi +
    // activity-type alias'ı eski payload'lar için birlikte tutulur).
    case 'card_renamed':
    case 'card.renamed':
      return copy.cardRenamed(cardTitle(p), boardContext(p));
    case 'card_description_changed':
    case 'card.description_changed':
      return copy.cardDescriptionChanged(cardTitle(p), boardContext(p));
    case 'card_label_added':
    case 'card.label_added':
      return copy.cardLabelAdded(cardTitle(p), boardContext(p), cardLabelName(p));
    case 'card_label_removed':
    case 'card.label_removed':
      return copy.cardLabelRemoved(cardTitle(p), boardContext(p), cardLabelName(p));
    case 'comment_updated':
    case 'comment.updated':
      return copy.commentUpdated(cardTitle(p), boardContext(p));
    case 'comment_deleted':
    case 'comment.deleted':
      return copy.commentDeleted(cardTitle(p), boardContext(p));
    case 'checklist_created':
    case 'checklist.created':
      return copy.checklistCreated(cardTitle(p), boardContext(p));
    case 'checklist_item_added':
    case 'checklist.item_added':
      return copy.checklistItemAdded(cardTitle(p), boardContext(p));
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return copy.checklistItemRemoved(cardTitle(p), boardContext(p));
    case 'attachment_removed':
    case 'attachment.removed':
      return copy.attachmentRemoved(cardTitle(p), boardContext(p));
    // `watched_activity` artık üretilmiyor (DEM-152) ama eski satırlar için
    // fallback olarak korunur — `activityType`'a göre çözer.
    case 'watched_activity':
      switch (text(p, 'activityType')) {
        case 'card.archived':
          return copy.cardArchived(cardTitle(p), boardContext(p));
        case 'card.completed':
          return copy.cardCompleted(cardTitle(p), boardContext(p));
        case 'card.moved':
          return copy.cardMoved(cardTitle(p), boardContext(p), fromListTitle(p), toListTitle(p));
        default:
          return copy.watchedActivity(cardTitle(p), boardContext(p));
      }
    case 'checklist_item_completed':
      return copy.checklistItemCompleted(cardTitle(p), boardContext(p));
    case 'card.archived':
      return copy.cardArchived(cardTitle(p), boardContext(p));
    case 'card.completed':
      return copy.cardCompleted(cardTitle(p), boardContext(p));
    // DEM-276 follow-up — manuel/save rapor render bildirimleri. Worker
    // payload'a `format` koyar ('pdf' | 'xlsx' | 'png' | 'svg'); fallback
    // 'pdf'. Sistem bildirimi olduğundan `actorName` yok — UI satırı
    // `isSystemNotification` ile actor bloğunu hide eder.
    case 'report_render_completed':
      return copy.reportRenderCompleted(text(p, 'format') ?? 'pdf');
    case 'report_render_failed':
      return copy.reportRenderFailed(text(p, 'format') ?? 'pdf');
    // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). Kart
    // oluşturma + liste / board / etiket yaşam döngüsü özetleri. Arşivleme
    // tipleri `payload.archived` yönüne göre arşivle/geri al metnini seçer.
    case 'card_created':
    case 'card.created':
      return copy.cardCreated(cardTitle(p));
    case 'list_created':
    case 'list.created':
      return copy.listCreated(listName(p));
    case 'list_renamed':
    case 'list.renamed':
      return copy.listRenamed(listName(p));
    case 'list_moved':
    case 'list.moved':
      return copy.listMoved(listName(p));
    case 'list_archived':
    case 'list.archived':
      return isArchived(p) ? copy.listArchived(listName(p)) : copy.listUnarchived(listName(p));
    case 'list_deleted':
    case 'list.deleted':
      return copy.listDeleted(listName(p));
    case 'board_created':
    case 'board.created':
      return copy.boardCreated(boardTitle(p));
    case 'board_renamed':
    case 'board.renamed':
      return copy.boardRenamed(boardTitle(p));
    case 'board_archived':
    case 'board.archived':
      return isArchived(p) ? copy.boardArchived(boardName(p)) : copy.boardUnarchived(boardName(p));
    case 'board_background_changed':
    case 'board.background_changed':
      return copy.boardBackgroundChanged(boardName(p));
    case 'label_created':
    case 'label.created':
      return copy.labelCreated(labelName(p));
    case 'label_updated':
    case 'label.updated':
      return copy.labelUpdated(labelName(p));
    case 'label_deleted':
    case 'label.deleted':
      return copy.labelDeleted(labelName(p));
    default:
      return copy.default;
  }
}
