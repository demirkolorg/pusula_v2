import { Pressable, View } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon, type IconName } from '@/components/icon';
import { RoleBadge } from '@/components/role-badge';
import { Text } from '@/components/text';
import { avatarColor } from '@/lib/avatar-color';
import { workspaceRoleLabel } from '@/lib/member-roles';
import { formatRelativeTime } from '@/lib/format-date';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';
import type { WorkspaceRole } from '@pusula/domain';

type BoardPreview = { title: string; icon: string };

type WorkspaceCardProps = {
  name: string;
  icon?: string | null;
  role: WorkspaceRole;
  boardCount: number;
  memberCount: number;
  lastActivityAt?: Date | string | null;
  previewBoards?: BoardPreview[];
  /**
   * `compact` — tablet sidebar'ı için yatay kompakt sürüm.
   * Varsayılan (`false`) — phone için tam genişlik liste kartı.
   */
  compact?: boolean;
  /** Tablet master-detail'de seçili workspace vurgusu. */
  selected?: boolean;
  onPress: () => void;
};

function MetaItem({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={icon} size={12} color={color} />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

function BoardChip({ title }: BoardPreview) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-1 rounded-md bg-muted px-2 py-1">
      <Icon name="trello" size={11} color={theme.mutedForeground} />
      <Text className="text-xs text-muted-foreground" numberOfLines={1} style={{ maxWidth: 80 }}>
        {title}
      </Text>
    </View>
  );
}

/**
 * Tam genişlik liste kartı (phone anasayfa).
 * Yatay layout: avatar sol → içerik orta → chevron sağ.
 */
function ListCard({
  name,
  icon,
  role,
  boardCount,
  memberCount,
  lastActivityAt,
  previewBoards,
  onPress,
}: Omit<WorkspaceCardProps, 'compact' | 'selected'>) {
  const theme = useTheme();
  const boards = previewBoards ?? [];
  const extraBoardCount = boardCount - boards.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-stretch overflow-hidden rounded-2xl border border-border bg-card active:opacity-80"
    >
      {/* Sol kimlik şeridi — workspace'in deterministik rengi. Kartı zeminden
          ayırır (kontrast) + her workspace'e renk kimliği verir (canlılık). */}
      <View style={{ width: 4, backgroundColor: avatarColor(name) }} />

      <View className="flex-1 flex-row items-center gap-4 p-4">
        <EntityAvatar name={name} icon={icon} size={52} />

        <View className="min-w-0 flex-1 gap-2">
          {/* İsim + rol rozeti. */}
          <View className="flex-row items-center gap-2">
            <Text
              weight="semibold"
              className="flex-1 text-[15px] text-foreground"
              numberOfLines={1}
            >
              {name}
            </Text>
            <RoleBadge
              label={workspaceRoleLabel(role)}
              tone={role === 'owner' ? 'primary' : 'neutral'}
            />
          </View>

        {/* Board chip önizlemeleri. */}
        {boards.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {boards.map((board) => (
              <BoardChip key={board.title} title={board.title} icon={board.icon} />
            ))}
            {extraBoardCount > 0 ? (
              <View className="rounded-md bg-muted px-2 py-1">
                <Text className="text-xs text-muted-foreground">+{extraBoardCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Alt meta satırı: üye · pano · son aktivite. */}
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <MetaItem
            icon="users"
            label={`${memberCount} ${strings.workspaces.memberCountSuffix}`}
            color={theme.mutedForeground}
          />
          {boards.length === 0 ? (
            <MetaItem
              icon="trello"
              label={`${boardCount} ${strings.workspaces.boardCountSuffix}`}
              color={theme.mutedForeground}
            />
          ) : null}
          {lastActivityAt ? (
            <Text className="text-xs text-muted-foreground">
              {formatRelativeTime(lastActivityAt)}
            </Text>
          ) : null}
        </View>
      </View>

        <Icon name="chevron-right" size={16} color={theme.mutedForeground} />
      </View>
    </Pressable>
  );
}

/**
 * Kompakt yatay kart (tablet sidebar).
 * Küçük avatar + isim + sayaçlar + rol rozeti, tek satır.
 */
function CompactCard({
  name,
  icon,
  role,
  boardCount,
  memberCount,
  lastActivityAt,
  selected,
  onPress,
}: Omit<WorkspaceCardProps, 'compact' | 'previewBoards'>) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-stretch overflow-hidden rounded-xl border active:opacity-80 ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
    >
      {/* Sol kimlik şeridi — workspace rengiyle (liste kartıyla aynı dil). */}
      <View style={{ width: 3, backgroundColor: avatarColor(name) }} />
      <View className="flex-1 flex-row items-center gap-3 p-3">
        <EntityAvatar name={name} icon={icon} size={36} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text weight="semibold" className="text-sm text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <View className="flex-row items-center gap-2.5">
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
            {lastActivityAt ? (
              <Text className="text-xs text-muted-foreground">
                {formatRelativeTime(lastActivityAt)}
              </Text>
            ) : null}
          </View>
        </View>
        <RoleBadge
          label={workspaceRoleLabel(role)}
          tone={role === 'owner' ? 'primary' : 'neutral'}
        />
      </View>
    </Pressable>
  );
}

export function WorkspaceCard({ compact = false, ...props }: WorkspaceCardProps) {
  if (compact) return <CompactCard {...props} />;
  return <ListCard {...props} />;
}
