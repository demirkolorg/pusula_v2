/**
 * Ağ durumu — saf türetme (Faz 7M).
 *
 * `expo-network` `NetworkState`'ini "çevrimdışı mı?" boole'una indirger.
 * RN/Expo importu yok — `network-status.test.ts` ile birim test edilir;
 * `expo-network` çağrısı `use-network-status.ts` hook'unda + `online-manager.ts`
 * event listener'ında kalır.
 *
 * 7.0 kararı: mobilde realtime = pull-to-refresh + push (Socket.IO yok),
 * offline = cache persistence / okuma offline (mutation kuyruğu yok). Bu modül
 * "bağlantı yok" banner'ı (`ConnectionBanner`) ve TanStack Query `onlineManager`
 * köprüsünü besler.
 */

/** `expo-network` `NetworkState`'in türetme için gereken alt kümesi. */
export type NetworkSnapshot = {
  /** Bir ağa (Wi-Fi/hücresel) bağlı mı. İlk render'da `undefined` olabilir. */
  isConnected?: boolean | null;
  /** İnternet gerçekten erişilebilir mi. Çoğu durumda `undefined`/`null`. */
  isInternetReachable?: boolean | null;
};

/**
 * Verilen ağ anlık görüntüsü çevrimdışı mı.
 *
 * Yalnız **kesin** `false` çevrimdışı sayılır — `undefined`/`null` (durum henüz
 * bilinmiyor) çevrimiçi varsayılır; böylece ilk render'da banner "yanıp sönmez".
 * Wi-Fi'ye bağlı ama internet erişilemiyorsa (`isInternetReachable === false`)
 * de çevrimdışı sayılır.
 */
export function isOfflineState(state: NetworkSnapshot): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/** `isOfflineState`'in tersi — `onlineManager` event listener'ı için. */
export function isOnlineState(state: NetworkSnapshot): boolean {
  return !isOfflineState(state);
}
