import * as Network from 'expo-network';
import { isOfflineState } from './network-status';

/**
 * Cihazın ağ bağlantı durumunu izleyen hook (Faz 7M).
 *
 * `expo-network` `useNetworkState()`'i "çevrimdışı mı?" boole'una indirger;
 * çevrimdışı göstergesi (`ConnectionBanner`) bunu tüketir. Saf türetme
 * `network-status.ts`'tedir (birim test edilir) — bu hook yalnız `expo-network`
 * köprüsüdür.
 */
export function useNetworkStatus(): { isOffline: boolean } {
  const state = Network.useNetworkState();
  return { isOffline: isOfflineState(state) };
}
