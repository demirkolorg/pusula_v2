import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { Sheet } from '@/components/sheet';
import { AppSpinner } from '@/components/app-spinner';
import { CommentList, type AuthorResolver } from '@/components/card-detail/comment-list';
import { CommentComposer } from '@/components/card-detail/comment-composer';
import { strings } from '@/lib/strings';

type ChecklistItemThreadSheetProps = {
  visible: boolean;
  cardId: string;
  /** Açık olan maddenin id'si; `null` ise sheet kapalı (sorgu da koşmaz). */
  checklistItemId: string | null;
  /** Yorum yazarı ad/görsel çözümleyici (ekrandan akar — kart yorumlarıyla aynı). */
  resolveAuthor: AuthorResolver;
  /** Oturum kullanıcısı — kendi yorumunu düzenleyebilir/silebilir. */
  currentUserId: string | undefined;
  /** Çağıranın board rolü — `admin` başkasının yorumunu da düzenler/siler. */
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
  /**
   * Çağıran board `member+` ve board aktif mi — yorum yazma/düzenleme/silme ön
   * koşulu. `false` (viewer) ise thread salt-okunur açılır: yorumlar görünür,
   * composer gizlidir.
   */
  canComment: boolean;
  onClose: () => void;
};

/**
 * Bir kontrol listesi (yapılacaklar) maddesinin yorum thread'i — web
 * `checklist-item-thread.tsx`'in mobil karşılığı (sohbet baloncuğu deseni:
 * yorumlar üstte liste, composer altta). Web'de satır altına açılan inline
 * thread mobilde **bottom sheet** (Pusula `Sheet` deseni — `move-to-list-sheet`
 * gibi); satır rozetine/maddeye dokununca açılır.
 *
 * Kendi kendine yükler: `comment.list({ cardId, checklistItemId })`. `CommentList`
 * ve `CommentComposer` aynı bileşenler, yalnız `checklistItemId` ile o maddenin
 * thread'ine bağlanır (cache anahtarı ayrı). Backend `comment.list` zaten en
 * eskiden yeniye sıralı döndürür — sohbet akışı (en yeni altta) doğrudan
 * korunur. Madde yorumları da kart yorumları gibi düz metin (7.0 kararı —
 * Tiptap render salt-okunur, yazma `TextArea` ile düz metin serialize).
 *
 * Viewer (`canComment=false`) thread'i açıp okuyabilir; composer gizlidir.
 */
export function ChecklistItemThreadSheet({
  visible,
  cardId,
  checklistItemId,
  resolveAuthor,
  currentUserId,
  myBoardRole,
  canComment,
  onClose,
}: ChecklistItemThreadSheetProps) {
  const trpc = useTRPC();
  // Sheet açık ve madde seçili değilken sorguyu koşturma (kapalı sheet veri
  // çekmesin); `checklistItemId` boş string'e düşürülmez — `enabled` ile kapatılır.
  const enabled = visible && checklistItemId != null;
  const commentsQuery = useQuery(
    trpc.comment.list.queryOptions(
      { cardId, checklistItemId: checklistItemId ?? undefined },
      { enabled },
    ),
  );

  const comments = commentsQuery.data ?? [];

  return (
    <Sheet visible={visible} title={strings.cardDetail.itemCommentsTitle} onClose={onClose}>
      {checklistItemId == null ? null : (
        <View className="gap-3">
          {comments.length > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {strings.cardDetail.itemCommentsCountLabel(comments.length)}
            </Text>
          ) : null}

          {commentsQuery.isPending ? (
            <View className="py-6">
              <AppSpinner label={strings.common.loading} />
            </View>
          ) : commentsQuery.isError ? (
            <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
          ) : comments.length > 0 ? (
            // Thread uzayınca composer'a yer bırakmak için yorum listesi kendi
            // içinde kayar (sheet panel'i ekranı taşırmaz).
            <ScrollView className="max-h-80" contentContainerClassName="gap-4 pb-1">
              <CommentList
                cardId={cardId}
                comments={comments}
                resolveAuthor={resolveAuthor}
                currentUserId={currentUserId}
                myBoardRole={myBoardRole}
                canEdit={canComment}
                checklistItemId={checklistItemId}
              />
            </ScrollView>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {strings.cardDetail.itemCommentsEmpty}
            </Text>
          )}

          {canComment ? (
            <CommentComposer
              cardId={cardId}
              checklistItemId={checklistItemId}
              minHeightClassName="min-h-16"
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
