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
};

/** Expo Router hedefi — `notificationTarget` üç mobil rotadan birini döndürür. */
export type NotificationTarget =
  | { pathname: '/cards/[cardId]'; params: { cardId: string; title: string } }
  | { pathname: '/boards/[boardId]'; params: { boardId: string; title: string } }
  | { pathname: '/workspaces/[id]'; params: { id: string; name: string } };

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
 * Bir bildirim satırını açılacak mobil rotaya çevirir.
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
 * Hedef türetilemezse `null` döner (çağıran navigasyon yapmaz — örn. ileride
 * eklenebilecek hesap-seviyesi sistem bildirimleri).
 */
export function notificationTarget(
  notification: NotificationTargetInput,
): NotificationTarget | null {
  const raw = asRecord(notification.payload);
  const workspaceId = notification.workspaceId ?? stringValue(raw.workspaceId);
  const boardId = notification.boardId ?? stringValue(raw.boardId);
  const cardId = notification.cardId ?? stringValue(raw.cardId);
  const cardTitle = stringValue(raw.cardTitle) ?? '';
  const boardTitle = stringValue(raw.boardName) ?? stringValue(raw.boardTitle) ?? '';
  const workspaceName = stringValue(raw.workspaceName) ?? '';

  if (cardId && boardId) {
    return { pathname: '/cards/[cardId]', params: { cardId, title: cardTitle } };
  }
  if (boardId) {
    return { pathname: '/boards/[boardId]', params: { boardId, title: boardTitle } };
  }
  if (workspaceId) {
    return { pathname: '/workspaces/[id]', params: { id: workspaceId, name: workspaceName } };
  }
  return null;
}
