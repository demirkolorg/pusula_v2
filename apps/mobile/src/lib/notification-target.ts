/**
 * Bildirim satırı → mobil navigasyon eşlemesi (Faz 7K).
 *
 * `notifications.list` çıktısı bir bildirimi `payload` (JSON) + üst-seviye
 * `workspaceId`/`boardId`/`cardId` alanlarıyla taşır. Worker payload'a web
 * rota deseninde bir `linkTo` (`/workspaces/.../boards/...`) de koyar — mobil
 * Expo Router rotaları farklı olduğundan o alan mobilde **kullanılmaz**. Hedef
 * bunun yerine kart/board/workspace kimliklerinden deterministik türetilir
 * (web `notification-link.ts`'in mobil karşılığı).
 *
 * Saf modül — RN/Expo importu yok; `notification-target.test.ts` ile birim
 * test edilir.
 */

/**
 * `notificationTarget` girişi — bir bildirim satırının navigasyon için
 * gereken alt kümesi. `payload` ham JSON (worker'ın yazdığı nesne); üst-seviye
 * id'ler boş gelirse payload'taki karşılıkları yedek olarak okunur.
 */
export type NotificationTargetInput = {
  workspaceId: string | null;
  boardId: string | null;
  cardId: string | null;
  payload: unknown;
  /**
   * Bildirim satırının kendi kimliği (Faz 6 — bildirim detay ekranı). Set ise
   * `notificationTarget` (liste/push tıklamasının hedefi) **detay ekranını**
   * (`/notifications/[id]`) açar; kart hedefi yalnızca "Karta git" butonunda
   * (`notificationCardTarget`) kullanılır. In-app liste verisinde her zaman
   * vardır; push `data.notificationId` taşıyorsa cold/warm dokunmada da gelir.
   */
  notificationId?: string | null;
};

/** Expo Router hedefi — `notificationTarget` dört mobil rotadan birini döndürür.
 *  Saved-report varyantı Faz 13S (DEM-275) ile eklendi — scheduled rapor
 *  hazır push'una dokunma `/saved-reports/[id]` ekranını açar.
 *
 *  Kart hedefi opsiyonel `checklistItemId` taşır: bir kontrol listesi maddesi
 *  yorum bildirimi push'unda payload `checklistItemId` taşıyorsa kart açılıp o
 *  maddenin yorum thread'i (bottom sheet) otomatik açılır. Worker push `data`'sı
 *  bu alanı henüz yazmıyorsa undefined kalır (yalnız karta gidilir) — ileriye
 *  dönük, mobil-tarafı eklenti (yeni bağımlılık yok). */
