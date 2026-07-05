// Board kanban kolonlarının daralt/genişlet tercihini localStorage'de kalıcı
// tutar (list.id bazında). Salt client-side UI tercihi — server'a gitmez,
// domain kuralı / realtime / activity üretmez. Yalnız daraltılmış listeler
// saklanır; genişletilince anahtar silinir (orphan anahtar birikimini önler).
// font/theme provider'larla aynı try/catch + `typeof window` guard pattern'i.

const STORAGE_KEY_PREFIX = 'pusula-list-collapsed-';

const keyFor = (listId: string) => `${STORAGE_KEY_PREFIX}${listId}`;

/** Listenin daralt tercihini okur. SSR'da ve localStorage erişilemezse `false`. */
export function readListCollapsed(listId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(keyFor(listId)) === '1';
  } catch {
    return false;
  }
}

/** Daraltılmışsa anahtarı yazar, genişletilmişse siler (temiz tutar). */
export function writeListCollapsed(listId: string, collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (collapsed) window.localStorage.setItem(keyFor(listId), '1');
    else window.localStorage.removeItem(keyFor(listId));
  } catch {
    // localStorage hardened browser modlarında erişilemez olabilir; daraltma
    // yine de mevcut oturum için çalışır, sadece kalıcı olmaz.
  }
}
