import { useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type Checklists = RouterOutputs['checklist']['list'];
type ChecklistItem = Checklists[number]['items'][number];

/** Optimistic eklenen (henüz sunucuda olmayan) madde id ön eki. */
const OPTIMISTIC_PREFIX = 'optimistic-';

type ChecklistSectionProps = {
  cardId: string;
  checklists: Checklists;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart kontrol listeleri — madde işaretleme + ekleme/silme (Faz 7G). Mutation'lar
 * (`checklist.item.toggle` / `.create` / `.delete`) optimistic: `checklist.list`
 * cache'i anında yamanır, hata olursa geri alınır. Yeni kontrol listesi
 * oluşturma / silme **kapsam dışı** (7G yalnız madde düzeyi) — listesi olmayan
 * kart bilgilendirme metni gösterir. `canEdit` `false` ise salt-okunur.
 */
export function ChecklistSection({ cardId, checklists, canEdit }: ChecklistSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const checklistKey = trpc.checklist.list.queryKey({ cardId });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: checklistKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  /** `checklist.list` cache'ini güvenli yamalar (snapshot döner). */
  const patch = async (
    update: (lists: Checklists) => Checklists,
  ): Promise<{ prev: Checklists | undefined }> => {
    await queryClient.cancelQueries({ queryKey: checklistKey });
    const prev = queryClient.getQueryData<Checklists>(checklistKey);
    if (prev) queryClient.setQueryData<Checklists>(checklistKey, update(prev));
    return { prev };
  };

  const rollback = (ctx: { prev: Checklists | undefined } | undefined) => {
    if (ctx?.prev) queryClient.setQueryData(checklistKey, ctx.prev);
    Alert.alert(strings.cardDetail.checklistsTitle, strings.cardDetail.actionError);
  };

  const toggleItem = useMutation(
    trpc.checklist.item.toggle.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === vars.itemId ? { ...item, completed: vars.completed } : item,
                  ),
                }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const createItem = useMutation(
    trpc.checklist.item.create.mutationOptions({
      onMutate: (vars) => {
        const now = new Date();
        const optimistic: ChecklistItem = {
          id: `${OPTIMISTIC_PREFIX}${vars.clientMutationId ?? newClientMutationId()}`,
          checklistId: vars.checklistId,
          content: vars.content,
          // Sona eklenir — gerçek pozisyon `onSettled` invalidate ile gelir.
          position: 'zzzzzz',
          completed: false,
          completedAt: null,
          completedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        return patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? { ...list, items: [...list.items, optimistic] }
              : list,
          ),
        );
      },
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const deleteItem = useMutation(
    trpc.checklist.item.delete.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? { ...list, items: list.items.filter((item) => item.id !== vars.itemId) }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  if (checklists.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground">{strings.cardDetail.checklistsEmpty}</Text>
    );
  }

  return (
    <View className="gap-4">
      {checklists.map((checklist) => {
        const doneCount = checklist.items.filter((item) => item.completed).length;
        return (
          <View key={checklist.id} className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text
                weight="medium"
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {checklist.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {doneCount}/{checklist.items.length}
              </Text>
            </View>

            {checklist.items.map((item) => {
              const optimistic = item.id.startsWith(OPTIMISTIC_PREFIX);
              return (
                <View key={item.id} className="flex-row items-start gap-2">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.completed, disabled: !canEdit }}
                    disabled={!canEdit || optimistic}
                    onPress={() =>
                      toggleItem.mutate({
                        cardId,
                        checklistId: checklist.id,
                        itemId: item.id,
                        completed: !item.completed,
                        clientMutationId: newClientMutationId(),
                      })
                    }
                    className="pt-0.5 active:opacity-60"
                  >
                    <Icon
                      name={item.completed ? 'check-square' : 'square'}
                      size={16}
                      color={item.completed ? theme.success : theme.mutedForeground}
                    />
                  </Pressable>
                  <Text
                    className={`flex-1 text-sm ${
                      item.completed
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    }`}
                  >
                    {item.content}
                  </Text>
                  {canEdit && !optimistic ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.cardDetail.remove}
                      disabled={deleteItem.isPending}
                      onPress={() =>
                        deleteItem.mutate({
                          cardId,
                          checklistId: checklist.id,
                          itemId: item.id,
                          clientMutationId: newClientMutationId(),
                        })
                      }
                      className="pt-0.5 active:opacity-60"
                    >
                      <Icon name="x" size={15} color={theme.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            {canEdit ? (
              <ChecklistItemComposer
                pending={createItem.isPending}
                onCreate={(content) =>
                  createItem.mutate({
                    cardId,
                    checklistId: checklist.id,
                    content,
                    clientMutationId: newClientMutationId(),
                  })
                }
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Tek kontrol listesinin altındaki "madde ekle" satır-içi girişi. */
function ChecklistItemComposer({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (content: string) => void;
}) {
  const [content, setContent] = useState('');

  const submit = () => {
    const trimmed = content.trim();
    // `checklist.item.create` idempotent değil — uçuştaki istek varken ya da
    // boş içerikle yeni madde gönderme (çift madde oluşmasın).
    if (trimmed.length === 0 || pending) return;
    onCreate(trimmed);
    // Optimistic ekleme anında görünür; alanı hemen temizleyip arka arkaya
    // madde girişine izin ver.
    setContent('');
  };

  return (
    <View className="mt-1 flex-row items-end gap-2">
      <View className="flex-1">
        <TextField
          label={strings.cardDetail.checklistItemAdd}
          placeholder={strings.cardDetail.checklistItemPlaceholder}
          value={content}
          onChangeText={setContent}
          editable={!pending}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </View>
      <View className="w-24">
        <Button
          label={strings.cardDetail.checklistItemAdd}
          onPress={submit}
          pending={pending}
          disabled={content.trim().length === 0 || pending}
        />
      </View>
    </View>
  );
}
