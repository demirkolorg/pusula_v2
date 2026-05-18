import { View } from 'react-native';
import { Text } from '@/components/text';

type RoleBadgeProps = {
  /** Önceden Türkçe'ye çevrilmiş rol etiketi (`workspaceRoleLabel` vb.). */
  label: string;
};

/**
 * Üye satırının sağındaki küçük rol rozeti. `ListRow` `badge` alanı tek satır
 * metni alır; rol rozetinin kendi sarmalayıcısı olduğu için ayrı bileşen.
 */
export function RoleBadge({ label }: RoleBadgeProps) {
  return (
    <View className="rounded-full bg-muted px-2 py-0.5">
      <Text weight="medium" className="text-xs text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
