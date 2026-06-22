import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';
import { Icon, type IconName } from './icon';

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: string;
  /** İsteğe bağlı aksiyon (örn. "Tekrar dene" butonu). */
  children?: ReactNode;
  /**
   * İkon vurgusu — `primary` ikon kabını `bg-primary/10` zemin + `primary` ikon
   * yapar (markalı boş durum, örn. Hızlı Notlar). Verilmezse (varsayılan) nötr
   * `bg-muted` + `muted-foreground` ikon — mevcut kullanımlar değişmez.
   */
  tone?: 'muted' | 'primary';
};

/**
 * Ortak boş/bilgi durumu — onboarding, "yakında" placeholder ve liste hata
 * ekranları bunu kullanır.
 */
export function EmptyState({ icon, title, description, children, tone = 'muted' }: EmptyStateProps) {
  const theme = useTheme();
  const primaryTone = tone === 'primary';
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <View
        className={`h-20 w-20 items-center justify-center rounded-3xl ${
          primaryTone ? 'bg-primary/10' : 'bg-muted'
        }`}
      >
        <Icon name={icon} size={30} color={primaryTone ? theme.primary : theme.mutedForeground} />
      </View>
      <Text weight="semibold" className="text-center text-lg text-foreground">
        {title}
      </Text>
      <Text className="text-center text-sm text-muted-foreground">{description}</Text>
      {children}
    </View>
  );
}
