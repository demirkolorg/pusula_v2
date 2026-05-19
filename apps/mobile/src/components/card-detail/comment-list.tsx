import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { SwipeRow } from '@/components/swipe-row';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { EntityAvatar } from '@/components/entity-avatar';
import { TiptapRender } from '@/components/tiptap-render';
import { formatTimestamp } from '@/lib/format-date';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { serializeTiptapDoc, tiptapToPlainText } from '@/lib/tiptap';
import { strings } from '@/lib/strings';

type Comments = RouterOutputs['comment']['list'];
type Comment = Comments[number];

/**
 * Yorum yazarının ad/görsel çözümleyicisi (bkz. kart detay ekranı).
 * `userId` `null` olabilir — misafir (paylaşım linki) yorumu.
 */
export type AuthorResolver = (
  userId: string | null,
) => { name: string | null; image: string | null };

type CommentListProps = {
  cardId: string;
  comments: Comment[];
  resolveAuthor: AuthorResolver;
  /** Oturum kullanıcısı — kendi yorumunu düzenleyebilir/silebilir. */
  currentUserId: string | undefined;
  /** Çağıranın board rolü — `admin` başkasının yorumunu da düzenler/siler. */
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
  /** Çağıran board `member+` ve board aktif mi — düzenle/sil ön koşulu. */
  canEdit: boolean;
};

/**
 * Kart yorumları — yazar + Tiptap gövde + zaman. Faz 7G-4 (DEM-199): yazar
 * (veya board `admin`) kendi/başkasının yorumunu satır-içi düz-metin
 * düzenleyebilir + onaylı silebilir (web `card-detail-comments.tsx` yetki
 * simetrisi; backend `comment.update`/`comment.delete`'te yine doğrular).
 * Mutation'lar optimistic — `comment.list` cache'i anında yamanır, hata olursa
 * geri alınır; `clientMutationId` taşır. Soft-delete edilmiş yorum yer
 * tutucuyla gösterilir, aksiyonları gizlenir.
 */
export function CommentList({
  cardId,
  comments,
  resolveAuthor,
  currentUserId,
  myBoardRole,
  canEdit,
}: CommentListProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const commentsKey = trpc.comment.list.queryKey({ cardId });
  // Üzerinde bir mutation uçuşan yorum — o satırın aksiyonları kilitlenir.
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: commentsKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  const updateComment = useMutation(
    trpc.comment.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: commentsKey });
        const prev = queryClient.getQueryData<Comments>(commentsKey);
        if (prev) {
          queryClient.setQueryData<Comments>(
            commentsKey,
            prev.map((c) =>
              c.id === vars.commentId ? { ...c, body: vars.body, editedAt: new Date() } : c,
            ),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(commentsKey, ctx.prev);
        Alert.alert(strings.cardDetail.commentsTitle, strings.cardDetail.actionError);
      },
      onSettled: (_data, _error, vars) => {
        setBusyCommentId((cur) => (cur === vars.commentId ? null : cur));
        invalidate();
      },
    }),
  );

  const deleteComment = useMutation(
    trpc.comment.delete.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: commentsKey });
        const prev = queryClient.getQueryData<Comments>(commentsKey);
        if (prev) {
          // Soft-delete: satır listede kalır, "Bu yorum silindi." yer tutucusu
          // gösterir — backend `body`'yi de boşaltır (bayat metin sızmaz).
          queryClient.setQueryData<Comments>(
            commentsKey,
            prev.map((c) =>
              c.id === vars.commentId ? { ...c, deletedAt: new Date(), body: '' } : c,
            ),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(commentsKey, ctx.prev);
        Alert.alert(strings.cardDetail.commentsTitle, strings.cardDetail.actionError);
      },
      onSettled: (_data, _error, vars) => {
        setBusyCommentId((cur) => (cur === vars.commentId ? null : cur));
        invalidate();
      },
    }),
  );

  const handleEdit = (comment: Comment, plainText: string) => {
    // Anlamca değişiklik yoksa mutation atma — aktivite akışını / "düzenlendi"
    // damgasını gereksiz kirletmemek için (web `isSameRichText` simetrisi).
    if (plainText === tiptapToPlainText(comment.body)) return;
    setBusyCommentId(comment.id);
    updateComment.mutate({
      cardId,
      commentId: comment.id,
      body: serializeTiptapDoc(plainText),
      clientMutationId: newClientMutationId(),
    });
  };

  const confirmDelete = (comment: Comment) => {
    Alert.alert(
      strings.cardDetail.commentDeleteConfirmTitle,
      strings.cardDetail.commentDeleteConfirmBody,
      [
        { text: strings.cardDetail.cancel, style: 'cancel' },
        {
          text: strings.cardDetail.commentDelete,
          style: 'destructive',
          onPress: () => {
            setBusyCommentId(comment.id);
            deleteComment.mutate({
              cardId,
              commentId: comment.id,
              clientMutationId: newClientMutationId(),
            });
          },
        },
      ],
    );
  };

  return (
    <View className="gap-4">
      {comments.map((comment) => {
        const author = resolveAuthor(comment.authorId);
        const authorName = author.name ?? strings.cardDetail.unknownUser;
        // Optimistic (henüz sunucuya yazılmamış) yorum düzenlenemez/silinemez —
        // `comment.create` cache'e `optimistic-…` id'li geçici satır koyar,
        // bu id ile yapılan istek backend'de bulunamaz.
        const persisted = !comment.id.startsWith('optimistic-');
        const canManage =
          canEdit &&
          persisted &&
          comment.authorId !== null &&
          (comment.authorId === currentUserId || myBoardRole === 'admin');

        return (
          <CommentRow
            key={comment.id}
            comment={comment}
            authorName={authorName}
            authorImage={author.image}
            canManage={canManage}
            busy={busyCommentId === comment.id}
            onEdit={(plainText) => handleEdit(comment, plainText)}
            onDelete={() => confirmDelete(comment)}
          />
        );
      })}
    </View>
  );
}

