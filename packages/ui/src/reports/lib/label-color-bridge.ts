/**
 * Faz 13F — Label color bridge (DEM-262 code-review C1 fix).
 *
 * `@pusula/domain` `LABEL_COLORS` Turkish-named değil, English (`green`,
 * `red`, ...); `theme.css` `--palet-*` token'ları Turkish (`yesil`,
 * `kirmizi`, ...). `LabelDistribution` micro-report'unda DB'den gelen
 * adapter row'unun `color` alanı English token; recharts'a vermek için
 * Turkish palette name'e çevirmek gerek.
 *
 * `apps/web/.../label-colors.ts` aynı bridge'i karton tarafında tutuyor;
 * rapor UI'sı kendi shim'iyle decoupled kalıyor (paket bağımsızlığı).
 * 13L sonrası ortak `@pusula/ui/lib/label-palette` taşıma fırsatı var.
 */
import type { LabelColor } from '@pusula/domain';
import type { PaletteName } from '../../components/avatar';

const LABEL_COLOR_TO_PALETTE: Record<LabelColor, PaletteName> = {
  green: 'yesil',
  yellow: 'sari',
  orange: 'turuncu',
  red: 'kirmizi',
  purple: 'mor',
  blue: 'mavi',
  sky: 'sky',
  lime: 'lime',
  pink: 'pembe',
  black: 'siyah',
};

/**
 * English label color → CSS var (`--palet-<turkish>`). Bilinmeyen
 * değerlerde `--muted-foreground` fallback (orphan color drift'lerden
 * koruma).
 */
export function labelColorVar(color: string): string {
  const palette = (LABEL_COLOR_TO_PALETTE as Record<string, PaletteName | undefined>)[color];
  return palette ? `var(--palet-${palette})` : 'var(--muted-foreground)';
}
