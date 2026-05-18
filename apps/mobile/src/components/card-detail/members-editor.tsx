import { useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { DetailSection } from '@/components/card-detail/section';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardMembers = RouterOutputs['card']['members']['list'];
type BoardMembers = RouterOutputs['board']['members']['list'];

type MembersEditorProps = {
  cardId: string;
  members: CardMembers;
  /** Aday havuzu — `board.members.list` (pano erişimli kullanıcılar). */
  boardMembers: BoardMembers;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart üyeleri — ekleme/çıkarma (Faz 7G). Yeni üye `assignee` rolüyle eklenir;
 * aday havuzu `board.members.list`. Mutation'lar optimistic — `card.members.list`
 * cache'i anında yamanır, hata olursa geri alınır; her ikisi de idempotent
 * (aynı `(cardId, userId, role)` üçlüsü yeniden eklenince `changed: false`).
 */
export function MembersEditor({ cardId, members, boardMembers, canEdit }: MembersEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const membersKey = trpc.card.members.list.queryKey({ cardId });
  const [adding, setAdding] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: membersKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  const addMember = useMutation(
    trpc.card.members.add.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: membersKey });
        const prev = queryClient.getQueryData<CardMembers>(membersKey);
        const candidate = boardMembers.find((m) => m.userId === vars.userId);
        if (prev && candidate && !prev.some((m) => m.userId === vars.userId)) {
          queryClient.setQueryData<CardMembers>(membersKey, [
            ...prev,
            { userId: candidate.userId, role: vars.role, name: candidate.name, image: candidate.image },
          ]);
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(membersKey, ctx.prev);
        Alert.alert(strings.cardDetail.membersTitle, strings.cardDetail.actionError);
      },
      onSettled: invalidate,
    }),
  );

  const removeMember = useMutation(
    trpc.card.members.remove.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: membersKey });
        const prev = queryClient.getQueryData<CardMembers>(membersKey);
        if (prev) {
          queryClient.setQueryData<CardMembers>(
            membersKey,
            prev.filter((m) => !(m.userId === vars.userId && m.role === vars.role)),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(membersKey, ctx.prev);
        Alert.alert(strings.cardDetail.membersTitle, strings.cardDetail.actionError);
      },
      onSettled: invalidate,
    }),
  );

  // Henüz kart üyesi olmayan pano kullanıcıları (userId bazlı).
  const candidates = boardMembers.filter(
    (boardMember) => !members.some((m) => m.userId === boardMember.userId),
  );

  return (
    <DetailSection icon="users" title={strings.cardDetail.membersTitle}>
      <View className="gap-3">
        {members.length > 0 ? (
          <View className="gap-2">
            {members.map((member) => (
              <View key={`${member.userId}:${member.role}`} className="flex-row items-center gap-2">
                <EntityAvatar name={member.name ?? '?'} image={member.image} size={28} />
                <Text className="flex-1 text-sm text-foreground">
                  {member.name ?? strings.cardDetail.unknownUser}
                </Text>
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.cardDetail.remove}
                    disabled={removeMember.isPending}
                    onPress={() =>
                      removeMember.mutate({
                        cardId,
                        userId: member.userId,
                        role: member.role,
                        clientMutationId: newClientMutationId(),
                      })
                    }
                    className="active:opacity-60"
                  >
                    <Icon name="x" size={16} color={theme.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-muted-foreground">{strings.cardDetail.membersEmpty}</Text>
        )}

        {canEdit ? (
          <View className="gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdding((open) => !open)}
              className="flex-row items-center gap-1.5 self-start active:opacity-70"
            >
              <Icon name={adding ? 'x' : 'plus'} size={14} color={theme.primary} />
              <Text weight="medium" className="text-sm text-primary">
                {adding ? strings.cardDetail.cancel : strings.cardDetail.memberAdd}
              </Text>
            </Pressable>

            {adding ? (
              candidates.length > 0 ? (
                <View className="gap-1">
                  {candidates.map((candidate) => (
                    <Pressable
                      key={candidate.userId}
                      accessibilityRole="button"
                      disabled={addMember.isPending}
                      onPress={() =>
                        addMember.mutate({
                          cardId,
                          userId: candidate.userId,
                          role: 'assignee',
                          clientMutationId: newClientMutationId(),
                        })
                      }
                      className={`flex-row items-center gap-2 rounded-lg px-2 py-1.5 ${
                        addMember.isPending ? 'opacity-50' : 'active:bg-muted'
                      }`}
                    >
                      <EntityAvatar
                        name={candidate.name ?? candidate.email ?? '?'}
                        image={candidate.image}
                        size={28}
                      />
                      <Text className="flex-1 text-sm text-foreground">
                        {candidate.name ?? candidate.email ?? strings.cardDetail.unknownUser}
                      </Text>
                      <Icon name="plus" size={16} color={theme.primary} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground">
                  {strings.cardDetail.memberNoneAvailable}
                </Text>
              )
            ) : null}
          </View>
        ) : null}
      </View>
    </DetailSection>
  );
}