/**
 * Tek yorum satırı — yazar + zaman + Tiptap gövde (ya da "silindi" yer
 * tutucusu). DEM-224 ile kontrol listesi maddesi (DEM-221) etkileşim
 * simetrisine geçti: yetkili kullanıcıda satır-altı "Düzenle/Sil" buton ikilisi
 * yerine **gövdeye dokun → satır-içi düzenleme**, **sola kaydır → Sil**
 * (`SwipeRow`). Düzenleme `TextArea` ile düz metni Tiptap JSON'a serialize eder
 * (7G deseni). Yetkisi olmayan / silinmiş / optimistic yorumda kaydırma ve
 * gövdeye dokunma etkisizdir. Silme yine `Alert` ile onaylanır.
 */
function CommentRow({
  comment,
  authorName,
  authorImage,
  canManage,
  busy,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  authorName: string;
  authorImage: string | null;
  canManage: boolean;
  busy: boolean;
  onEdit: (plainText: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const deleted = comment.deletedAt != null;

  const startEditing = () => {
    setDraft(tiptapToPlainText(comment.body));
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    onEdit(trimmed);
    // Optimistic — yamalı gövde anında `TiptapRender` ile gösterilir.
    setEditing(false);
  };

  // Gövdeye dokunma → düzenleme (kontrol listesi maddesi simetrisi). Yetki
  // yoksa / silinmişse / düzenleme açıkken / mutation uçuşurken etkisizdir.
  const bodyEditable = canManage && !deleted && !editing && !busy;

  const rowContent = (
    <View className="flex-row gap-3">
      <EntityAvatar name={authorName} image={authorImage} size={32} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text weight="semibold" className="text-sm text-foreground">
            {authorName}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {formatTimestamp(comment.createdAt)}
          </Text>
          {comment.editedAt != null && !deleted ? (
            <Text className="text-xs text-muted-foreground">
              ({strings.cardDetail.editedSuffix})
            </Text>
          ) : null}
        </View>

        {deleted ? (
          <Text className="text-sm text-muted-foreground" style={{ fontStyle: 'italic' }}>
            {strings.cardDetail.deletedComment}
          </Text>
        ) : editing ? (
          <View className="gap-2">
            <TextArea
              value={draft}
              onChangeText={setDraft}
              placeholder={strings.cardDetail.commentPlaceholder}
              editable={!busy}
              autoFocus
              minHeightClassName="min-h-20"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label={strings.cardDetail.cancel}
                  variant="ghost"
                  onPress={() => setEditing(false)}
                  disabled={busy}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={busy ? strings.cardDetail.saving : strings.cardDetail.save}
                  onPress={handleSave}
                  pending={busy}
                  disabled={busy || draft.trim().length === 0}
                />
              </View>
            </View>
          </View>
        ) : bodyEditable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.cardDetail.commentEdit}
            onPress={startEditing}
            // En az 44dp dokunma yüksekliği — kısa tek satır yorumda da
            // gövde rahat hedeflenir.
            className="min-h-11 justify-center active:opacity-70"
          >
            <TiptapRender doc={comment.body} />
          </Pressable>
        ) : (
          <TiptapRender doc={comment.body} />
        )}
      </View>
    </View>
  );

  // Yetkili + silinmemiş yorum → kaydırarak sil; aksi halde düz satır.
  if (!canManage || deleted) return rowContent;

  return (
    <SwipeRow
      onDelete={onDelete}
      deleteLabel={strings.cardDetail.commentDelete}
      // Onay başlığı ("Yorumu sil") aynı zamanda doğru bir erişilebilirlik
      // aksiyon etiketidir — bilinçli yeniden kullanım.
      deleteAccessibilityLabel={strings.cardDetail.commentDeleteConfirmTitle}
      // Düzenleme açıkken / mutation uçuşurken kaydırma devre dışı.
      enabled={!editing && !busy}
    >
      {rowContent}
    </SwipeRow>
  );
}
