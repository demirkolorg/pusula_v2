import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { CardFace } from './card-face';

type BoardData = RouterOutputs['board']['get'];
type BoardList = BoardData['lists'][number];
type BoardCard = BoardData['cards'][number];

type BoardColumnProps = {
  list: BoardList;
  /** Bu listeye ait kartlar — `position` sıralı (board.get sözleşmesi). */
  cards: BoardCard[];
};

/**
 * Board ekranında tek bir liste kolonu — başlık + kart sayısı + dikey kaydıran
 * kart listesi. Genişlik sabit; yükseklik kapsayıcı yatay scroll'u doldurur.
 */
export function BoardColumn({ list, cards }: BoardColumnProps) {
  const router = useRouter();
  return (
    <View className="h-full w-72 rounded-xl bg-muted p-2">
      <View className="flex-row items-center justify-between px-1 py-2">
        <Text weight="semibold" className="flex-1 text-sm text-foreground" numberOfLines={1}>
          {list.title}
        </Text>
        <Text className="text-xs text-muted-foreground">{cards.length}</Text>
      </View>
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerClassName="gap-2 pb-2"
        renderItem={({ item }) => (
          <CardFace
            card={item}
            onPress={() =>
              router.push({
                pathname: '/cards/[cardId]',
                params: { cardId: item.id, title: item.title },
              })
            }
          />
        )}
        ListEmptyComponent={
          <Text className="px-1 py-3 text-xs text-muted-foreground">{strings.board.emptyList}</Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
