/**
 * Entity (workspace / board) avatarları için deterministik renk + baş harf.
 * Web'in palet-deterministik avatar mantığının mobil karşılığı — sade tutulur.
 */

/** Avatar arka plan paleti — hepsi beyaz metinle okunur kontrast taşır. */
const AVATAR_COLORS = ['#5b51d8', '#0c8ce9', '#1f845a', '#c2410c', '#9333ea', '#be123c'] as const;

/** Verilen tohumdan (ad/id) deterministik avatar arka plan rengi. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/** Avatar baş harfi (büyük); boş ad için `?`. */
export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?';
}
