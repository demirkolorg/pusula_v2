import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { LoadingScreen } from '@/components/loading-screen';
import { MoveToListSheet } from '@/components/move-to-list-sheet';
import { isPendingId } from '@/lib/client-mutation-id';
import { useCardMutations } from '@/lib/use-card-mutations';
import { DetailSection } from '@/components/card-detail/section';
import { DescriptionEditor } from '@/components/card-detail/description-editor';
import { LabelsEditor } from '@/components/card-detail/labels-editor';
import { DueDateEditor } from '@/components/card-detail/due-date-editor';
import { MembersEditor } from '@/components/card-detail/members-editor';
import { ChecklistSection } from '@/components/card-detail/checklist-section';
import { CommentList, type AuthorResolver } from '@/components/card-detail/comment-list';
import { CommentComposer } from '@/components/card-detail/comment-composer';
import { ActivityList } from '@/components/card-detail/activity-list';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Kart detay ekranı (Faz 7G — tam etkileşim). Faz 7F salt-okunur görünümünü
 * düzenleme aksiyonlarıyla genişletir: açıklama düz-metin düzenleme, etiket /
 * üye / son tarih ekle-çıkar, checklist madde işaretle/ekle/sil, yorum yazma.
 * Tüm yazma işlemleri collaborative mutation — optimistic UI + rollback +
 * `clientMutationId` (alt bileşenlerde). Düzenleme yetkisi (`canEdit`) board
 * `member+` rolüne bağlı; rol `board.members.list`'ten çözümlenir (web kart
 * modalı simetrisi — çözülene dek `viewer` varsayılır, salt-okunur).
 *
 * Faz 7H başlık düzenlemeyi (`card.update`) ve "move to list" picker'ı
 * (`card.moveToList`) ekler — `useCardMutations` ile optimistic + rollback.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{ cardId: string; title?: string }>();
  const cardId = params.cardId;
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id;
  const enabled = Boolean(cardId);

  const cardQuery = useQuery(trpc.card.get.queryOptions({ cardId }, { enabled }));
  const labelsQuery = useQuery(trpc.card.labels.list.queryOptions({ cardId }, { enabled }));
  const membersQuery = useQuery(trpc.card.members.list.queryOptions({ cardId }, { enabled }));
  const checklistsQuery = useQuery(trpc.checklist.list.queryOptions({ cardId }, { enabled }));
  const commentsQuery = useQuery(trpc.comment.list.queryOptions({ cardId }, { enabled }));
  const activityQuery = useQuery(trpc.card.activity.list.queryOptions({ cardId }, { enabled }));

  // Pano üye listesi — hem kart üyesi aday havuzu hem çağıranın board rolü
  // (düzenleme yetkisi). `boardId` ancak kart yüklenince bilinir.
  const boardId = cardQuery.data?.card.boardId;
  const boardMembersQuery = useQuery(
    trpc.board.members.list.queryOptions(
      { boardId: boardId ?? '' },
      { enabled: Boolean(boardId) },
    ),
  );
  // Board verisi — "move to list" picker'ı için aktif liste havuzu (Faz 7H).
  const boardQuery = useQuery(
    trpc.board.get.queryOptions({ boardId: boardId ?? '' }, { enabled: Boolean(boardId) }),
  );

  // Faz 7H — başlık düzenleme + "move to list" mutation'ları.
  const cardMutations = useCardMutations(cardId, boardId ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const labels = labelsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const checklists = checklistsQuery.data ?? [];
  const comments = commentsQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const boardMembers = boardMembersQuery.data ?? [];

  // Çağıranın board rolü → düzenleme yetkisi (board `member+`). Üye listesinde
  // bulunamazsa `viewer` varsayılır (salt-okunur) — web kart modalı simetrisi.
  const myBoardRole = boardMembers.find((m) => m.userId === currentUserId)?.role;
  const canEdit = myBoardRole === 'admin' || myBoardRole === 'member';

  // Yorum yazarı çözümleyici: `comment.list` yalnız `authorId` döndürür —
  // ad/görsel kart üyelerinden + aktivite aktörlerinden toplanır.
  const resolveAuthor = useMemo<AuthorResolver>(() => {
    const map = new Map<string, { name: string | null; image: string | null }>();
    for (const member of members) {
      map.set(member.userId, { name: member.name, image: member.image });
    }
    // `actorId` kullanıcı silinince `null` olabilir; `null` aktörleri atla.
    for (const event of activity) {
      if (event.actorId && !map.has(event.actorId)) {
        map.set(event.actorId, { name: event.actorName, image: event.actorImage });
      }
    }
    // Optimistic yorum yazarı çağıranın kendisi olabilir; kart üyesi/aktör
    // değilse haritada yer almaz — oturum bilgisinden ekle, aksi halde yeni
    // yorum kısa süreliğine "Bir kullanıcı" görünür.
    if (currentUserId && !map.has(currentUserId)) {
      map.set(currentUserId, {
        name: session?.user.name ?? null,
        image: session?.user.image ?? null,
      });
    }
    const empty = { name: null, image: null };
    return (userId) => (userId ? (map.get(userId) ?? empty) : empty);
  }, [members, activity, currentUserId, session?.user.name, session?.user.image]);

  const header = (
    <Stack.Screen options={{ title: params.title ?? strings.cardDetail.fallbackTitle }} />
  );

  if (!cardId) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.cardDetail.loadError}
          description={strings.common.unknownError}
        />
      </>
    );
  }

  if (cardQuery.isPending) {
    return (
      <>
        {header}
        <LoadingScreen />
      </>
    );
  }

  if (cardQuery.isError) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.cardDetail.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => cardQuery.refetch()}
            />
          </View>
        </EmptyState>
      </>
    );
  }

  const card = cardQuery.data.card;
  // "move to list" picker hedef havuzu — board'un aktif, kalıcı listeleri (Faz 7H).
  const boardLists = (boardQuery.data?.lists ?? []).filter(
    (list) => list.archivedAt == null && !isPendingId(list.id),
  );

  return (
    <>
      {header}
      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
        {/* Başlık + tamamlandı rozeti — başlık board `member+` için düzenlenebilir (Faz 7H). */}
        <View className="gap-2">
          {card.completed ? (
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-success/15 px-2 py-0.5">
              <Icon name="check-circle" size={13} color={theme.success} />
              <Text weight="medium" className="text-xs text-success">
                {strings.cardDetail.completedBadge}
              </Text>
            </View>
          ) : null}
          {canEdit && editingTitle ? (
            <InlineComposer
              placeholder={strings.cardDetail.titlePlaceholder}
              submitLabel={strings.common.save}
              initialValue={card.title}
              onSubmit={(title) => {
                cardMutations.updateTitle(title);
                setEditingTitle(false);
              }}
              onCancel={() => setEditingTitle(false)}
            />
          ) : (
            <Pressable
              accessibilityRole={canEdit ? 'button' : undefined}
              accessibilityLabel={canEdit ? strings.cardDetail.editTitleLabel : undefined}
              disabled={!canEdit}
              onPress={() => setEditingTitle(true)}
              className={`flex-row items-start gap-2 ${canEdit ? 'active:opacity-60' : ''}`}
            >
              <Text weight="semibold" className="flex-1 text-xl text-foreground">
                {card.title}
              </Text>
              {canEdit ? (
                <Icon name="edit-3" size={16} color={theme.mutedForeground} />
              ) : null}
            </Pressable>
          )}
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setMoveOpen(true)}
              className="mt-1 flex-row items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 active:opacity-70"
            >
              <Icon name="corner-up-right" size={16} color={theme.foreground} />
              <Text className="text-sm text-foreground">{strings.cardDetail.moveAction}</Text>
            </Pressable>
          ) : null}
        </View>

        <LabelsEditor
          cardId={card.id}
          boardId={card.boardId}
          labels={labels}
          canEdit={canEdit}
        />

        <DueDateEditor
          cardId={card.id}
          dueAt={card.dueAt}
          completed={card.completed}
          canEdit={canEdit}
        />

        <MembersEditor
          cardId={card.id}
          members={members}
          boardMembers={boardMembers}
          canEdit={canEdit}
        />

        <DescriptionEditor cardId={card.id} description={card.description} canEdit={canEdit} />

        <DetailSection icon="check-square" title={strings.cardDetail.checklistsTitle}>
          {checklistsQuery.isError ? (
            <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
          ) : (
            <ChecklistSection cardId={card.id} checklists={checklists} canEdit={canEdit} />
          )}
        </DetailSection>

        <DetailSection icon="message-square" title={strings.cardDetail.commentsTitle}>
          <View className="gap-4">
            {commentsQuery.isError ? (
              <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
            ) : comments.length > 0 ? (
              <CommentList comments={comments} resolveAuthor={resolveAuthor} />
            ) : (
              <Text className="text-sm text-muted-foreground">
                {strings.cardDetail.noComments}
              </Text>
            )}
            {canEdit ? <CommentComposer cardId={card.id} /> : null}
          </View>
        </DetailSection>

        <DetailSection icon="activity" title={strings.cardDetail.activityTitle}>
          {activityQuery.isError ? (
            <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
          ) : activity.length > 0 ? (
            <ActivityList events={activity} />
          ) : (
            <Text className="text-sm text-muted-foreground">{strings.cardDetail.noActivity}</Text>
          )}
        </DetailSection>
      </ScrollView>

      <MoveToListSheet
        visible={moveOpen}
        lists={boardLists}
        currentListId={card.listId}
        onSelect={(listId) => {
          cardMutations.moveToList(listId);
          setMoveOpen(false);
        }}
        onClose={() => setMoveOpen(false)}
      />
    </>
  );
}
