import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Board görünüm modu tercihi (DEM-233). `kanban` mevcut yatay kolon görünümü,
 * `list` listelere göre gruplu dikey görünüm. Saf get/set helper —
 * `theme-preference.ts` deseni; `AsyncStorage` ile cihaz-yerel saklanır
 * (sunucu-tarafı kolon yok). Tercih **global**: tek değer tüm board'lar için
 * geçerli (anahtar board'a bağlı değil — kullanıcı kararı 2026-05-19). Birim
 * test edilir.
 */
export type BoardViewMode = 'kanban' | 'list';

/** Tercih okunamaz/bozuksa düşülen varsayılan — mevcut kanban kolon görünümü. */
export const DEFAULT_BOARD_VIEW_MODE: BoardViewMode = 'kanban';

const STORAGE_KEY = 'pusula:board-view-mode';
const VALID: readonly BoardViewMode[] = ['kanban', 'list'];

/** Verilen değer geçerli bir görünüm modu mu (depodan okunan ham değeri daraltır). */
export function isBoardViewMode(value: unknown): value is BoardViewMode {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

/** Saklanan tercihi yükler; yoksa/bozuksa/hata olursa `kanban` döner. */
export async function loadBoardViewMode(): Promise<BoardViewMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isBoardViewMode(raw) ? raw : DEFAULT_BOARD_VIEW_MODE;
  } catch {
    return DEFAULT_BOARD_VIEW_MODE;
  }
}

/** Tercihi saklar — best-effort; hata oturum içi tercihi etkilemez. */
export async function saveBoardViewMode(mode: BoardViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Yoksay — tercih bu oturumda geçerli kalır, sonraki açılışta varsayılana döner.
  }
}
