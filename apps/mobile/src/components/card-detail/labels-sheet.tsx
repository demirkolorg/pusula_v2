import { Alert, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { labelColorHex } from '@/lib/label-color';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardLabels = RouterOutputs['card']['labels']['list'];

type LabelsSheetBodyProps = {
  cardId: string;
  boardId: string;
  labels: CardLabels;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart etiketleri — bottom sheet gövdesi (Faz 7G-2; eski `labels-editor`).
 * Mevcut etiketler renkli, kaldırılabilir chip'ler; `canEdit` ise eklenebilir
 * pano etiketleri (`label.list`) doğrudan listelenir — sheet zaten düzenleme
 * yüzeyi olduğundan ayrı "ekle" toggle'ı yok. Mutation'lar optimistic —
 * `card.labels.list` cache'i anında yamanır, hata olursa geri alınır; her ikisi
 * de idempotent. Bu gövde yalnız sheet açıkken mount edilir (board etiket
 * sorgusu kapalıyken çalışmaz).
 */
export function LabelsSheetBody({ cardId, boardId, labels, canEdit }: LabelsSheetBodyProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const labelsKey = trpc.card.labels.list.queryKey({ cardId });

  const boardLabelsQuery = useQuery(
    trpc.label.list.queryOptions({ boardId }, { enabled: canEdit }),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: labelsKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  const addLabel = useMutation(
    trpc.card.labels.add.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: labelsKey });
        const prev = queryClient.getQueryData<CardLabels>(labelsKey);
        const boardLabel = boardLabelsQuery.data?.find((l) => l.id === vars.labelId);
        if (prev && boardLabel && !prev.some((l) => l.labelId === boardLabel.id)) {
          queryClient.setQueryData<CardLabels>(labelsKey, [
            ...prev,
            { labelId: boardLabel.id, name: boardLabel.name, color: boardLabel.color },
          ]);
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(labelsKey, ctx.prev);
        Alert.alert(strings.cardDetail.labelsTitle, strings.cardDetail.actionError);
      },
      onSettled: invalidate,
    }),
  );

  const removeLabel = useMutation(
    trpc.card.labels.remove.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: labelsKey });
        const prev = queryClient.getQueryData<CardLabels>(labelsKey);
        if (prev) {
          queryClient.setQueryData<CardLabels>(
            labelsKey,
            prev.filter((l) => l.labelId !== vars.labelId),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(labelsKey, ctx.prev);
        Alert.alert(strings.cardDetail.labelsTitle, strings.cardDetail.actionError);
      },
      onSettled: invalidate,
    }),
  );

  // Karta henüz eklenmemiş pano etiketleri.
  const available = (boardLabelsQuery.data ?? []).filter(
    (boardLabel) => !labels.some((l) => l.labelId === boardLabel.id),
  );

  return (
    <View className="gap-4">
      {labels.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {labels.map((label) => (
            <View
              key={label.labelId}
              className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"
            >
              <View
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: labelColorHex(label.color) }}
              />
              <Text className="text-sm text-foreground">
                {label.name ?? strings.cardDetail.labelUnnamed}
              </Text>
              {canEdit ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.cardDetail.remove}
                  disabled={removeLabel.isPending}
                  onPress={() =>
                    removeLabel.mutate({
                      cardId,
                      labelId: label.labelId,
                      clientMutationId: newClientMutationId(),
                    })
                  }
                  className="active:opacity-60"
                >
                  <Icon name="x" size={14} color={theme.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">{strings.cardDetail.labelsEmpty}</Text>
      )}

      {canEdit ? (
        <View className="gap-2">
          <Text weight="semibold" className="text-xs uppercase text-muted-foreground">
            {strings.cardDetail.labelAdd}
          </Text>
          {boardLabelsQuery.isPending ? (
            <Text className="text-sm text-muted-foreground">{strings.common.loading}</Text>
          ) : available.length > 0 ? (
            <ScrollView className="max-h-72" contentContainerClassName="flex-row flex-wrap gap-2">
              {available.map((label) => (
                <Pressable
                  key={label.id}
                  accessibilityRole="button"
                  disabled={addLabel.isPending}
                  onPress={() =>
                    addLabel.mutate({
                      cardId,
                      labelId: label.id,
                      clientMutationId: newClientMutationId(),
                    })
                  }
                  className={`flex-row items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 ${
                    addLabel.isPending ? 'opacity-50' : 'active:opacity-70'
                  }`}
                >
                  <View
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: labelColorHex(label.color) }}
                  />
                  <Text className="text-sm text-foreground">
                    {label.name ?? strings.cardDetail.labelUnnamed}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {strings.cardDetail.labelNoneAvailable}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
