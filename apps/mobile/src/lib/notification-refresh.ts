/**
 * Push payload → cache tazeleme kapsamı (DEM-219 + DEM-229).
 *
 * Mobil realtime kararı sabittir: Socket.IO yok. Foreground'da gelen bir push
 * bildirimi banner gösterir ama açık board/kart ekranını ve sekme rozetini
 * tazelemez. `use-foreground-notification-refresh` bu boşluğu mevcut push
 * teslimini cache invalidate'e bağlayarak kapatır.
 *
 * Bu modül worker'ın push `data` payload'ından
 * (`{ type, activityType?, cardId?, boardId? }`) hangi board/kart sorgularının
 * tazeleneceğini deterministik türetir.
 *
 * DEM-229 (P4 — performans): foreground push geldiğinde açık kart detayının
 * TÜM alt sorgularını invalidate etmek (card.get + labels + members + comment +
 * checklist + activity) gereksiz refetch üretiyordu — örn. yalnız bir yorum
 * push'unda etiket/üye/checklist sorguları boşuna yeniden çekiliyordu. Worker
 * push `data` payload'ı bildirim tipini (`NotificationType`) zaten taşıyor;
 * `cardRefreshTargets` bu tipi okuyup yalnız ilgili kart sorgularını seçer.
 * Tip bilinmiyorsa/eşleşmiyorsa GÜVENLİ tarafta kalınır — eski davranış
 * (hepsini invalidate) fallback'tir.
 *
 * Saf modül — RN/Expo importu yok; `notification-refresh.test.ts` ile birim
 * test edilir (`notification-target.ts` ile aynı üslup).
 */

import type { NotificationType } from '@pusula/domain';

/** Boş olmayan, kırpılmış bir string ise onu döndürür; aksi halde `null`. */
function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Bildirim payload'ını güvenli bir `Record`'a indirger. */
function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * Açık kart detayının tazelenebilir alt sorguları. `use-foreground-notification-refresh`
 * her hedef için ilgili `trpc.*.queryFilter` invalidate eder.
 *
 *  - `card`      → `card.get` (başlık/açıklama/kapak/teslim/tamamlanma).
 *  - `labels`    → `card.labels.list`.
 *  - `members`   → `card.members.list`.
 *  - `comment`   → `comment.list`.
 *  - `checklist` → `checklist.list`.
 *  - `activity`  → `card.activity.list` (her kart değişikliği aktivite üretir).
 */
export type CardRefreshTarget = 'card' | 'labels' | 'members' | 'comment' | 'checklist' | 'activity';

/** Açık kart detayının tüm alt sorguları — bilinmeyen tip için güvenli fallback. */
const ALL_CARD_TARGETS: readonly CardRefreshTarget[] = [
  'card',
  'labels',
  'members',
  'comment',
  'checklist',
  'activity',
];

/**
 * Bildirim tipi → tazelenecek kart sorguları eşlemesi.
 *
 * Her giriş `activity`'yi içerir: kartla ilgili her bildirim arkasında bir
 * activity satırı vardır, dolayısıyla açık kart detayının aktivite sekmesi
 * her zaman bayatlar. Geri kalan hedefler bildirimin gerçekten dokunduğu
 * veriye daraltılır:
 *
 *  - Yorum tipleri (`comment_reply`/`mention`/`comment_updated`/`comment_deleted`)
 *    → yalnız `comment` + `activity` (etiket/üye/checklist değişmez).
 *  - Üye tipleri (`card_assigned`/`card_member_removed`/`member_*`) → `members`.
 *  - Etiket tipleri (`card_label_*`) → `labels`.
 *  - Checklist tipleri (`checklist_*`) → `checklist`.
 *  - Kart alanı tipleri (`card_renamed`/`card_description_changed`/
 *    `card_cover_changed`/`card_due_changed`/`card_completed`/`card_archived`/
 *    `card_moved`/`due_*`) → `card` (card.get başlık/açıklama/kapak/teslim/durum).
 *  - Ek tipleri (`attachment_*`) → yalnız `activity` (mobilde ek sorgusu
 *    foreground refresh kapsamında değil; eklenti listesi kart detayında
 *    ayrı çekilir, aktivite üzerinden görünür).
 *
 * Listede olmayan / `watched_activity` gibi belirsiz tipler `cardRefreshTargets`
 * tarafından tam fallback (`ALL_CARD_TARGETS`) ile karşılanır.
 */
const TYPE_TO_CARD_TARGETS: Partial<Record<NotificationType, readonly CardRefreshTarget[]>> = {
  // Yorum.
  comment_reply: ['comment', 'activity'],
  mention: ['comment', 'activity'],
  comment_updated: ['comment', 'activity'],
  comment_deleted: ['comment', 'activity'],
  // Üyelik.
  card_assigned: ['members', 'activity'],
  card_member_removed: ['members', 'activity'],
  member_removed: ['members', 'activity'],
  member_role_changed: ['members', 'activity'],
  // Etiket.
  card_label_added: ['labels', 'activity'],
  card_label_removed: ['labels', 'activity'],
  // Checklist.
  checklist_created: ['checklist', 'activity'],
  checklist_item_added: ['checklist', 'activity'],
  checklist_item_removed: ['checklist', 'activity'],
  checklist_item_completed: ['checklist', 'activity'],
  // Kart alanları (card.get).
  card_renamed: ['card', 'activity'],
  card_description_changed: ['card', 'activity'],
  card_cover_changed: ['card', 'activity'],
  card_due_changed: ['card', 'activity'],
  card_completed: ['card', 'activity'],
  card_archived: ['card', 'activity'],
  card_moved: ['card', 'activity'],
  due_approaching: ['card', 'activity'],
  due_overdue: ['card', 'activity'],
  // Ek — kart detayında ayrı sorgu yok; aktivite üzerinden görünür.
  attachment_added: ['activity'],
  attachment_removed: ['activity'],
};

/**
 * Push `data` payload'ından tazelenecek board/kart kapsamını çıkarır.
 *
 * Worker push bildirimine `data: { type, activityType?, cardId?, boardId? }`
 * koyar. Bu fonksiyon yalnız `boardId`/`cardId` kimliklerini ayrıştırır — boş,
 * eksik veya geçersiz (string olmayan) değerler `null` döner. Çağıran, dönen
 * kimliklere göre ilgili tRPC sorgularını invalidate eder; kimlik `null` ise o
 * kapsam atlanır.
 */
export function notificationRefreshScope(
  payload: unknown,
): { boardId: string | null; cardId: string | null } {
  const raw = asRecord(payload);
  return {
    boardId: stringValue(raw.boardId),
    cardId: stringValue(raw.cardId),
  };
}

/**
 * Push `data` payload'ının bildirim tipinden açık kart detayının hangi alt
 * sorgularının tazeleneceğini çıkarır.
 *
 * Bilinen bir tip eşleşirse yalnız o tiple ilgili sorgular döner; tip eksik,
 * boş ya da eşleme tablosunda yoksa GÜVENLİ tam fallback (`ALL_CARD_TARGETS`)
 * döner — eski "hepsini invalidate" davranışı korunur, böylece beklenmeyen /
 * yeni bir tip sessizce bayat veri bırakmaz.
 */
export function cardRefreshTargets(payload: unknown): readonly CardRefreshTarget[] {
  const type = stringValue(asRecord(payload).type);
  if (type === null) return ALL_CARD_TARGETS;
  return TYPE_TO_CARD_TARGETS[type as NotificationType] ?? ALL_CARD_TARGETS;
}
