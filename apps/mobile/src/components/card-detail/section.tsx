import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/theme/theme-provider';

type DetailSectionProps = {
  icon: IconName;
  title: string;
  /** Başlığın sağındaki özet rozeti — ilerleme (2/4) / adet. */
  trailing?: ReactNode;
  /**
   * Başlığa dokununca içerik açılıp katlanır (DEM-249). `false` (default) ise
   * bölüm her zaman açık — eski davranış. Rozet (`trailing`) katlı durumda da
   * görünür; kullanıcı açmadan kaç eleman olduğunu görür.
   */
  collapsible?: boolean;
  /** `collapsible` iken ilk render katlı mı (default `false` = açık). */
  defaultCollapsed?: boolean;
  /**
   * `true` iken bölüm `defaultCollapsed` değerinden bağımsız açık başlar.
   * Bildirim deep-link'iyle hedeflenen bölümü otomatik açmak için kullanılır.
   */
  forceExpand?: boolean;
  children: ReactNode;
};

/**
 * Kart detay ekranında bir bölümü saran kart yüzeyi (DEM-204). `bg-muted` sayfa
 * zemini üzerinde `bg-card` yuvarlatılmış kapsayıcı — her bölüm görsel olarak
 * ayrışır. Başlık satırı: ikon + başlık + sağda opsiyonel özet rozeti.
 *
 * DEM-249 — `collapsible` ile bölüm katlanabilir: başlık dokunulabilir olur,
 * sağda dönen bir chevron belirir, içerik koşullu render edilir (katlıyken
 * mount edilmez — alttaki ağır listeler boşuna çizilmez). Animasyon
 * `useReducedMotion` ile anlık geçişe iner (ilke 9).
 */
export function DetailSection({
  icon,
  title,
  trailing,
  collapsible = false,
  defaultCollapsed = false,
  forceExpand = false,
  children,
}: DetailSectionProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const initialCollapsed = collapsible && !forceExpand && defaultCollapsed;
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // chevron dönüşü: katlı = 0 (aşağı bakar), açık = 1 (180° → yukarı bakar).
  const open = useSharedValue(initialCollapsed ? 0 : 1);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${open.value * 180}deg` }],
  }));

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      const target = next ? 0 : 1;
      open.value = reduceMotion ? target : withTiming(target, { duration: 180 });
      return next;
    });
  }

  const headerRow = (
    <View className="flex-row items-center gap-2">
      <Icon name={icon} size={15} color={theme.mutedForeground} />
      <Text weight="semibold" className="flex-1 text-xs uppercase text-muted-foreground">
        {title}
      </Text>
      {trailing}
      {collapsible ? (
        <Animated.View style={chevronStyle}>
          <Icon name="chevron-down" size={18} color={theme.mutedForeground} />
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={title}
          onPress={toggle}
          hitSlop={8}
          className="active:opacity-70"
        >
          {headerRow}
        </Pressable>
      ) : (
        headerRow
      )}
      {collapsible && collapsed ? null : (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(160)}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Bölüm başlığı satırı (2026-06-20) — `DetailSection`'ın başlık satırıyla aynı
 * görsel dil (ikon + küçük uppercase başlık), ama kendi kart yüzeyini sarmaz ve
 * katlanma yönetmez. Sağ tarafta serbest aksiyon yuvası (`actions`) taşır —
 * Açıklama bölümünde "Düzenle" + "Daha fazla göster", kontrol listelerinde
 * "+ Ekle" gibi. İç durumu (editing/expanded) bileşenlerin kendisinde kaldığından
 * her bölüm bu başlığı kendi içinde render eder (state lift gerekmez).
 */
export function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: IconName;
  title: string;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View className="min-h-9 flex-row items-center gap-2">
      <Icon name={icon} size={15} color={theme.mutedForeground} />
      <Text weight="semibold" className="flex-1 text-xs uppercase text-muted-foreground">
        {title}
      </Text>
      {actions}
    </View>
  );
}

/**
 * `SectionHeader` sağındaki kompakt aksiyon — küçük ikon + primary etiket
 * (Açıklama "Düzenle"/"Daha fazla göster" satır-içi linkleriyle aynı boyut).
 * Dokunma hedefi `hitSlop` ile genişletilir.
 */
export function SectionHeaderAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      className={`flex-row items-center gap-1 ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
    >
      <Icon name={icon} size={13} color={theme.primary} />
      <Text weight="medium" className="text-xs text-primary">
        {label}
      </Text>
    </Pressable>
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
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-1.5 self-start ${
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
