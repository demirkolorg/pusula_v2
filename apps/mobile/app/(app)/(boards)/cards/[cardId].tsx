import { useMemo } from 'react';
import { ScrollView, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { TiptapRender } from '@/components/tiptap-render';
import { tiptapHasContent } from '@/lib/tiptap';
import { DetailSection } from '@/components/card-detail/section';
import { ChecklistSection } from '@/components/card-detail/checklist-section';
import { CommentList, type AuthorResolver } from '@/components/card-detail/comment-list';
import { ActivityList } from '@/components/card-detail/activity-list';
import { formatDueDate, isOverdue } from '@/lib/format-date';
import { labelColorHex } from '@/lib/label-color';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Kart detay ekranı — salt-okunur (Faz 7F). Tek ekranda altı paralel sorgu:
 * `card.get` + `card.labels/members/activity.list` + `checklist.list` +
 * `comment.list`. Açıklama ve yorum gövdeleri Tiptap JSON olarak biçimli
 * render edilir. Düzenleme / yorum yazma kapsam dışı.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{ cardId: string; title?: string }>();
  const cardId = params.cardId;
  const trpc = useTRPC();
  const theme = themeFor(useColorScheme());
  const enabled = Boolean(cardId);

  const cardQuery = useQuery(trpc.card.get.queryOptions({ cardId }, { enabled }));
  const labelsQuery = useQuery(trpc.card.labels.list.queryOptions({ cardId }, { enabled }));
  const membersQuery = useQuery(trpc.card.members.list.queryOptions({ cardId }, { enabled }));
  const checklistsQuery = useQuery(trpc.checklist.list.queryOptions({ cardId }, { enabled }));
  const commentsQuery = useQuery(trpc.comment.list.queryOptions({ cardId }, { enabled }));
  const activityQuery = useQuery(trpc.card.activity.list.queryOptions({ cardId }, { enabled }));

  const labels = labelsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const checklists = checklistsQuery.data ?? [];
  const comments = commentsQuery.data ?? [];
  const activity = activityQuery.data ?? [];

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
    const empty = { name: null, image: null };
    return (userId) => (userId ? (map.get(userId) ?? empty) : empty);
  }, [members, activity]);

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
  const overdue = card.dueAt != null && !card.completed && isOverdue(card.dueAt);

  return (
    <>
      {header}
      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
        {/* Başlık + tamamlandı rozeti */}
        <View className="gap-2">
          {card.completed ? (
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-success/15 px-2 py-0.5">
              <Icon name="check-circle" size={13} color={theme.success} />
              <Text weight="medium" className="text-xs text-success">
                {strings.cardDetail.completedBadge}
              </Text>
            </View>
          ) : null}
          <Text weight="semibold" className="text-xl text-foreground">
            {card.title}
          </Text>
        </View>

        {labels.length > 0 ? (
          <DetailSection icon="tag" title={strings.cardDetail.labelsTitle}>
            <View className="flex-row flex-wrap gap-2">
              {labels.map((label) => (
                <View key={label.labelId} className="flex-row items-center gap-1.5">
                  <View
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: labelColorHex(label.color) }}
                  />
                  <Text className="text-sm text-foreground">{label.name}</Text>
                </View>
              ))}
            </View>
          </DetailSection>
        ) : null}

        {card.dueAt != null ? (
          <DetailSection icon="clock" title={strings.cardDetail.dueTitle}>
            <Text className={`text-sm ${overdue ? 'text-destructive' : 'text-foreground'}`}>
              {formatDueDate(card.dueAt)}
            </Text>
          </DetailSection>
        ) : null}

        {members.length > 0 ? (
          <DetailSection icon="users" title={strings.cardDetail.membersTitle}>
            <View className="gap-2">
              {members.map((member) => (
                <View key={member.userId} className="flex-row items-center gap-2">
                  <EntityAvatar name={member.name ?? '?'} image={member.image} size={28} />
                  <Text className="text-sm text-foreground">
                    {member.name ?? strings.cardDetail.unknownUser}
                  </Text>
                </View>
              ))}
            </View>
          </DetailSection>
        ) : null}

        <DetailSection icon="align-left" title={strings.cardDetail.descriptionTitle}>
          {tiptapHasContent(card.description) ? (
            <TiptapRender doc={card.description} />
          ) : (
            <Text className="text-sm text-muted-foreground">
              {strings.cardDetail.noDescription}
            </Text>
          )}
        </DetailSection>

        {checklists.length > 0 || checklistsQuery.isError ? (
          <DetailSection icon="check-square" title={strings.cardDetail.checklistsTitle}>
            {checklistsQuery.isError ? (
              <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
            ) : (
              <ChecklistSection checklists={checklists} />
            )}
          </DetailSection>
        ) : null}

        <DetailSection icon="message-square" title={strings.cardDetail.commentsTitle}>
          {commentsQuery.isError ? (
            <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
          ) : comments.length > 0 ? (
            <CommentList comments={comments} resolveAuthor={resolveAuthor} />
          ) : (
            <Text className="text-sm text-muted-foreground">{strings.cardDetail.noComments}</Text>
          )}
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
    </>
  );
}
