/**
 * Kart kapak rengi paleti (DEM-201) — 12 `CARD_COVER_COLORS` adının hex
 * karşılığı. Web kart modalı kapak rengi picker'ının (`card.update({ coverColor })`)
 * mobil karşılığı bunu kullanır: meta çubuğu chip'i, kapak rengi sheet'i ve
 * board kart yüzü şeridi.
 *
 * `theme/tokens.ts` `paletteColors` **etiket** paletidir ve 11 renk taşır
 * (`siyah` yok) — `scaffold.test.ts` bu sayıyı doğrular. Kapak paleti 12 renk
 * ister; 12. renk `siyah` burada eklenir (web `--palet-siyah`
 * `oklch(0.28 0.01 250)` değerinin tema-bağımsız yaklaşık karşılığı).
 */
import { CARD_COVER_COLORS, type CardCoverColor } from '@pusula/domain';
import { paletteColors } from '@/theme/tokens';

/** `CardCoverColor` adı → hex. `CARD_COVER_COLORS`'ın 12 üyesini de kapsar. */
export const coverColorHex: Record<CardCoverColor, string> = {
  ...paletteColors,
  siyah: '#33363d',
};

/**
 * `card.get` / `board.get` `coverColor`'ı düz `text` (`string | null`) döner;
 * geçerli bir 12-renk palet adıysa `CardCoverColor`'a daraltır, değilse `null`
 * (web `card-item.tsx` `asCoverColor` simetrisi).
 */
export function asCoverColor(value: string | null | undefined): CardCoverColor | null {
  return value != null && (CARD_COVER_COLORS as readonly string[]).includes(value)
    ? (value as CardCoverColor)
    : null;
}
