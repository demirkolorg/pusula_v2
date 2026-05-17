/**
 * Etiket rengi eşlemesi. `@pusula/domain` `LABEL_COLORS` İngilizce anahtarlar
 * (`green` / `yellow` / …) taşır; bunları `13-ui-tasarim-dili.md` paletiyle
 * hizalı hex değerlere çevirir.
 */
const LABEL_COLOR_HEX: Record<string, string> = {
  green: '#4bce97',
  yellow: '#eed12b',
  orange: '#fca700',
  red: '#f87168',
  purple: '#c97cf4',
  blue: '#669df1',
  sky: '#6cc3e0',
  lime: '#94c748',
  pink: '#e774bb',
  black: '#42526e',
};

/** Bilinmeyen anahtar için nötr gri. */
const FALLBACK_HEX = '#8c8f97';

/** Etiket renk anahtarını hex değere çevirir; bilinmeyen anahtar → nötr gri. */
export function labelColorHex(color: string): string {
  return LABEL_COLOR_HEX[color] ?? FALLBACK_HEX;
}
