import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/button';
import { TextArea } from '@/components/text-area';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { serializeTiptapDoc } from '@/lib/tiptap';
import { strings } from '@/lib/strings';

type Comments = RouterOutputs['comment']['list'];

/**
 * Yorum yazma alanı (Faz 7G). Düz metin Tiptap JSON doc'una serialize edilir
 * (Faz 7.0 — mobilde tam rich editör yok). Mutation optimistic: yeni yorum
 * geçici bir kayıt olarak `comment.list` cache'ine eklenir, hata olursa geri
 * alınır; `clientMutationId` taşır. Board `viewer` için ekran bu bileşeni hiç
 * render etmez (yorum yazma board `member+` ister).
 */
export function CommentComposer({ cardId }: { cardId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const commentsKey = trpc.comment.list.queryKey({ cardId });
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
          // Kart yorumu — bir checklist maddesine bağlı değil.
          checklistItemId: null,
          authorId: session?.user.id ?? null,
          body: vars.body,
          editedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        queryClient.setQueryData<Comments>(commentsKey, [...(prev ?? []), optimistic]);
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(commentsKey, ctx.prev);
        Alert.alert(strings.cardDetail.commentsTitle, strings.cardDetail.actionError);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: commentsKey });
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
      },
    }),
  );

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    createComment.mutate(
      { cardId, body: serializeTiptapDoc(trimmed), clientMutationId: newClientMutationId() },
      { onSuccess: () => setDraft('') },
    );
  };

  return (
    <View className="gap-2">
      <TextArea
        value={draft}
        onChangeText={setDraft}
        placeholder={strings.cardDetail.commentPlaceholder}
        editable={!createComment.isPending}
        minHeightClassName="min-h-20"
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
