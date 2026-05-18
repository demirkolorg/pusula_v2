import { useState } from 'react';
import { FlatList, RefreshControl, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FormMessage } from '@/components/form-message';
import { LoadingScreen } from '@/components/loading-screen';
import { MemberInviteForm } from '@/components/member-invite-form';
import { MemberRow } from '@/components/member-row';
import { boardRoleLabel, canManageBoardMembers } from '@/lib/member-roles';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/** Davet formunda sunulan board rolleri (`admin | member | viewer`). */
const BOARD_INVITE_ROLES = [
  { value: 'admin', label: strings.members.boardRoleAdmin },
  { value: 'member', label: strings.members.boardRoleMember },
  { value: 'viewer', label: strings.members.boardRoleViewer },
] as const;

type BoardInviteRole = (typeof BOARD_INVITE_ROLES)[number]['value'];

/**
 * Faz 7D — board üye listesi ekranı. Üyeler ad + rol rozeti ile salt
 * görüntülenir; workspace owner/admin'den devralınan board admin'leri
 * "Devralındı" rozetiyle işaretlenir. Çağıran board `admin` ise üstte
 * satır-içi davet formu (`board.members.add`) görünür. Çağıranın rolü
 * `board.members.list` içinden kendi `userId`'si eşlenerek bulunur. Kapsam:
 * liste + davet-et (rol değiştir / üye çıkar kapsam dışı).
 */
export default function BoardMembersScreen() {
  const params = useLocalSearchParams<{ boardId: string; title?: string }>();
  const boardId = params.boardId;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const query = useQuery(
    trpc.board.members.list.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );

  const addMember = useMutation(trpc.board.members.add.mutationOptions());

  const header = (
    <Stack.Screen options={{ title: params.title ?? strings.members.boardTitle }} />
  );

  if (!boardId) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.members.loadError}
          description={strings.common.unknownError}
        />
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {header}
        <LoadingScreen />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.members.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => query.refetch()}
            />
          </View>
        </EmptyState>
      </>
    );
  }

  const members = query.data;
  const myRole = members.find((member) => member.userId === currentUserId)?.role;
  const canInvite = canManageBoardMembers(myRole);

  const handleInvite = async (email: string, role: BoardInviteRole) => {
    setSuccessMessage(null);
    // `board.members.add` hesabı olan kullanıcıyı doğrudan ekler (`added`/
    // `added_as_guest`), hesabı yoksa davet gönderir (`invited`) — mesaj buna
    // göre seçilir, "davet gönderildi" yanıltıcı olmasın.
    const result = await addMember.mutateAsync({
      boardId,
      email,
      role,
      clientMutationId: newClientMutationId(),
    });
    await queryClient.invalidateQueries(
      trpc.board.members.list.queryFilter({ boardId }),
    );
    setInviteOpen(false);
    setSuccessMessage(
      result.kind === 'invited' ? strings.members.inviteSuccess : strings.members.memberAdded,
    );
  };

  const listHeader = canInvite ? (
    <View className="gap-3 pb-1">
      {successMessage ? (
        <FormMessage tone="info">{successMessage}</FormMessage>
      ) : null}
      {inviteOpen ? (
        <MemberInviteForm<BoardInviteRole>
          roleOptions={BOARD_INVITE_ROLES}
          defaultRole="member"
          onInvite={handleInvite}
          pending={addMember.isPending}
        />
      ) : null}
      <Button
        label={inviteOpen ? strings.members.inviteCancel : strings.members.inviteToggle}
        variant={inviteOpen ? 'ghost' : 'primary'}
        onPress={() => {
          setInviteOpen((open) => !open);
          setSuccessMessage(null);
        }}
      />
    </View>
  ) : null;

  return (
    <>
      {header}
      <FlatList
        data={members}
        keyExtractor={(member) => member.userId}
        ListHeaderComponent={listHeader}
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
            tintColor={theme.mutedForeground}
          />
        }
        renderItem={({ item }) => (
          <MemberRow
            name={item.name ?? item.email ?? strings.cardDetail.unknownUser}
            image={item.image}
            roleLabel={boardRoleLabel(item.role)}
            inherited={item.inherited}
            inheritedLabel={strings.members.inheritedBadge}
          />
        )}
      />
    </>
  );
}
