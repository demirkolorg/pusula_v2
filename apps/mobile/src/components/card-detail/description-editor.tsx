import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { TiptapRender } from '@/components/tiptap-render';
import { SectionHeader, SectionHeaderAction } from '@/components/card-detail/section';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { serializeTiptapDoc, tiptapHasContent, tiptapToPlainText } from '@/lib/tiptap';
import { strings } from '@/lib/strings';

/** "Daha fazla göster" eşiği — düz metin uzunluğu (Tiptap içeriğinden çıkarılır). */
const DESCRIPTION_TRUNCATE_LIMIT = 500;

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
 *
 * DEM-2026-05-26 — bileşen kendini `DetailSection` ile sarmayı bırakır;
 * `DescriptionChecklistTabs` içinde sekme zemini ortak. Okuma modunda düz metin
 * `DESCRIPTION_TRUNCATE_LIMIT` (500) karakteri aşarsa `numberOfLines` ile
 * kısıtlanır + "Daha fazla göster" toggle. Düzenleme modunda kısıtlama yok.
 */
export function DescriptionEditor({ cardId, description, canEdit }: DescriptionEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cardKey = trpc.card.get.queryKey({ cardId });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

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

  // Truncation kararı düz metin uzunluğundan; uzunsa kapsayıcı `maxHeight` +
  // `overflow: hidden` ile kısıtla — TiptapRender çoklu blok ürettiği için tek
  // `numberOfLines` prop'u uygulanamıyor; görsel kesim wrapper seviyesinde.
  // "Daha fazla göster" (artık header'da) tıklanınca kısıt kaldırılır.
  const plainText = tiptapToPlainText(description);
  const isTruncatable = plainText.length > DESCRIPTION_TRUNCATE_LIMIT;
  const showCollapsed = isTruncatable && !expanded;

  return (
    // Kendi kart yüzeyi + başlık (2026-06-20). Başlıkta solda "Açıklama", sağda
    // "Daha fazla göster" (uzun metinde) + "Düzenle" (member+). Düzenleme modunda
    // header aksiyonsuz — gövde düzenleme formuna döner.
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      <SectionHeader
        icon="align-left"
        title={strings.cardDetail.descriptionTitle}
        actions={
          editing ? undefined : (
            // gap-5 — iki aksiyonun hitSlop'ları (±8) çakışıp yanlış butona
            // basılmasını önler ("Daha fazla göster" ↔ "Düzenle").
            <View className="flex-row items-center gap-5">
              {isTruncatable ? (
                <SectionHeaderAction
                  icon={expanded ? 'chevron-up' : 'chevron-down'}
                  label={
                    expanded
                      ? strings.cardDetail.descriptionShowLess
                      : strings.cardDetail.descriptionShowMore
                  }
                  onPress={() => setExpanded((prev) => !prev)}
                />
              ) : null}
              {canEdit ? (
                <SectionHeaderAction
                  icon="edit-2"
                  label={strings.cardDetail.descriptionEdit}
                  onPress={startEditing}
                />
              ) : null}
            </View>
          )
        }
      />

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
      ) : tiptapHasContent(description) ? (
        <View style={showCollapsed ? { maxHeight: 200, overflow: 'hidden' } : undefined}>
          <TiptapRender doc={description} />
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">{strings.cardDetail.noDescription}</Text>
      )}
    </View>
  );
}
