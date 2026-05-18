import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { isOnlineState } from './network-status';

/**
 * TanStack Query `onlineManager`'ını `expo-network`'e bağlar (Faz 7M).
 *
 * Varsayılan `onlineManager` `navigator.onLine`'a dayanır — React Native'de
 * böyle bir API yok, bu yüzden Query her zaman "çevrimiçi" sanır ve çevrimdışı
 * sorgular boşuna retry'lar. Bu wiring ile:
 *
 * - Çevrimdışıyken sorgular **pause** edilir (cache persistence — 7.0 "okuma
 *   offline" kararı — sayesinde son görülen board/kart yine görünür).
 * - Bağlantı dönünce sorgular otomatik resume + refetch olur (pull-to-refresh
 *   beklemeden tazelenir).
 *
 * Uygulama açılışında bir kez çağrılır (`app/_layout.tsx`).
 */
export function configureOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => {
    // `active`: listener yeniden kurulursa (Fast Refresh) eski callback'in
    // uçuştaki `getNetworkStateAsync` promise'i geç çözülüp eski/geçersiz
    // setter'a yazmasın — cleanup'ta `false`'a çekilir.
    let active = true;
    // Başlangıç durumu — listener yalnız ağ *değişiminde* tetiklenir.
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) setOnline(isOnlineState(state));
      })
      .catch(() => {
        if (active) setOnline(true); // Durum okunamazsa çevrimiçi varsay.
      });
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isOnlineState(state));
    });
    return () => {
      active = false;
      subscription.remove();
    };
  });
}
