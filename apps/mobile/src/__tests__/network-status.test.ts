import { describe, expect, it } from 'vitest';
import { isOfflineState, isOnlineState, type NetworkSnapshot } from '../lib/network-status';

/**
 * Faz 7M — ağ durumu saf türetme birim testleri.
 *
 * `isOfflineState`/`isOnlineState`, `expo-network` `NetworkState`'ini
 * çevrimdışı/çevrimiçi boole'una indirger; "bağlantı yok" banner'ı
 * (`ConnectionBanner`) ve TanStack Query `onlineManager` köprüsünü besler.
 */
describe('isOfflineState', () => {
  it('isConnected kesin false ise çevrimdışı', () => {
    expect(isOfflineState({ isConnected: false })).toBe(true);
  });

  it('internet erişilemiyorsa (isInternetReachable false) çevrimdışı', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('ağa bağlı ve internet erişilebilir ise çevrimiçi', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('durum henüz bilinmiyorsa (undefined) çevrimiçi varsayar — banner yanıp sönmez', () => {
    expect(isOfflineState({})).toBe(false);
    expect(isOfflineState({ isConnected: undefined, isInternetReachable: undefined })).toBe(false);
  });

  it('null alanlar (durum bilinmiyor) çevrimdışı saymaz', () => {
    expect(isOfflineState({ isConnected: null, isInternetReachable: null })).toBe(false);
  });

  it('bağlı ama internet erişilebilirliği bilinmiyorsa çevrimiçi sayar', () => {
    expect(isOfflineState({ isConnected: true })).toBe(false);
  });
});

describe('isOnlineState', () => {
  it('isOfflineState tam tersini döndürür', () => {
    const cases: NetworkSnapshot[] = [
      { isConnected: false },
      { isConnected: true, isInternetReachable: false },
      { isConnected: true, isInternetReachable: true },
      {},
    ];
    for (const state of cases) {
      expect(isOnlineState(state)).toBe(!isOfflineState(state));
    }
  });
});
