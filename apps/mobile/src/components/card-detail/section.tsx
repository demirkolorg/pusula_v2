import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { themeFor } from '@/theme/tokens';

type DetailSectionProps = {
  icon: IconName;
  title: string;
  children: ReactNode;
};

/** Kart detay ekranında başlıklı bölüm sarmalayıcısı (ikon + başlık + içerik). */
export function DetailSection({ icon, title, children }: DetailSectionProps) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={15} color={theme.mutedForeground} />
        <Text weight="semibold" className="text-xs uppercase text-muted-foreground">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
