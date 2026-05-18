import { View } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { RoleBadge } from '@/components/role-badge';
import { Text } from '@/components/text';

type MemberRowProps = {
  name: string;
  /** Önceden Türkçe'ye çevrilmiş rol etiketi. */
  roleLabel: string;
  image?: string | null;
  /** `true` ise "Devralındı" ikincil rozeti gösterilir (board inherited admin). */
  inherited?: boolean;
  /** Devralındı rozeti metni — opsiyonel (board ekranı verir). */
  inheritedLabel?: string;
};

/**
 * Üye listesi satırı — avatar + ad + rol rozeti. Salt görüntüleme (DEM-180
 * kapsamı: rol değiştirme / üye çıkarma yok), bu yüzden `Pressable` değil.
 */
export function MemberRow({ name, roleLabel, image, inherited, inheritedLabel }: MemberRowProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <EntityAvatar name={name} image={image} size={40} />
      <Text weight="semibold" className="flex-1 text-base text-foreground" numberOfLines={1}>
        {name}
      </Text>
      {inherited && inheritedLabel ? <RoleBadge label={inheritedLabel} /> : null}
      <RoleBadge label={roleLabel} />
    </View>
  );
}
