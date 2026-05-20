import { memo, useCallback } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import type { RouterOutputs } from '@pusula/api';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { isPendingId } from '@/lib/client-mutation-id';
import { formatDueDate, isOverdue } from '@/lib/format-date';
import { labelColorHex } from '@/lib/label-color';
import { themeFor } from '@/theme/tokens';

type BoardCard = RouterOutputs['board']['get']['cards'][number];

/** Sade tek-satır liste görünümünde gösterilecek etiket noktası eşiği. */
const MAX_VISIBLE_LABELS = 3;
/** Aynı satırda gösterilecek üye avatarı eşiği; fazlası "+N" olur. */
const MAX_VISIBLE_MEMBERS = 2;

type MetaProps = { icon: IconName; label: string; color: string };

/** Sağ tarafta minik ikon + değer öğesi (CardFace `MetaChip` deseni, kompakt). */
function Meta({ icon, label, color }: MetaProps) {
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
 * Liste görünümünde tek bir kart satırı (DEM-233) — sade Trello "list view"
 * deseninin mobil karşılığı. Solda max 3 etiket renk noktası + başlık (tek
 * satır, ellipsis); sağda yalnız mevcut olan meta öğeleri (due-date, checklist
 * ilerlemesi, ek/yorum sayıları, max 2 üye avatarı). Kapak görseli/şeridi ve
 * etiket bantları **bilinçli olarak yoktur** — liste görünümü kapak yüzü değil,
 * tarayıp bulma yüzeyidir (kullanıcı kararı 2026-05-20 "sade tek satır").
 *
 * Etkileşim `CardRow` ile aynı: dokun → kart detayı; (`canEdit` + commit'li
 * kart) ise uzun bas → "listeye taşı" picker. `React.memo` ile sarılı; `card`
 * referansı stabil olduğu sürece dokunulmayan satırlar yeniden çizilmez.
 * `useRouter` satır içinde alınır (board-column `CardRow` deseni — prop olarak
 * geçmek memo'yu kırar).
 */
export const CardListRow = memo(function CardListRow({
  card,
  canEdit,
  onMoveCard,
}: {
  card: BoardCard;
  canEdit: boolean;
  onMoveCard: (card: BoardCard) => void;
}) {
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  // Optimistic kart sunucudan dönene kadar etkileşime kapalı — `tmp-` id ile
  // kart detayı / taşıma backend'de bulunamaz.
  const cardPending = isPendingId(card.id);
  const overdue = card.dueAt != null && !card.completed && isOverdue(card.dueAt);

  const visibleLabels = card.labels.slice(0, MAX_VISIBLE_LABELS);
  const extraLabels = card.labels.length - visibleLabels.length;
  const visibleMembers = card.members.slice(0, MAX_VISIBLE_MEMBERS);
  const extraMembers = card.members.length - visibleMembers.length;

  const handlePress = useCallback(() => {
    router.push({
      pathname: '/cards/[cardId]',
      params: { cardId: card.id, title: card.title },
    });
  }, [router, card.id, card.title]);

  const handleLongPress = useCallback(() => onMoveCard(card), [onMoveCard, card]);

  return (
    <Pressable
      accessibilityRole={cardPending ? undefined : 'button'}
      disabled={cardPending}
      onPress={cardPending ? undefined : handlePress}
      onLongPress={canEdit && !cardPending ? handleLongPress : undefined}
      className="min-h-11 flex-row items-center gap-3 border-b border-border bg-card px-3 py-2 active:opacity-70"
    >
      {/* Sol: etiket noktaları + başlık (flex-1, ellipsis). */}
      <View className="flex-1 flex-row items-center gap-2">
        {visibleLabels.length > 0 ? (
          <View className="flex-row items-center gap-1">
            {visibleLabels.map((label) => (
              <View
                key={label.labelId}
                accessibilityLabel={label.name}
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: labelColorHex(label.color) }}
              />
            ))}
            {extraLabels > 0 ? (
              <Text className="text-[10px] text-muted-foreground">+{extraLabels}</Text>
            ) : null}
          </View>
        ) : null}
        <Text
          weight="medium"
          numberOfLines={1}
          className={`flex-1 text-sm ${
            card.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {card.title}
        </Text>
      </View>

      {/* Sağ: yalnız var olan meta öğeleri kompakt ikon + değerle. */}
      <View className="flex-row items-center gap-3">
        {card.dueAt != null ? (
          <Meta
            icon="clock"
            label={formatDueDate(card.dueAt)}
            color={overdue ? theme.destructive : theme.mutedForeground}
          />
        ) : null}
        {card.checklistTotal > 0 ? (
          <Meta
            icon="check-square"
            label={`${card.checklistDone}/${card.checklistTotal}`}
            color={theme.mutedForeground}
          />
        ) : null}
        {card.attachmentCount > 0 ? (
          <Meta
            icon="paperclip"
            label={String(card.attachmentCount)}
            color={theme.mutedForeground}
          />
        ) : null}
        {card.commentCount > 0 ? (
          <Meta
            icon="message-square"
            label={String(card.commentCount)}
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
                size={18}
              />
            ))}
            {extraMembers > 0 ? (
              <Text className="text-xs text-muted-foreground">+{extraMembers}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
