import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardRole } from '@pusula/domain';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FormMessage } from '@/components/form-message';
import { LoadingScreen } from '@/components/loading-screen';
import { MemberActionSheet } from '@/components/member-action-sheet';
import { MemberInviteForm } from '@/components/member-invite-form';
import { MemberRow } from '@/components/member-row';
import { ScreenHeader } from '@/components/screen-header';
import { SentInvitationRow } from '@/components/sent-invitation-row';
import { Text } from '@/components/text';
import { boardRoleLabel, canManageBoardMembers } from '@/lib/member-roles';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { useBoardMemberMutations } from '@/lib/use-member-mutations';
import { useTheme } from '@/theme/theme-provider';

/** Davet/rol seçiminde sunulan board rolleri (`admin | member | viewer`). */
const BOARD_INVITE_ROLES = [
  { value: 'admin', label: strings.members.boardRoleAdmin },
  { value: 'member', label: strings.members.boardRoleMember },
  { value: 'viewer', label: strings.members.boardRoleViewer },
] as const satisfies readonly { value: BoardRole; label: string }[];

type BoardMemberTarget = {
  userId: string;
  role: BoardRole;
  name: string | null;
  email: string | null;
};

/**
 * Faz 7D — board üye listesi ekranı; DEM-210 ile üye yönetimi tamamlandı.
 * Üyeler ad + rol rozeti ile listelenir; workspace owner/admin'den devralınan
 * board admin'leri "Devralındı" rozetiyle işaretlenir. Çağıran board `admin`
 * ise üstte davet formu + altta gönderilen davetler ve her *açık* (devralınmamış)
 * üyenin satırında ⋮ aksiyon yüzeyi (rol değiştir / üye çıkar) görünür.
 * Devralınan üye ve çağıranın kendi satırında aksiyon gösterilmez — devralınan
 * board rolü buradan değiştirilemez (web kuralı; backend de reddeder).
 */
export default function BoardMembersScreen() {
  const params = useLocalSearchParams<{ boardId: string; title?: string }>();
  const boardId = params.boardId;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Davet iptali hatası — `MemberActionSheet` kendi hatasını içeride gösterir,
  // davet satırının (footer) ayrı bir hata yüzeyi yok; burada tutulur.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMember, setActionMember] = useState<BoardMemberTarget | null>(null);

  const query = useQuery(
    trpc.board.members.list.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );

  const addMember = useMutation(trpc.board.members.add.mutationOptions());
  const memberMutations = useBoardMemberMutations(boardId);

  const invitationsQuery = useQuery(
    trpc.board.invitations.list.queryOptions({ boardId }, { enabled: Boolean(boardId) }),
  );

  const header = <ScreenHeader title={params.title ?? strings.members.boardTitle} />;

  if (!boardId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="alert-triangle"
          title={strings.members.loadError}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  if (query.isPending) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {header}
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
      </SafeAreaView>
    );
  }

  const members = query.data;
  const myRole = members.find((member) => member.userId === currentUserId)?.role;
  const canManage = canManageBoardMembers(myRole);

  const handleInvite = async (email: string, role: BoardRole) => {
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
    await queryClient.invalidateQueries(
      trpc.board.invitations.list.queryFilter({ boardId }),
    );
    setInviteOpen(false);
    setSuccessMessage(
      result.kind === 'invited' ? strings.members.inviteSuccess : strings.members.memberAdded,
    );
  };

  // Gönderilen davetler — yalnız board `admin` görür.
  const pendingInvitations = canManage ? (invitationsQuery.data ?? []) : [];

  const listHeader = canManage ? (
    <View className="gap-3 pb-1">
      {successMessage ? (
        <FormMessage tone="info">{successMessage}</FormMessage>
      ) : null}
      {inviteOpen ? (
        <MemberInviteForm<BoardRole>
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

  const listFooter =
    canManage && pendingInvitations.length > 0 ? (
      <View className="gap-3 pt-3">
        <Text weight="semibold" className="text-xs uppercase text-muted-foreground">
          {strings.invitations.sentSectionTitle}
        </Text>
        {errorMessage ? <FormMessage>{errorMessage}</FormMessage> : null}
        {pendingInvitations.map((invitation) => (
          <SentInvitationRow
            key={invitation.id}
            email={invitation.email}
            roleLabel={boardRoleLabel(invitation.role)}
            invitedByName={invitation.invitedByName}
            pending={memberMutations.invitationPending(invitation.id)}
            onCancel={() => {
              setErrorMessage(null);
              memberMutations.cancelInvitation(invitation.id).catch(() => {
                setErrorMessage(strings.invitations.actionError);
              });
            }}
          />
        ))}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {header}
      <FlatList
        data={members}
        keyExtractor={(member) => member.userId}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
            tintColor={theme.mutedForeground}
          />
        }
        renderItem={({ item }) => {
          // Devralınan (workspace owner/admin) üyenin board rolü buradan
          // değiştirilemez; çağıran kendi satırında aksiyon görmez.
          const isSelf = item.userId === currentUserId;
          const showActions =
            canManage && Boolean(currentUserId) && !item.inherited && !isSelf;
          return (
            <MemberRow
              name={item.name ?? item.email ?? strings.cardDetail.unknownUser}
              image={item.image}
              roleLabel={boardRoleLabel(item.role)}
              inherited={item.inherited}
              inheritedLabel={strings.members.inheritedBadge}
              isSelf={isSelf}
              onActions={
                showActions
                  ? () =>
                      setActionMember({
                        userId: item.userId,
                        role: item.role,
                        name: item.name,
                        email: item.email,
                      })
                  : undefined
              }
            />
          );
        }}
      />
      {actionMember ? (
        <MemberActionSheet<BoardRole>
          visible
          memberName={
            actionMember.name ?? actionMember.email ?? strings.cardDetail.unknownUser
          }
          roleOptions={BOARD_INVITE_ROLES}
          currentRole={actionMember.role}
          pending={memberMutations.memberPending(actionMember.userId)}
          onChangeRole={(role) => memberMutations.changeRole(actionMember.userId, role)}
          onRemove={() => memberMutations.remove(actionMember.userId)}
          onClose={() => setActionMember(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
