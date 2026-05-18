import { useState } from 'react';
import { FlatList, Pressable, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { isPendingId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';
import { CardFace } from './card-face';

type BoardData = RouterOutputs['board']['get'];
type BoardList = BoardData['lists'][number];
type BoardCard = BoardData['cards'][number];

type BoardColumnProps = {
  list: BoardList;
  /** Bu listeye ait kartlar — `position` sıralı (board.get sözleşmesi). */
  cards: BoardCard[];
  /** Board `member+` ise düzenleme yüzeyleri (composer / ⋮ / taşıma) gösterilir. */
  canEdit: boolean;
  /** Kolon altındaki composer'dan kart oluşturma (Faz 7H). */
  onCreateCard: (title: string) => void;
  /** Kolon ⋮ — liste işlemleri sheet'ini açar. */
  onOpenListActions: () => void;
  /** Kart uzun basma — "move to list" picker'ını açar. */
  onMoveCard: (card: BoardCard) => void;
};

/**
 * Board ekranında tek bir liste kolonu — başlık + kart sayısı + dikey kaydıran
 * kart listesi. Genişlik sabit; yükseklik kapsayıcı yatay scroll'u doldurur.
 * Faz 7H: board `member+` için kolon ⋮ menüsü + kart-ekle composer'ı + kart
 * uzun basma taşıma. `viewer` için kolon salt-okunur kalır (7E davranışı).
 */
export function BoardColumn({
  list,
  cards,
  canEdit,
  onCreateCard,
  onOpenListActions,
  onMoveCard,
}: BoardColumnProps) {
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  const [composerOpen, setComposerOpen] = useState(false);
  // Optimistic (henüz sunucuya yazılmamış) liste — ⋮ menüsü açılmaz.
  const listPending = isPendingId(list.id);

  const footer = !canEdit ? null : composerOpen ? (
    <InlineComposer
      placeholder={strings.board.addCardPlaceholder}
      submitLabel={strings.board.addCardSubmit}
      onSubmit={onCreateCard}
      onCancel={() => setComposerOpen(false)}
    />
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.board.addCard}
      onPress={() => setComposerOpen(true)}
      className="flex-row items-center gap-2 rounded-lg px-1 py-2 active:opacity-60"
    >
      <Icon name="plus" size={16} color={theme.mutedForeground} />
      <Text weight="medium" className="text-sm text-muted-foreground">
        {strings.board.addCard}
      </Text>
    </Pressable>
  );

  return (
    <View className="h-full w-72 rounded-xl bg-muted p-2">
      <View className="flex-row items-center gap-1 px-1 py-2">
        <Text weight="semibold" className="flex-1 text-sm text-foreground" numberOfLines={1}>
          {list.title}
        </Text>
        <Text className="text-xs text-muted-foreground">{cards.length}</Text>
        {canEdit && !listPending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.board.listActions}
            hitSlop={8}
            onPress={onOpenListActions}
            className="ml-1 active:opacity-60"
          >
            <Icon name="more-vertical" size={18} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerClassName="gap-2 pb-2"
        renderItem={({ item }) => {
          // Optimistic kart sunucudan dönene kadar etkileşime kapalı — `tmp-`
          // id ile kart detayı / taşıma backend'de bulunamaz.
          const cardPending = isPendingId(item.id);
          return (
            <CardFace
              card={item}
              onPress={
                cardPending
                  ? undefined
                  : () =>
                      router.push({
                        pathname: '/cards/[cardId]',
                        params: { cardId: item.id, title: item.title },
                      })
              }
              onLongPress={canEdit && !cardPending ? () => onMoveCard(item) : undefined}
            />
          );
        }}
        ListEmptyComponent={
          <Text className="px-1 py-3 text-xs text-muted-foreground">{strings.board.emptyList}</Text>
        }
        ListFooterComponent={footer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