export type NotificationTarget =
  | {
      /** Bildirim detay / audit ekranı (Faz 5+6) — liste/push tıklamasının asıl hedefi. */
      pathname: '/notifications/[id]';
      params: { id: string };
    }
  | {
      pathname: '/cards/[cardId]';
      params: {
        cardId: string;
        title: string;
        /** Checklist madde yorum thread'ini otomatik aç. */
        checklistItemId?: string;
        /** Checklist maddesi scroll + vurgu (thread açmaz — toggle/add bildirimleri). */
        highlightItemId?: string;
        /** Yorum bölümüne scroll + vurgu. */
        commentId?: string;
        /** Ekler bölümüne scroll + vurgu. */
        attachmentId?: string;
      };
    }
  | { pathname: '/boards/[boardId]'; params: { boardId: string; title: string } }
  | { pathname: '/workspaces/[id]'; params: { id: string; name: string } }
  | {
      pathname: '/saved-reports/[id]';
      params: { id: string; workspaceId: string; title: string };
    };

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
 * Bir bildirim satırının **birincil** navigasyon hedefi (Faz 5+6 — bildirim
 * detay ekranı). Liste satırına dokunma ve push'a dokunma bunu kullanır.
 *
 * `notificationId` set ise (in-app liste verisinde her zaman, push
 * `data.notificationId` taşıyorsa dokunmada da) **detay ekranını**
 * (`/notifications/[id]`) açar — kart/board/workspace hedefi yalnızca detay
 * ekranındaki "Karta git" butonunda (`notificationCardTarget`) kullanılır.
 *
 * `notificationId` yoksa (ör. eski push payload'ları, kimliksiz tetikleyici)
 * geriye dönük uyumluluk için doğrudan kart hedefine (`notificationCardTarget`)
 * düşer — kullanıcı yine de bir yere gidebilir.
 */
export function notificationTarget(
  notification: NotificationTargetInput,
): NotificationTarget | null {
  const notificationId = stringValue(notification.notificationId);
  if (notificationId) {
    return { pathname: '/notifications/[id]', params: { id: notificationId } };
  }
  return notificationCardTarget(notification);
}

/**
 * Bir bildirimi **kart/board/workspace** hedefine çevirir (detay ekranının
 * "Karta git" butonu). Eski `notificationTarget` davranışıdır — detay ekranı
 * ayrımından önce liste/push tıklamasının hedefiydi.
 *
 * Öncelik sırası (web `notification-link.ts` ile aynı daralma mantığı):
 *  - `cardId` + `boardId` → kart detayı.
 *  - `boardId` (kartsız) → board ekranı.
 *  - `workspaceId` (boardsuz) → workspace ekranı.
 *
 * Üst-seviye id boşsa payload'taki karşılığı (`cardId`/`boardId`/`workspaceId`)
 * yedek olarak kullanılır. Başlık metinleri payload'tan okunur; yoksa boş
 * string (ekranların `fallbackTitle`'ı devreye girer).
 *
 * Hedef türetilemezse `null` döner — detay ekranında "Karta git" butonu gizli
 * kalır (örn. hesap-seviyesi sistem bildirimleri).
 */
export function notificationCardTarget(
  notification: NotificationTargetInput,
): NotificationTarget | null {
  const raw = asRecord(notification.payload);
  const workspaceId = notification.workspaceId ?? stringValue(raw.workspaceId);
  const boardId = notification.boardId ?? stringValue(raw.boardId);
  const cardId = notification.cardId ?? stringValue(raw.cardId);
  const savedReportId = stringValue(raw.savedReportId);
  const cardTitle = stringValue(raw.cardTitle) ?? '';
  const boardTitle = stringValue(raw.boardName) ?? stringValue(raw.boardTitle) ?? '';
  const workspaceName = stringValue(raw.workspaceName) ?? '';
  const reportTitle = stringValue(raw.reportTitle) ?? '';
  // Spesifik öğe odak parametreleri — bildirim tipine göre biri set olur.
  const checklistItemId = stringValue(raw.checklistItemId);
  const highlightItemId = stringValue(raw.itemId);
  const commentId = stringValue(raw.commentId);
  const attachmentId = stringValue(raw.attachmentId);

  if (cardId && boardId) {
    return {
      pathname: '/cards/[cardId]',
      params: {
        cardId,
        title: cardTitle,
        ...(checklistItemId ? { checklistItemId } : {}),
        ...(highlightItemId ? { highlightItemId } : {}),
        ...(commentId ? { commentId } : {}),
        ...(attachmentId ? { attachmentId } : {}),
      },
    };
  }
  if (boardId) {
    return { pathname: '/boards/[boardId]', params: { boardId, title: boardTitle } };
  }
  // Faz 13S (DEM-275) — saved-report varyantı. `report_scheduled_ready` tipi
  // payload'da `savedReportId` + `workspaceId` taşır; ikisi de set ise rapor
  // detayı ekranına git. Tek başına `savedReportId` (workspaceId yoksa) →
  // workspace ekranı yolu yok, target = null (kullanıcı uygulamada bir şey
  // yapamaz — bu durum production'da olmaz, defansif).
  if (savedReportId && workspaceId) {
    return {
      pathname: '/saved-reports/[id]',
      params: { id: savedReportId, workspaceId, title: reportTitle },
    };
  }
  if (workspaceId) {
    return { pathname: '/workspaces/[id]', params: { id: workspaceId, name: workspaceName } };
  }
  return null;
}
