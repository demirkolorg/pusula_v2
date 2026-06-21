import type { IconName } from '@/components/icon';
import { PageHero } from '@/components/page-hero';

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
 * Kullanım Koşulları / Hakkında / Görünüm / Bildirimler / Güvenlik / Profil
 * ekranlarının kimlik bloğunu tek kaynağa toplar. Görsel düzen ortak
 * [`PageHero`](../page-hero.tsx) bileşeninden gelir; bu ince sarmalayıcı yalnız
 * hesap sayfalarının `icon + title + subtitle` sözleşmesini sabitler (aksiyon
 * slot'u açmaz — hesap alt sayfalarında ortalanmış aksiyon yok).
 */
export function AccountPageHeader({ icon, title, subtitle }: AccountPageHeaderProps) {
  return <PageHero icon={icon} title={title} subtitle={subtitle} />;
}
