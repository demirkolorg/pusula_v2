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
import { MemberActionSheet } from '@/components/member-action-sheet';
import { MemberInviteForm } from '@/components/member-invite-form';
import { MemberRow } from '@/components/member-row';
import { SentInvitationRow } from '@/components/sent-invitation-row';
import { Text } from '@/components/text';
import { canManageWorkspaceMembers, workspaceRoleLabel } from '@/lib/member-roles';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import {
  useWorkspaceMemberMutations,
  type AssignableWorkspaceRole,
} from '@/lib/use-member-mutations';
import { themeFor } from '@/theme/tokens';

/** Davet/rol seçiminde sunulan workspace rolleri (`owner` atanamaz — domain kuralı). */
const WORKSPACE_INVITE_ROLES = [
  { value: 'admin', label: strings.members.roleAdmin },
  { value: 'member', label: strings.members.roleMember },
  { value: 'guest', label: strings.members.roleGuest },
] as const;

type WorkspaceMember = { userId: string; role: AssignableWorkspaceRole | 'owner'; name: string | null; email: string };

/**
 * Faz 7D — workspace üye listesi ekranı; DEM-210 ile üye yönetimi tamamlandı.
 * Üyeler ad + rol rozeti ile listelenir; çağıran `admin+` ise üstte davet
 * formu + altta gönderilen davetler ve her satırda ⋮ aksiyon yüzeyi (rol
 * değiştir / üye çıkar) görünür. `owner` satırı ve çağıranın kendi satırında
 * aksiyon gösterilmez (web simetrisi — `owner` rolü ayrıca devir gerektirir).
 */
export default function WorkspaceMembersScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const workspaceId = params.id;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Davet iptali hatası — `MemberActionSheet` kendi hatasını içeride gösterir,
  // davet satırının (footer) ayrı bir hata yüzeyi yok; burada tutulur.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMember, setActionMember] = useState<WorkspaceMember | null>(null);

  const query = useQuery(
    trpc.workspace.members.list.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );

  const invite = useMutation(trpc.workspace.members.invite.mutationOptions());
  const memberMutations = useWorkspaceMemberMutations(workspaceId);

  const invitationsQuery = useQuery(
    trpc.workspace.invitations.list.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );

  const header = (
    <Stack.Screen
      options={{ title: params.name ?? strings.members.workspaceTitle }}
    />
  );

  if (!workspaceId) {
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
  const canManage = canManageWorkspaceMembers(myRole);

  const handleInvite = async (email: string, role: AssignableWorkspaceRole) => {
    setSuccessMessage(null);
    await invite.mutateAsync({
      workspaceId,
      email,
      role,
      clientMutationId: newClientMutationId(),
    });
    await queryClient.invalidateQueries(
      trpc.workspace.members.list.queryFilter({ workspaceId }),
    );
    await queryClient.invalidateQueries(
      trpc.workspace.invitations.list.queryFilter({ workspaceId }),
    );
    setInviteOpen(false);
    setSuccessMessage(strings.members.inviteSuccess);
  };

  // Gönderilen davetler — yalnız `admin+` görür; veri varsa liste altına eklenir.
  const pendingInvitations = canManage ? (invitationsQuery.data ?? []) : [];

  const listHeader = canManage ? (
    <View className="gap-3 pb-1">
      {successMessage ? (
        <FormMessage tone="info">{successMessage}</FormMessage>
      ) : null}
      {inviteOpen ? (
        <MemberInviteForm<AssignableWorkspaceRole>
          roleOptions={WORKSPACE_INVITE_ROLES}
          defaultRole="member"
          onInvite={handleInvite}
          pending={invite.isPending}
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
            roleLabel={workspaceRoleLabel(invitation.role)}
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
    <>
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
          // `owner` rolü değiştirilemez (devir gerektirir); çağıran kendi
          // satırında rol değiştiremez/çıkamaz — bu satırlarda aksiyon yok.
          const isSelf = item.userId === currentUserId;
          const showActions =
            canManage && Boolean(currentUserId) && item.role !== 'owner' && !isSelf;
          return (
            <MemberRow
              name={item.name ?? item.email}
              image={item.image}
              roleLabel={workspaceRoleLabel(item.role)}
              isSelf={isSelf}
              onActions={
                showActions
                  ? () =>
                      setActionMember({
                        userId: item.userId,
                        role: item.role as AssignableWorkspaceRole,
                        name: item.name,
                        email: item.email,
                      })
                  : undefined
              }
            />
          );
        }}
      />
      {actionMember && actionMember.role !== 'owner' ? (
        <MemberActionSheet<AssignableWorkspaceRole>
          visible
          memberName={actionMember.name ?? actionMember.email}
          roleOptions={WORKSPACE_INVITE_ROLES}
          currentRole={actionMember.role}
          pending={memberMutations.memberPending(actionMember.userId)}
          onChangeRole={(role) => memberMutations.changeRole(actionMember.userId, role)}
          onRemove={() => memberMutations.remove(actionMember.userId)}
          onClose={() => setActionMember(null)}
        />
      ) : null}
    </>
  );
}
