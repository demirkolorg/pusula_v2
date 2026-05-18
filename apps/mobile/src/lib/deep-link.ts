/**
 * Universal/şema link → mobil navigasyon eşlemesi (Faz 7L).
 *
 * Bir gelen URL'yi (`https://pusulaportal.com/...` universal link **veya**
 * `pusula://...` özel şema) Expo Router hedefine çevirir. Web rota desenleri
 * mobil Expo Router rota ağacıyla **eşleşmediği** için bu helper aradaki çeviriyi
 * yapar — `expo-linking` ham URL'yi yakalar, burada deterministik hedefe döner.
 *
 * Eşleme:
 *  - `/workspaces/{id}/boards/{boardId}?card={cardId}` → kart detayı
 *  - `/workspaces/{id}/boards/{boardId}`               → board ekranı
 *  - `/workspaces/{id}`                                → workspace ekranı
 *  - eşleşmeyen yol / geçersiz URL                     → `null`
 *
 * Hedef tipi `notification-target.ts`'in `NotificationTarget`'ı ile aynı (üç
 * rota union); tek bir kaynaktan yeniden kullanılır.
 *
 * Saf modül — RN/Expo importu yok; `deep-link.test.ts` ile birim test edilir.
 */
import type { NotificationTarget } from '@/lib/notification-target';

/** `deepLinkTarget` çıktısı — Expo Router hedefi (üç mobil rota). */
export type DeepLinkTarget = NotificationTarget;

/** Boş olmayan, kırpılmış bir string segment ise onu döndürür; aksi halde `null`. */
function segmentValue(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = decodeSafe(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `decodeURIComponent`'i güvenli sarar — bozuk %-kaçışı orijinali döndürür. */
function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Bir gelen URL'yi açılacak mobil rotaya çevirir.
 *
 * URL parse'ı dayanıklı: geçersiz/boş URL veya beklenmeyen yol → `null`
 * (çağıran navigasyon yapmaz; uygulama yalnız açılır). İstisna fırlatmaz.
 *
 * Hem `https://pusulaportal.com/...` hem `pusula://...` kabul edilir; yol
 * segmentleri (`workspaces`/`boards`) iki şemada da aynı sırayla beklenir.
 */
export function deepLinkTarget(url: string | null | undefined): DeepLinkTarget | null {
  if (typeof url !== 'string' || url.trim().length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  // Yol segmentleri. `https://...` URL'lerinde ilk segment `pathname`'dedir;
  // özel şema (`pusula://workspaces/...`) için WHATWG parser `workspaces`'i
  // `hostname` sayar — o yüzden http(s) dışı şemada `hostname`'i de segment
  // listesine kat. Baş/son boş parçalar elenir (`/a/b/` → ['a','b']).
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const rawPath = isHttp ? parsed.pathname : `${parsed.hostname}/${parsed.pathname}`;
  const segments = rawPath.split('/').filter((part) => part.length > 0);
  if (segments.length === 0 || segments[0] !== 'workspaces') return null;

  const workspaceId = segmentValue(segments[1]);
  if (!workspaceId) return null;

  // `/workspaces/{id}` → workspace ekranı.
  if (segments.length === 2) {
    return { pathname: '/workspaces/[id]', params: { id: workspaceId, name: '' } };
  }

  // `/workspaces/{id}/boards/{boardId}` → board ya da kart ekranı.
  if (segments.length === 4 && segments[2] === 'boards') {
    const boardId = segmentValue(segments[3]);
    if (!boardId) return null;

    const cardId = segmentValue(parsed.searchParams.get('card') ?? undefined);
    if (cardId) {
      return { pathname: '/cards/[cardId]', params: { cardId, title: '' } };
    }
    return { pathname: '/boards/[boardId]', params: { boardId, title: '' } };
  }

  return null;
}
