import type { ReactNode } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Text } from '@/components/text';
import { themeFor } from '@/theme/tokens';
import { Icon } from './icon';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Sağ üstte küçük etiket (örn. "Arşiv"). */
  badge?: string;
  /** Sol görsel (avatar / renk karesi). */
  leading?: ReactNode;
  /** Verilirse satır dokunulabilir olur ve sağda chevron çıkar. */
  onPress?: () => void;
};

/** Workspace / board listelerinde kullanılan dokunulabilir kart satırı. */
export function ListRow({ title, subtitle, badge, leading, onPress }: ListRowProps) {
  const theme = themeFor(useColorScheme());
  const interactive = typeof onPress === 'function';

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      disabled={!interactive}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 ${
        interactive ? 'active:opacity-70' : ''
      }`}
    >
      {leading}
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text weight="semibold" className="flex-1 text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {badge ? (
            <Text className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {badge}
            </Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {interactive ? <Icon name="chevron-right" size={18} color={theme.mutedForeground} /> : null}
    </Pressable>
  );
}
