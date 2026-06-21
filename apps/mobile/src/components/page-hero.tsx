import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';

type PageHeroProps = {
  /** Sayfayı temsil eden Feather ikonu — tinted yuvarlak kare içinde primary renkte. */
  icon: IconName;
  /** Sayfa başlığı (örn. "Görünüm", "Ürün Ekibi"). */
  title: string;
  /**
   * Başlığın altındaki kısa açıklama/özet — bir cümlelik tanım ya da tek
   * satırlık meta (örn. "3 üye").
   */
  subtitle?: string;
  /**
   * Verilirse `subtitle` tıklanabilir olur (primary renk + Pressable) — örn.
   * "6 üye" özetinden üyeler listesine geçmek için. Boşsa subtitle düz
   * `muted-foreground` metindir.
   */
  onSubtitlePress?: () => void;
  /**
   * Başlık bloğunun altında **ortalanmış** opsiyonel aksiyon alanı — örn.
   * yan-yana pill butonları. Boşsa hiç render edilmez.
   */
  children?: ReactNode;
};

/**
 * Ortak "hero" başlığı (2026-06-21) — ortalanmış tinted yuvarlak kare içinde
 * primary ikon + başlık + opsiyonel alt açıklama + opsiyonel ortalanmış aksiyon
 * satırı. Hem hesap alt sayfaları ([`AccountPageHeader`](./account/account-page-header.tsx))
 * hem de workspace board listesi ekranı aynı tasarım çizgisini bu bileşenle
 * paylaşır.
 *
 * Yalnız token (`theme.primary`, `bg-primary/10`, `text-foreground`,
 * `text-muted-foreground`) — hardcode renk yok; reduced-motion etkisi yok
 * (statik blok). Bir ScrollView/ekranın ilk çocuğu olarak kullanılır.
 */
export function PageHero({ icon, title, subtitle, onSubtitlePress, children }: PageHeroProps) {
  const theme = useTheme();
  return (
    <View className="items-center gap-3 pt-4">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <Icon name={icon} size={44} color={theme.primary} />
      </View>
      <View className="items-center gap-1">
        <Text weight="semibold" className="text-center text-2xl text-foreground">
          {title}
        </Text>
        {subtitle ? (
          onSubtitlePress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={subtitle}
              hitSlop={8}
              onPress={onSubtitlePress}
              className="active:opacity-60"
            >
              <Text weight="semibold" className="px-4 text-center text-sm leading-5 text-primary">
                {subtitle}
              </Text>
            </Pressable>
          ) : (
            <Text className="px-4 text-center text-sm leading-5 text-muted-foreground">
              {subtitle}
            </Text>
          )
        ) : null}
      </View>
      {children ? <View className="items-center pt-1">{children}</View> : null}
    </View>
  );
}
