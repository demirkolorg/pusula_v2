import { Pressable, View, useColorScheme } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon, type IconName } from '@/components/icon';
import { RoleBadge } from '@/components/role-badge';
import { Text } from '@/components/text';
import { workspaceRoleLabel } from '@/lib/member-roles';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';
import type { WorkspaceRole } from '@pusula/domain';

type WorkspaceCardProps = {
  name: string;
  /** Workspace entity ikonu (`workspaces.icon`). */
  icon?: string | null;
  /** Çağıranın bu çalışma alanındaki rolü — sahip/misafir rozeti için. */
  role: WorkspaceRole;
  boardCount: number;
  memberCount: number;
  /**
   * Tablet master-detail sidebar'ında aktif (detail pane'de açık) workspace →
   * vurgulu kenar + hafif primary arka plan. Phone grid'inde verilmez (seçim
   * yok, route push edilir).
   */
  selected?: boolean;
  onPress: () => void;
};

/** İkon + sayı taşıyan meta satırı öğesi. */
function MetaItem({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={icon} size={13} color={color} />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

/**
 * "Panolar" sekmesi kökündeki çalışma alanı kartı. Sade ikon tabanlı tasarım:
 * üstte entity ikonu + rol rozeti (sahip / misafir / yönetici / üye net görünür),
 * altında ad ve pano/üye sayaçları. `(boards)/index.tsx` iki sütunlu grid'de
 * dizer. Tüm kart dokunulabilir.
 */
export function WorkspaceCard({
  name,
  icon,
  role,
  boardCount,
  memberCount,
  selected = false,
  onPress,
}: WorkspaceCardProps) {
  const theme = themeFor(useColorScheme());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-1 gap-2.5 rounded-2xl border p-3.5 active:opacity-80 ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
    >
      {/* İkon + rol rozeti. */}
      <View className="flex-row items-start justify-between gap-2">
        <EntityAvatar name={name} icon={icon} size={44} />
        <RoleBadge label={workspaceRoleLabel(role)} />
      </View>
      {/* Ad. */}
      <Text weight="semibold" className="text-base text-foreground" numberOfLines={2}>
        {name}
      </Text>
      {/* Pano / üye sayaçları. */}
      <View className="flex-row items-center gap-3">
        <MetaItem
          icon="trello"
          label={`${boardCount} ${strings.workspaces.boardCountSuffix}`}
          color={theme.mutedForeground}
        />
        <MetaItem
          icon="users"
          label={`${memberCount} ${strings.workspaces.memberCountSuffix}`}
          color={theme.mutedForeground}
        />
      </View>
    </Pressable>
  );
}
