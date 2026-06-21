import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppSpinner } from '@/components/app-spinner';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';

type SettingsRowProps = {
  icon?: IconName;
  label: string;
  /** Sağda gösterilen değer metni (örn. sürüm numarası). */
  value?: string;
  onPress?: () => void;
  /** Yıkıcı eylem (örn. Çıkış) — etiket + ikon `destructive` renginde. */
  destructive?: boolean;
  /** Chevron / değer yerine özel sağ öğe (örn. seçili işareti). */
  trailing?: ReactNode;
  /** `onPress` varken sağdaki chevron'u gizler (örn. tema seçici satırları). */
  hideChevron?: boolean;
  /** İşlem uçuşta — sağda spinner gösterir, satır dokunulamaz. */
  pending?: boolean;
  /**
   * Bir seçim grubunun (örn. tema seçici) üyesiyse seçili olup olmadığı —
   * verilince satır `radio` rolü + `accessibilityState.selected` taşır.
   */
  selected?: boolean;
  /**
   * Görsel "aktif/seçili" vurgusu (kalıcı `bg-muted`) — tablet hesap master-detail
   * nav listesinde o an detail pane'de açık olan satırı işaretler (DEM-303 V2).
   * A11y'den bağımsız; telefon akışında kullanılmaz, davranışı değiştirmez.
   */
  active?: boolean;
};

/**
 * Hesap / ayar ekranında tek satır (DEM-208) — ikon + etiket + sağda değer /
 * chevron / özel öğe. `onPress` yoksa salt-gösterim. `SettingsGroup` içinde
 * kullanılır.
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive = false,
  trailing,
  hideChevron = false,
  pending = false,
  selected,
  active = false,
}: SettingsRowProps) {
  const theme = useTheme();
  const iconColor = destructive ? theme.destructive : theme.mutedForeground;
  const labelClass = destructive ? 'text-destructive' : 'text-foreground';
  const interactive = onPress != null && !pending;

  const content = (
    <View
      className={`flex-row items-center gap-3 px-4 py-3.5 ${active ? 'bg-muted' : ''}`}
    >
      {icon ? <Icon name={icon} size={18} color={iconColor} /> : null}
      <Text weight="medium" numberOfLines={1} className={`flex-1 text-sm ${labelClass}`}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} className="max-w-40 text-sm text-muted-foreground">
          {value}
        </Text>
      ) : null}
      {pending ? <AppSpinner size="sm" color={theme.mutedForeground} /> : trailing}
      {!pending && trailing == null && interactive && !hideChevron ? (
        <Icon name="chevron-right" size={18} color={theme.mutedForeground} />
      ) : null}
    </View>
  );

  if (!interactive) {
    return content;
  }
  return (
    <Pressable
      accessibilityRole={selected == null ? 'button' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={selected == null ? undefined : { selected }}
      onPress={onPress}
      className="active:bg-muted"
    >
      {content}
    </Pressable>
  );
}
