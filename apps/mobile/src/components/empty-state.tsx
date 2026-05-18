import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { themeFor } from '@/theme/tokens';
import { Icon, type IconName } from './icon';

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: string;
  /** İsteğe bağlı aksiyon (örn. "Tekrar dene" butonu). */
  children?: ReactNode;
};

/**
 * Ortak boş/bilgi durumu — onboarding, "yakında" placeholder ve liste hata
 * ekranları bunu kullanır.
 */
export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Icon name={icon} size={26} color={theme.mutedForeground} />
      </View>
      <Text weight="semibold" className="text-center text-lg text-foreground">
        {title}
      </Text>
      <Text className="text-center text-sm text-muted-foreground">{description}</Text>
      {children}
    </View>
  );
}
