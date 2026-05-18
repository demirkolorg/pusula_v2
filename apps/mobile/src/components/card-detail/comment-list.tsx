import { View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { EntityAvatar } from '@/components/entity-avatar';
import { TiptapRender } from '@/components/tiptap-render';
import { formatTimestamp } from '@/lib/format-date';
import { strings } from '@/lib/strings';

type Comment = RouterOutputs['comment']['list'][number];

/**
 * Yorum yazarının ad/görsel çözümleyicisi (bkz. kart detay ekranı).
 * `userId` `null` olabilir — misafir (paylaşım linki) yorumu.
 */
export type AuthorResolver = (
  userId: string | null,
) => { name: string | null; image: string | null };

type CommentListProps = {
  comments: Comment[];
  resolveAuthor: AuthorResolver;
};

/**
 * Kart yorumları — yazar + Tiptap gövde + zaman (salt-okunur). Yorum yazma
 * 7F kapsamı dışı. Soft-delete edilmiş yorum yer tutucuyla gösterilir.
 */
export function CommentList({ comments, resolveAuthor }: CommentListProps) {
  return (
    <View className="gap-4">
      {comments.map((comment) => {
        const author = resolveAuthor(comment.authorId);
        const authorName = author.name ?? strings.cardDetail.unknownUser;
        const deleted = comment.deletedAt != null;

        return (
          <View key={comment.id} className="flex-row gap-3">
            <EntityAvatar name={authorName} image={author.image} size={32} />
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
              ) : (
                <TiptapRender doc={comment.body} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
