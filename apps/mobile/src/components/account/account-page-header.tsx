import { View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';

type AccountPageHeaderProps = {
  /** Sayfayı temsil eden Feather ikonu — tinted yuvarlak kare içinde primary renkte. */
  icon: IconName;
  /** Sayfa başlığı (örn. "Güvenlik"). */
  title: string;
  /**
   * Başlığın altındaki kısa açıklama — sayfanın ne işe yaradığını bir cümlede
   * anlatır. `lastUpdated` gibi tek satırlık meta da buraya verilebilir.
   */
  subtitle?: string;
};

/**
 * Hesap alt sayfalarının ortak "hero" başlığı (2026-06-21) — Gizlilik /
 * Kullanım Koşulları / Hakkında ekranlarının kimlik bloğunu tek kaynağa
 * toplar: ortalanmış tinted yuvarlak kare içinde primary ikon + başlık +
 * opsiyonel alt açıklama. Tüm hesap alt sayfaları (Görünüm, Bildirimler,
 * Güvenlik, Profil, içerik sayfaları) bu bileşeni kullanarak aynı tasarım
 * çizgisini paylaşır.
 *
 * Yalnız token (`theme.primary`, `bg-primary/10`, `text-foreground`,
 * `text-muted-foreground`) — hardcode renk yok; reduced-motion etkisi yok
 * (statik blok). `ScrollView` `gap-6 p-4` düzeninde ilk çocuk olarak kullanılır.
 */
export function AccountPageHeader({ icon, title, subtitle }: AccountPageHeaderProps) {
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
          <Text className="px-4 text-center text-sm leading-5 text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
