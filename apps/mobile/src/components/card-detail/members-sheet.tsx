import { Alert, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CardMembers = RouterOutputs['card']['members']['list'];
type BoardMembers = RouterOutputs['board']['members']['list'];

type MembersSheetBodyProps = {
  cardId: string;
  members: CardMembers;
  /** Aday havuzu — `board.members.list` (pano erişimli kullanıcılar). */
  boardMembers: BoardMembers;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

/**
 * Kart üyeleri — bottom sheet gövdesi (Faz 7G-2; eski `members-editor`). Mevcut
 * üyeler kaldırılabilir satırlar; `canEdit` ise eklenebilir pano üyeleri
 * (`board.members.list`) doğrudan listelenir — sheet zaten düzenleme yüzeyi
 * olduğundan ayrı "ekle" toggle'ı yok. Yeni üye `assignee` rolüyle eklenir.
 * Mutation'lar optimistic — `card.members.list` cache'i anında yamanır, hata
 * olursa geri alınır; her ikisi de idempotent.
 */
export function MembersSheetBody({ cardId, members, boardMembers, canEdit }: MembersSheetBodyProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const membersKey = trpc.card.members.list.queryKey({ cardId });

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

  /** Onaylı kart üyesi çıkarma — küçük `x`'e yanlış dokunmada anında kaybı önler. */
  const confirmRemoveMember = (member: CardMembers[number]) => {
    Alert.alert(
      strings.cardDetail.memberRemoveConfirmTitle,
      strings.cardDetail.memberRemoveConfirmBody,
      [
        { text: strings.cardDetail.cancel, style: 'cancel' },
        {
          text: strings.cardDetail.memberRemoveAction,
          style: 'destructive',
          onPress: () =>
            removeMember.mutate({
              cardId,
              userId: member.userId,
              role: member.role,
              clientMutationId: newClientMutationId(),
            }),
        },
      ],
    );
  };

  // Henüz kart üyesi olmayan pano kullanıcıları (userId bazlı).
  const candidates = boardMembers.filter(
    (boardMember) => !members.some((m) => m.userId === boardMember.userId),
  );

  return (
    <View className="gap-4">
      {members.length > 0 ? (
        <View className="gap-2">
          {members.map((member) => (
            <View
              key={`${member.userId}:${member.role}`}
              className="min-h-12 flex-row items-center gap-2"
            >
              <EntityAvatar name={member.name ?? '?'} image={member.image} size={28} />
              <Text className="flex-1 text-sm text-foreground">
                {member.name ?? strings.cardDetail.unknownUser}
              </Text>
              {canEdit ? (
                <Pressable
                  accessibilityRole="button"
                  // Onay başlığı ("Üyeyi çıkar") doğru a11y aksiyon etiketi —
                  // bilinçli yeniden kullanım.
                  accessibilityLabel={strings.cardDetail.memberRemoveConfirmTitle}
                  disabled={removeMember.isPending}
                  onPress={() => confirmRemoveMember(member)}
                  hitSlop={8}
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Icon name="x" size={18} color={theme.mutedForeground} />
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
          <Text weight="semibold" className="text-xs uppercase text-muted-foreground">
            {strings.cardDetail.memberAdd}
          </Text>
          {candidates.length > 0 ? (
            <ScrollView className="max-h-72" contentContainerClassName="gap-1">
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
                  className={`min-h-12 flex-row items-center gap-2 rounded-lg px-2 py-2 ${
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
            </ScrollView>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {strings.cardDetail.memberNoneAvailable}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
