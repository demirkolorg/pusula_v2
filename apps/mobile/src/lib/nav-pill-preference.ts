import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Floating pill bottom nav'ın yatay konum tercihi (DEM-303 V2 kalıcılığı,
 * 2026-06-19). Pill sol/orta/sağ üç sabit konuma sürüklenebilir; bırakılan konum
 * cihaz-yerel saklanır ki sonraki açılışta aynı yerde gelsin ("en son ne şekilde
 * bıraktıysam o gelsin"). `board-view-preference.ts` deseni. Global tercih.
 */
export type NavPillPosition = 'left' | 'center' | 'right';

/** Tercih okunamaz/bozuksa düşülen varsayılan — ekran ortası (eski sabit konum). */
export const DEFAULT_NAV_PILL_POSITION: NavPillPosition = 'center';

const STORAGE_KEY = 'pusula:nav-pill-position';
const VALID: readonly NavPillPosition[] = ['left', 'center', 'right'];

/** Verilen değer geçerli bir konum mu (depodan okunan ham değeri daraltır). */
export function isNavPillPosition(value: unknown): value is NavPillPosition {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

/** Saklanan konumu yükler; yoksa/bozuksa/hata olursa `center` döner. */
export async function loadNavPillPosition(): Promise<NavPillPosition> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isNavPillPosition(raw) ? raw : DEFAULT_NAV_PILL_POSITION;
  } catch {
    return DEFAULT_NAV_PILL_POSITION;
  }
}

/** Konumu saklar — best-effort; hata oturum içi konumu etkilemez. */
export async function saveNavPillPosition(position: NavPillPosition): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, position);
  } catch {
    // Yoksay — konum bu oturumda geçerli kalır, sonraki açılışta varsayılana döner.
  }
}
