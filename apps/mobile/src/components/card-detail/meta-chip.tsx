import type { ReactNode } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { themeFor } from '@/theme/tokens';

type CardMetaChipProps = {
  icon: IconName;
  /** Kompakt özet metni — değer ya da boş durumda placeholder. */
  label: string;
  /** İkon ile metin arasında görsel öğe — üye avatar yığını / etiket renk noktaları. */
  accessory?: ReactNode;
  /** Verilmezse chip dokunulamaz (yalnız gösterim — örn. viewer için liste chip'i). */
  onPress?: () => void;
  /** Vurgulu durumlar: `destructive` (gecikmiş — kırmızı), `warning` (yaklaşan — amber). */
  tone?: 'default' | 'destructive' | 'warning';
  /** `true` ise metin soluk — değer atanmamış (placeholder). */
  muted?: boolean;
  accessibilityLabel: string;
};

/**
 * Kart detay meta çubuğu chip'i (Faz 7G-2) — web `MetaChip`'in mobil karşılığı.
 * İkon + isteğe bağlı görsel öğe (avatar/nokta) + kompakt metin. Dokununca
 * ilgili bottom sheet açılır; `onPress` yoksa salt-gösterim (dokunulamaz).
 */
export function CardMetaChip({
  icon,
  label,
  accessory,
  onPress,
  tone = 'default',
  muted = false,
  accessibilityLabel,
}: CardMetaChipProps) {
  const theme = themeFor(useColorScheme());
  // Vurgu rengi (destructive/warning) ikon + metne inline uygulanır — sınıf
  // bağımlılığı olmadan (robust). Nötr tonlarda sınıf-tabanlı renk korunur.
  const accent = tone === 'destructive' ? theme.destructive : tone === 'warning' ? theme.warning : null;
  const iconColor = accent ?? theme.mutedForeground;
  const textClass = accent ? '' : muted ? 'text-muted-foreground' : 'text-foreground';

  const content = (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={14} color={iconColor} />
      {accessory}
      <Text
        weight="medium"
        numberOfLines={1}
        className={`max-w-44 text-sm ${textClass}`}
        style={accent ? { color: accent } : undefined}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View className="flex-row items-center rounded-lg border border-border bg-card px-2.5 py-1.5">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-row items-center rounded-lg border border-border bg-card px-2.5 py-1.5 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
