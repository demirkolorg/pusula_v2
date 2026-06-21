import { View } from 'react-native';
import { Text } from '@/components/text';

type RoleBadgeProps = {
  /** Önceden Türkçe'ye çevrilmiş rol etiketi (`workspaceRoleLabel` vb.). */
  label: string;
  /**
   * Renk tonu. `primary` → tema rengi tint'i (örn. sahip/owner vurgusu);
   * `neutral` (varsayılan) → gri. Rol hiyerarşisini renkle de okutmak için.
   */
  tone?: 'primary' | 'neutral';
};

/**
 * Üye / workspace satırının sağındaki küçük rol rozeti. `tone='primary'` ile
 * en yetkili rol (sahip) tema rengiyle vurgulanır; diğerleri nötr gri kalır.
 */
export function RoleBadge({ label, tone = 'neutral' }: RoleBadgeProps) {
  const primary = tone === 'primary';
  return (
    <View className={`rounded-full px-2 py-0.5 ${primary ? 'bg-primary/15' : 'bg-muted'}`}>
      <Text
        weight="medium"
        className={`text-xs ${primary ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
    </View>
  );
}
