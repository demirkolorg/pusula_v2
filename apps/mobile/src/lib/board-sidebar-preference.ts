import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Board sidebar (master-detail sol pane) daraltma tercihi — tablet board
 * ekranında sol liste-özeti panelinin açık/kapalı durumu. Tercih **global +
 * kalıcı**: anahtar board'a bağlı değil, her board ekranı aynı değeri okur
 * (kullanıcı kararı 2026-06-19 — "her panoyu açtığımda tekrar açık gelmesin, en
 * son ne şekilde bıraktıysam o gelsin"). `board-view-preference.ts` deseni;
 * `AsyncStorage` ile cihaz-yerel saklanır (sunucu-tarafı kolon yok).
 */
export const DEFAULT_SIDEBAR_COLLAPSED = false;

const STORAGE_KEY = 'pusula:board-sidebar-collapsed';

/** Saklanan tercihi yükler; yoksa/bozuksa/hata olursa `false` (panel açık) döner. */
export async function loadSidebarCollapsed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return DEFAULT_SIDEBAR_COLLAPSED;
  } catch {
    return DEFAULT_SIDEBAR_COLLAPSED;
  }
}

/** Tercihi saklar — best-effort; hata oturum içi tercihi etkilemez. */
export async function saveSidebarCollapsed(collapsed: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Yoksay — tercih bu oturumda geçerli kalır, sonraki açılışta varsayılana döner.
  }
}
