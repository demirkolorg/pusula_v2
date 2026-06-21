import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';

type ScreenHeaderProps = {
  /** Sayfa başlığı (örn. "Çalışma Alanları"). */
  title: string;
  /** Başlık altında tek satırlık kısa açıklama/özet (opsiyonel). */
  subtitle?: string;
  /** Sağda aksiyon öğeleri — genelde bir veya daha çok `ScreenHeaderAction`. */
  right?: ReactNode;
};

/**
 * Ekran-içi başlık (2026-06-21) — native stack header'ın yerine. Tüm push ve
 * kök ekranlar bunu kullanır; başlık gövdeyle **aynı zeminde** durur, böylece
 * native header'ın `background` ↔ gövde `muted` "siyah bant" tutarsızlığı
 * ortadan kalkar (arama/bildirim ekranı deseniyle bütünleşik görünüm).
 *
 * Görünür geri butonu YOK (DEM-206 — geri gitme iOS kenar-kaydırma / Android
 * OS-geri ile). `SafeAreaView edges={['top']}` ekranın kökünde sağlanmalı; bu
 * bileşen yalnız başlık satırını çizer (zemini ekranın kök `bg-*` belirler).
 */
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-2">
      <View className="flex-1 gap-0.5">
        <Text weight="semibold" numberOfLines={1} className="text-2xl text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}

type ScreenHeaderActionProps = {
  icon: IconName;
  /** Erişilebilirlik etiketi (zorunlu — ikon-only buton). */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Aktif/etkin vurgu (örn. filtre uygulanmış) — primary tonlu zemin + ikon. */
  active?: boolean;
};

/**
 * `ScreenHeader` sağındaki yuvarlak `bg-muted` aksiyon chip'i (bildirim merkezi
 * deseni — h-10 w-10, hitSlop). `active` ile primary tonlu vurgu (board filtre
 * gibi durum göstergeleri için).
 */
export function ScreenHeaderAction({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  active = false,
}: ScreenHeaderActionProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-full ${
        active ? 'bg-primary/15' : 'bg-muted'
      } ${disabled ? 'opacity-40' : 'active:opacity-60'}`}
    >
      <Icon name={icon} size={20} color={active ? theme.primary : theme.foreground} />
    </Pressable>
  );
}
