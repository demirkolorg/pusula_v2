import { Pressable, View, useColorScheme } from 'react-native';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { boardBackgroundColor } from '@/lib/board-background';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type BoardCardProps = {
  title: string;
  /** Board entity ikonu (`boards.icon`). */
  icon?: string | null;
  /** `boards.background` (`solid:<ad>` | `gradient:<ad>` | null) — kapak şeridi rengi. */
  background?: string | null;
  openCount: number;
  doneCount: number;
  /** Arşivlenmiş board → rozet. */
  archived?: boolean;
  onPress: () => void;
};

/** İkon + sayı taşıyan meta satırı öğesi (WorkspaceCard ile aynı dil). */
function MetaItem({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={icon} size={13} color={color} />
      <Text tabletScale={1.0} className="text-xs text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

/**
 * Workspace board listesi grid hücresi. Üstte board kapak rengi şeridi (seçiliyse
 * `boards.background` → tek hex; bkz. [`board-background.ts`](../lib/board-background.ts)),
 * altında ikon + ad + açık/tamamlanmış sayaçları. Kapak rengi yoksa şerit nötr
 * `muted` kalır — kart yine tutarlı yükseklikte durur. `flex-1` ile grid
 * sütununu doldurur; tüm kart dokunulabilir.
 */
export function BoardCard({
  title,
  icon,
  background,
  openCount,
  doneCount,
  archived = false,
  onPress,
}: BoardCardProps) {
  const theme = themeFor(useColorScheme());
  const coverColor = boardBackgroundColor(background);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 overflow-hidden rounded-2xl border border-border bg-card active:opacity-80"
    >
      {/* Kapak rengi şeridi — renk yoksa nötr muted bant (sabit yükseklik). */}
      <View
        className="h-2.5"
        style={{ backgroundColor: coverColor ?? theme.muted }}
      />
      <View className="gap-2.5 p-3.5">
        {/* İkon + arşiv rozeti. */}
        <View className="flex-row items-start justify-between gap-2">
          <EntityAvatar name={title} icon={icon} size={40} />
          {archived ? (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text tabletScale={1.0} className="text-[11px] text-muted-foreground">
                {strings.boards.archivedBadge}
              </Text>
            </View>
          ) : null}
        </View>
        {/* Ad. */}
        <Text weight="semibold" className="text-base text-foreground" numberOfLines={2}>
          {title}
        </Text>
        {/* Açık / tamamlanmış sayaçları. */}
        <View className="flex-row items-center gap-3">
          <MetaItem
            icon="circle"
            label={`${openCount} ${strings.boards.openSuffix}`}
            color={theme.mutedForeground}
          />
          <MetaItem
            icon="check-circle"
            label={`${doneCount} ${strings.boards.doneSuffix}`}
            color={theme.success}
          />
        </View>
      </View>
    </Pressable>
  );
}
