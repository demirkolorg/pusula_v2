import { Pressable, View, useColorScheme } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { RoleBadge } from '@/components/role-badge';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type MemberRowProps = {
  name: string;
  /** Önceden Türkçe'ye çevrilmiş rol etiketi. */
  roleLabel: string;
  image?: string | null;
  /** `true` ise "Devralındı" ikincil rozeti gösterilir (board inherited admin). */
  inherited?: boolean;
  /** Devralındı rozeti metni — opsiyonel (board ekranı verir). */
  inheritedLabel?: string;
  /** `true` ise çağıranın kendi satırı — "Sen" rozeti gösterilir. */
  isSelf?: boolean;
  /**
   * Tanımlıysa satır sonunda ⋮ aksiyon tetikleyicisi gösterilir (DEM-210 —
   * `admin+` için rol değiştir / üye çıkar). Devralınan-admin ve öz-satırlarda
   * çağıran ekran bunu vermez, böylece o satırlarda aksiyon yüzeyi çıkmaz.
   */
  onActions?: () => void;
};

/**
 * Üye listesi satırı — avatar + ad + rol rozeti. DEM-210 ile `admin+` için
 * isteğe bağlı ⋮ aksiyon tetikleyicisi (`onActions`) eklendi; verilmediğinde
 * satır salt görüntülemedir.
 */
export function MemberRow({
  name,
  roleLabel,
  image,
  inherited,
  inheritedLabel,
  isSelf,
  onActions,
}: MemberRowProps) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <EntityAvatar name={name} image={image} size={40} />
      <View className="flex-1 flex-row items-center gap-2">
        <Text weight="semibold" className="text-base text-foreground" numberOfLines={1}>
          {name}
        </Text>
        {isSelf ? <RoleBadge label={strings.members.youBadge} /> : null}
      </View>
      {inherited && inheritedLabel ? <RoleBadge label={inheritedLabel} /> : null}
      <RoleBadge label={roleLabel} />
      {onActions ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.members.actionsLabel}
          hitSlop={8}
          onPress={onActions}
          className="active:opacity-60"
        >
          <Icon name="more-vertical" size={20} color={theme.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}
