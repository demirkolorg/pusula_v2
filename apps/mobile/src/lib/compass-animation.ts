import compassSpinner from '@/assets/compass-spinner.json';

/** `compass-spinner.json` Lottie modülünün şekli. */
export type CompassAnimation = typeof compassSpinner;

/** Lottie dolgu rengi — RGB bileşenleri 0–1 aralığında normalize. */
type LottieRgb = [number, number, number];

/** `#rrggbb` / `#rgb` (ya da `#`'siz) → Lottie `[r, g, b]` (0–1). */
export function hexToLottieRgb(hex: string): LottieRgb {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) {
    throw new Error(`Geçersiz hex renk: ${hex}`);
  }
  return [((int >> 16) & 0xff) / 255, ((int >> 8) & 0xff) / 255, (int & 0xff) / 255];
}

/**
 * Compass spinner Lottie'sini verilen renge boyar.
 *
 * Kaynak animasyon tek renkli (siyah dolgu). Tüm `fl` (fill) shape'lerinin
 * dolgu rengi `color` ile değiştirilip yeni bir `animationData` döndürülür —
 * web Lottie dolgusu siyah sabitken mobil açık/koyu tema ve koyu overlay'de
 * de görünür kalsın diye renk runtime'da uygulanır. Kaynak modül nesnesi
 * mutasyona uğramaz (derin kopya üzerinde çalışılır).
 */
export function tintCompassAnimation(color: string): CompassAnimation {
  const rgb = hexToLottieRgb(color);
  const clone = JSON.parse(JSON.stringify(compassSpinner)) as CompassAnimation;
  paintFills(clone, rgb);
  return clone;
}

/** Lottie ağacındaki tüm `fl` shape'lerinin dolgu rengini değiştirir. */
function paintFills(node: unknown, rgb: LottieRgb): void {
  if (Array.isArray(node)) {
    for (const child of node) paintFills(child, rgb);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.ty === 'fl') {
    const fill = record.c as { k?: unknown } | undefined;
    if (fill && typeof fill === 'object') fill.k = [...rgb];
  }
  for (const value of Object.values(record)) paintFills(value, rgb);
}
