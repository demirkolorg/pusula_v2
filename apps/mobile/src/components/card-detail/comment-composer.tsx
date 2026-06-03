import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/button';
import { TextArea } from '@/components/text-area';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { bumpChecklistItemCommentCount } from '@/lib/checklist-comment-cache';
import { serializeTiptapDoc } from '@/lib/tiptap';
import { strings } from '@/lib/strings';

type Comments = RouterOutputs['comment']['list'];

type CommentComposerProps = {
  cardId: string;
  /**
   * Verilirse yorum bu kontrol listesi (yapılacaklar) maddesine bağlanır
   * (madde thread'i); aksi halde klasik kart yorumu olur. Cache anahtarı ve
   * optimistic satırın `checklistItemId`'si buna göre ayarlanır.
   */
  checklistItemId?: string;
  /** Gönderim sonrası (örn. thread sheet'inde) ekstra yan etki. */
  onSubmitted?: () => void;
  /** Composer giriş alanının minimum yüksekliği — kompakt thread'de daha düşük. */
  minHeightClassName?: string;
};

/**
 * Yorum yazma alanı (Faz 7G). Düz metin Tiptap JSON doc'una serialize edilir
 * (Faz 7.0 — mobilde tam rich editör yok). Mutation optimistic: yeni yorum
 * geçici bir kayıt olarak `comment.list` cache'ine eklenir, hata olursa geri
 * alınır; `clientMutationId` taşır. Board `viewer` için ekran bu bileşeni hiç
 * render etmez (yorum yazma board `member+` ister).
 *
 * `checklistItemId` verildiğinde aynı bileşen bir kontrol listesi maddesinin
 * yorum thread'ine yazar: cache anahtarı `{ cardId, checklistItemId }` olur ve
 * optimistic ekleme `checklist.list` cache'indeki o maddenin `commentCount`'unu
 * +1 yamalar (madde satırı rozeti anında güncellensin); `onSettled` invalidate
 * gerçek sayıyı sunucudan tazeler.
 */
export function CommentComposer({
  cardId,
  checklistItemId,
  onSubmitted,
  minHeightClassName = 'min-h-20',
}: CommentComposerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  // Madde thread'i ise o maddenin thread cache'i; aksi halde kart yorum cache'i.
  const commentsKey = trpc.comment.list.queryKey({ cardId, checklistItemId });
  const [draft, setDraft] = useState('');

  const createComment = useMutation(
    trpc.comment.create.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: commentsKey });
        const prev = queryClient.getQueryData<Comments>(commentsKey);
        const now = new Date();
        const optimistic: Comments[number] = {
          id: `optimistic-${vars.clientMutationId ?? newClientMutationId()}`,
          cardId,
          // Madde thread'inde maddeye bağlı; kart yorumunda `null`.
          checklistItemId: checklistItemId ?? null,
          authorId: session?.user.id ?? null,
          body: vars.body,
          editedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        queryClient.setQueryData<Comments>(commentsKey, [...(prev ?? []), optimistic]);
        // Madde thread'i ise satır rozetini anında +1 yama (gerçek sayı
        // `onSettled` invalidate ile gelir).
        const prevCount = checklistItemId
          ? bumpChecklistItemCommentCount(queryClient, trpc, cardId, checklistItemId, +1)
          : undefined;
        return { prev, prevCount };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(commentsKey, ctx.prev);
        // Rozet yamasını da geri al.
        if (checklistItemId && ctx?.prevCount) ctx.prevCount();
        Alert.alert(strings.cardDetail.commentsTitle, strings.cardDetail.actionError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: commentsKey });
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
        // Madde thread'inde satır rozetini sunucu değeriyle tazele.
        if (checklistItemId) {
          void queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId }));
        }
      },
    }),
  );

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    createComment.mutate(
      {
        cardId,
        checklistItemId,
        body: serializeTiptapDoc(trimmed),
        clientMutationId: newClientMutationId(),
      },
      {
        onSuccess: () => {
          setDraft('');
          onSubmitted?.();
        },
      },
    );
  };

  return (
    <View className="gap-2">
      <TextArea
        value={draft}
        onChangeText={setDraft}
        placeholder={strings.cardDetail.commentPlaceholder}
        editable={!createComment.isPending}
        minHeightClassName={minHeightClassName}
      />
      <Button
        label={
          createComment.isPending
            ? strings.cardDetail.commentSubmitting
            : strings.cardDetail.commentSubmit
        }
        onPress={handleSubmit}
        pending={createComment.isPending}
        // `comment.create` idempotent değil — uçuştaki istek varken yeni
        // gönderimi engelle, çift yorum/aktivite oluşmasın.
        disabled={draft.trim().length === 0 || createComment.isPending}
      />
    </View>
  );
}
