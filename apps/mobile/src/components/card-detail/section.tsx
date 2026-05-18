import type { ReactNode } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { themeFor } from '@/theme/tokens';

type DetailSectionProps = {
  icon: IconName;
  title: string;
  /** Başlığın sağındaki özet rozeti — ilerleme (2/4) / adet. */
  trailing?: ReactNode;
  children: ReactNode;
};

/**
 * Kart detay ekranında bir bölümü saran kart yüzeyi (DEM-204). `bg-muted` sayfa
 * zemini üzerinde `bg-card` yuvarlatılmış kapsayıcı — her bölüm görsel olarak
 * ayrışır. Başlık satırı: ikon + başlık + sağda opsiyonel özet rozeti.
 */
export function DetailSection({ icon, title, trailing, children }: DetailSectionProps) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={15} color={theme.mutedForeground} />
        <Text weight="semibold" className="flex-1 text-xs uppercase text-muted-foreground">
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

/** Bölüm başlığı sağındaki özet rozeti — adet / ilerleme (örn. "2/4"). */
export function SectionBadge({ label }: { label: string | number }) {
  return (
    <View className="rounded-full bg-muted px-2 py-0.5">
      <Text weight="medium" className="text-xs text-muted-foreground">
        {String(label)}
      </Text>
    </View>
  );
}

/**
 * Bölüm içi "+ ekle" tetikleyicisi (DEM-204) — kapalı bir satır-içi composer'ı
 * açar; boş giriş kutusu + pasif buton ekranı doldurmaz. `attachments-section`
 * "Ek ekle" tetikleyicisiyle aynı görsel desen.
 */
export function SectionAddTrigger({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = themeFor(useColorScheme());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center gap-1.5 self-start ${
        disabled ? 'opacity-50' : 'active:opacity-70'
      }`}
    >
      <Icon name="plus" size={14} color={theme.primary} />
      <Text weight="medium" className="text-sm text-primary">
        {label}
      </Text>
    </Pressable>
  );
}
