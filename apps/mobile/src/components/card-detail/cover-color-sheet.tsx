import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CARD_COVER_COLORS, type CardCoverColor } from '@pusula/domain';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { setCardCoverColorInCache } from '@/lib/board-cache';
import { coverColorHex } from '@/lib/cover-color';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardGet = RouterOutputs['card']['get'];
type BoardGet = RouterOutputs['board']['get'];

type CoverColorSheetBodyProps = {
  cardId: string;
  /** Board kart yüzü şeridini iyimser güncellemek için `board.get` cache anahtarı. */
  boardId: string;
  /** Kartın mevcut kapak rengi (`null` => kapak rengi yok). */
  coverColor: CardCoverColor | null;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart kapak rengi — bottom sheet gövdesi (DEM-201). Web kart modalı kapak
 * rengi picker'ının (`13-ui-tasarim-dili.md` §13.3) mobil karşılığı: 12 renk
 * swatch'ı (`@pusula/domain` `CARD_COVER_COLORS`) + "Rengi kaldır". Seçim
 * `card.update({ coverColor })` ile collaborative — `card.get` (kart detayı) ve
 * `board.get` (kart yüzü şeridi) cache'leri iyimser yamanır, hata olursa ikisi
 * de geri sarılır; `clientMutationId` taşır. `canEdit=false` (board `viewer`)
 * ise salt-okunur (swatch'lar dokunulamaz, mevcut renk halkalı gösterilir).
 */
export function CoverColorSheetBody({
  cardId,
  boardId,
  coverColor,
  canEdit,
}: CoverColorSheetBodyProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const cardKey = trpc.card.get.queryKey({ cardId });
  const boardKey = trpc.board.get.queryKey({ boardId });

  const updateCover = useMutation(
    trpc.card.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: cardKey });
        await queryClient.cancelQueries({ queryKey: boardKey });
        const prevCard = queryClient.getQueryData<CardGet>(cardKey);
        const prevBoard = queryClient.getQueryData<BoardGet>(boardKey);
        const next = vars.coverColor ?? null;
        if (prevCard) {
          queryClient.setQueryData<CardGet>(cardKey, {
            ...prevCard,
            card: { ...prevCard.card, coverColor: next },
          });
        }
        if (prevBoard) {
          queryClient.setQueryData<BoardGet>(
            boardKey,
            setCardCoverColorInCache(prevBoard, cardId, next),
          );
        }
        return { prevCard, prevBoard };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prevCard) queryClient.setQueryData(cardKey, ctx.prevCard);
        if (ctx?.prevBoard) queryClient.setQueryData(boardKey, ctx.prevBoard);
        Alert.alert(strings.cardDetail.coverTitle, strings.cardDetail.actionError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: cardKey });
        // Board kart yüzü şeridi de iyimser yamandı — sunucu reconcile'ı için
        // `board.get` invalidate edilir (`attachments-section` kapak deseniyle aynı).
        void queryClient.invalidateQueries({ queryKey: boardKey });
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
      },
    }),
  );

  // Aynı değer yeniden seçilirse mutation atma — gereksiz aktivite/"değişti"
  // damgası üretmemek için (web `card-item` `coverColor !== color` simetrisi).
  const select = (next: CardCoverColor | null) => {
    if ((coverColor ?? null) === next) return;
    updateCover.mutate({ cardId, coverColor: next, clientMutationId: newClientMutationId() });
  };

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        {CARD_COVER_COLORS.map((name) => {
          const selected = coverColor === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !canEdit }}
              accessibilityLabel={strings.cardDetail.coverColorNames[name]}
              disabled={!canEdit || updateCover.isPending}
              onPress={() => select(name)}
              className={`h-9 w-9 items-center justify-center rounded-full ${
                canEdit && !updateCover.isPending ? 'active:opacity-70' : ''
              }`}
              style={{
                backgroundColor: coverColorHex[name],
                borderWidth: selected ? 2 : 0,
                borderColor: theme.foreground,
              }}
            >
              {selected ? <Icon name="check" size={16} color="#ffffff" /> : null}
            </Pressable>
          );
        })}
      </View>

      {coverColor != null && canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.cardDetail.coverClear}
          disabled={updateCover.isPending}
          onPress={() => select(null)}
          className="min-h-11 flex-row items-center gap-1.5 self-start active:opacity-70"
        >
          <Icon name="x" size={15} color={theme.mutedForeground} />
          <Text className="text-sm text-muted-foreground">{strings.cardDetail.coverClear}</Text>
        </Pressable>
      ) : null}

      {coverColor == null ? (
        <Text className="text-sm text-muted-foreground">{strings.cardDetail.coverEmpty}</Text>
      ) : null}
    </View>
  );
}
