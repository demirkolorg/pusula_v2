import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Kart kapak görseli görünüm modu tercihi (mobil — web kart modalı çift-tık
 * paritesi). `fit` görseli sığdırır (web `object-contain` karşılığı; kapaktaki
 * kenar boşlukları aynı görselin blur'lu kopyasıyla dolar), `banner` alanı
 * doldurur (`cover`, kenarlar kırpılır). Saf get/set helper —
 * `board-view-preference.ts` deseni; `AsyncStorage` ile cihaz-yerel saklanır
 * (sunucu-tarafı kolon yok, web `localStorage` ile senkron beklenmez).
 *
 * Tercih **kart bazlı**: anahtar kart id'si içerir (web
 * `sancak:card-cover-view:{cardId}` paritesi; mobil prefix `pusula:`). Telefon
 * ve tablet **ortak** — cihaz sınıfı anahtara girmez (kullanıcı kararı
 * 2026-06-21). Birim test edilir.
 */
export type CardCoverView = 'fit' | 'banner';

/** Tercih okunamaz/bozuk/yoksa düşülen varsayılan — web ile aynı (`fit`). */
export const DEFAULT_CARD_COVER_VIEW: CardCoverView = 'fit';

const STORAGE_KEY_PREFIX = 'pusula:card-cover-view';
const VALID: readonly CardCoverView[] = ['fit', 'banner'];

/** Kart bazlı saklama anahtarı — `pusula:card-cover-view:{cardId}`. */
function storageKey(cardId: string): string {
  return `${STORAGE_KEY_PREFIX}:${cardId}`;
}

/** Verilen değer geçerli bir görünüm modu mu (depodan okunan ham değeri daraltır). */
export function isCardCoverView(value: unknown): value is CardCoverView {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

/** Kartın saklanan tercihini yükler; yoksa/bozuksa/hata olursa `fit` döner. */
export async function loadCardCoverView(cardId: string): Promise<CardCoverView> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(cardId));
    return isCardCoverView(raw) ? raw : DEFAULT_CARD_COVER_VIEW;
  } catch {
    return DEFAULT_CARD_COVER_VIEW;
  }
}

/** Kartın tercihini saklar — best-effort; hata oturum içi tercihi etkilemez. */
export async function saveCardCoverView(cardId: string, mode: CardCoverView): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(cardId), mode);
  } catch {
    // Yoksay — tercih bu oturumda geçerli kalır, sonraki açılışta varsayılana döner.
  }
}
