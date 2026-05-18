import { useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { TiptapRender } from '@/components/tiptap-render';
import { DetailSection } from '@/components/card-detail/section';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { serializeTiptapDoc, tiptapHasContent, tiptapToPlainText } from '@/lib/tiptap';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardGet = RouterOutputs['card']['get'];

type DescriptionEditorProps = {
  cardId: string;
  /** Saklanan açıklama (Tiptap JSON string | legacy düz metin | null). */
  description: string | null;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart açıklaması — salt-okunur Tiptap render + düz-metin düzenleme (Faz 7G).
 * Faz 7.0 kararı: mobilde tam rich editör yok; düzenleme düz metni Tiptap JSON
 * doc'una serialize eder (`serializeTiptapDoc`), tohum metni mevcut değerden
 * `tiptapToPlainText` ile çıkarılır. Mutation optimistic — `card.get` cache'i
 * anında yamanır, hata olursa geri alınır.
 */
export function DescriptionEditor({ cardId, description, canEdit }: DescriptionEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const cardKey = trpc.card.get.queryKey({ cardId });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const updateCard = useMutation(
    trpc.card.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: cardKey });
        const prev = queryClient.getQueryData<CardGet>(cardKey);
        if (prev && typeof vars.description === 'string') {
          queryClient.setQueryData<CardGet>(cardKey, {
            ...prev,
            card: { ...prev.card, description: vars.description },
          });
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(cardKey, ctx.prev);
        Alert.alert(strings.cardDetail.descriptionTitle, strings.cardDetail.actionError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: cardKey });
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
      },
    }),
  );

  const startEditing = () => {
    setDraft(tiptapToPlainText(description));
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    // Anlamca değişiklik yoksa mutation atma — aktivite akışını / "düzenlendi"
    // damgasını gereksiz kirletmemek için (web `isSameRichText` simetrisi).
    if (trimmed === tiptapToPlainText(description)) {
      setEditing(false);
      return;
    }
    updateCard.mutate(
      {
        cardId,
        description: trimmed.length > 0 ? serializeTiptapDoc(trimmed) : '',
        clientMutationId: newClientMutationId(),
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <DetailSection icon="align-left" title={strings.cardDetail.descriptionTitle}>
      {editing ? (
        <View className="gap-2">
          <TextArea
            value={draft}
            onChangeText={setDraft}
            placeholder={strings.cardDetail.descriptionPlaceholder}
            editable={!updateCard.isPending}
            autoFocus
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label={strings.cardDetail.cancel}
                variant="ghost"
                onPress={() => setEditing(false)}
                disabled={updateCard.isPending}
              />
            </View>
            <View className="flex-1">
              <Button
                label={updateCard.isPending ? strings.cardDetail.saving : strings.cardDetail.save}
                onPress={handleSave}
                pending={updateCard.isPending}
                disabled={updateCard.isPending}
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-2">
          {tiptapHasContent(description) ? (
            <TiptapRender doc={description} />
          ) : (
            <Text className="text-sm text-muted-foreground">
              {strings.cardDetail.noDescription}
            </Text>
          )}
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              onPress={startEditing}
              className="flex-row items-center gap-1.5 self-start active:opacity-70"
            >
              <Icon name="edit-2" size={13} color={theme.primary} />
              <Text weight="medium" className="text-sm text-primary">
                {strings.cardDetail.descriptionEdit}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </DetailSection>
  );
}
