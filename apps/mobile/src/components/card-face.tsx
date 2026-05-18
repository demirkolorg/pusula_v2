import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { formatDueDate, isOverdue } from '@/lib/format-date';
import { labelColorHex } from '@/lib/label-color';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';
import { CardCoverImage } from './card-cover-image';
import { EntityAvatar } from './entity-avatar';
import { Icon, type IconName } from './icon';

type BoardCard = RouterOutputs['board']['get']['cards'][number];

/** Kart yüzünde gösterilecek en fazla üye avatarı; fazlası "+N" olur. */
const MAX_VISIBLE_MEMBERS = 3;

type MetaChipProps = {
  icon: IconName;
  label: string;
  color: string;
};

/** Kart yüzü meta satırı öğesi — küçük ikon + değer. */
function MetaChip({ icon, label, color }: MetaChipProps) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={icon} size={13} color={color} />
      <Text className="text-xs" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Board kolonundaki tek kartın yüzü. Başlık + etiket renk şeritleri + meta
 * satırı (due / checklist / yorum / ek / üye). `onPress` verilirse karta
 * dokunmak kart detayını açar (Faz 7F); `onLongPress` verilirse uzun basma
 * "move to list" picker'ını açar (Faz 7H — mobil drag-drop yerine).
 */
export function CardFace({
  card,
  onPress,
  onLongPress,
}: {
  card: BoardCard;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const theme = themeFor(useColorScheme());
  const overdue = card.dueAt != null && !card.completed && isOverdue(card.dueAt);
  const visibleMembers = card.members.slice(0, MAX_VISIBLE_MEMBERS);
  const extraMembers = card.members.length - visibleMembers.length;

  const hasMeta =
    card.dueAt != null ||
    card.checklistTotal > 0 ||
    card.commentCount > 0 ||
    card.attachmentCount > 0 ||
    card.members.length > 0;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onLongPress ? strings.board.moveCardAction : undefined}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      className={`overflow-hidden rounded-lg border border-border bg-card ${
        onPress || onLongPress ? 'active:opacity-70' : ''
      }`}
    >
      {/* Kapak görseli şeridi — kart yüzünün üstünde, kenara dayalı (Faz 7P). */}
      {card.coverImage ? <CardCoverImage coverImage={card.coverImage} /> : null}

      <View className="gap-2 p-3">
        {card.labels.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {card.labels.map((label) => (
              <View
                key={label.labelId}
                accessibilityLabel={label.name}
                className="h-1.5 w-7 rounded-full"
                style={{ backgroundColor: labelColorHex(label.color) }}
              />
            ))}
          </View>
        ) : null}

        <Text
          weight="medium"
          className={`text-sm ${
            card.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {card.title}
        </Text>

        {hasMeta ? (
          <View className="flex-row flex-wrap items-center gap-3">
            {card.dueAt != null ? (
              <MetaChip
                icon="clock"
                label={formatDueDate(card.dueAt)}
                color={overdue ? theme.destructive : theme.mutedForeground}
              />
            ) : null}
            {card.checklistTotal > 0 ? (
              <MetaChip
                icon="check-square"
                label={`${card.checklistDone}/${card.checklistTotal}`}
                color={theme.mutedForeground}
              />
            ) : null}
            {card.commentCount > 0 ? (
              <MetaChip
                icon="message-square"
                label={String(card.commentCount)}
                color={theme.mutedForeground}
              />
            ) : null}
            {card.attachmentCount > 0 ? (
              <MetaChip
                icon="paperclip"
                label={String(card.attachmentCount)}
                color={theme.mutedForeground}
              />
            ) : null}
            {visibleMembers.length > 0 ? (
              <View className="flex-row items-center gap-1">
                {visibleMembers.map((member) => (
                  <EntityAvatar
                    key={member.userId}
                    name={member.name ?? '?'}
                    image={member.image}
                    size={20}
                  />
                ))}
                {extraMembers > 0 ? (
                  <Text className="text-xs text-muted-foreground">+{extraMembers}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
