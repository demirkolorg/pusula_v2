/**
 * Kart detayı "bildirim hedefine kaydır" saf karar mantığı (DEM — 2026-06-20).
 *
 * `scroll-highlight.tsx` provider'ı bunu kullanır; RN/Reanimated importu
 * içermez → node ortamında birim test edilebilir (`scroll-highlight-logic.test.ts`).
 */

/** Hedefi nav bar'ın hemen altına değil, üstte biraz boşlukla konumlandırma payı
 *  (px) — bölüm başlığı + nefes payı; hedef rahat okunur şekilde gelir. */
export const SCROLL_TOP_INSET = 72;

/**
 * Bir vurgu hedefi ölçüldüğünde scroll yapılıp yapılmayacağını ve nereye
 * kaydırılacağını karara bağlar.
 *
 * Kurallar:
 *  - Bildirilen `id` aktif `targetId` ile eşleşmeli (yanlış bileşen tetiklemesin).
 *  - Daha önce kaydırılmamış olmalı (`alreadyScrolled=false`) — tek seferlik guard.
 *  - Hedef y, üst inset kadar yukarı çekilir, 0'ın altına inmez (clamp).
 *  - `reduceMotion` true → `animated:false` (anında konumlanma; §20.11).
 *
 * @returns Kaydırma yapılacaksa `{ scrollY, animated }`; yoksa `null`.
 */
export function resolveHighlightScroll(args: {
  id: string;
  targetId: string | null;
  alreadyScrolled: boolean;
  y: number;
  reduceMotion: boolean;
  topInset?: number;
}): { scrollY: number; animated: boolean } | null {
  const { id, targetId, alreadyScrolled, y, reduceMotion } = args;
  if (targetId == null || id !== targetId) return null;
  if (alreadyScrolled) return null;
  const inset = args.topInset ?? SCROLL_TOP_INSET;
  return { scrollY: Math.max(y - inset, 0), animated: !reduceMotion };
}
