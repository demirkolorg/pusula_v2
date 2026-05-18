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
import { canManageWorkspaceMembers, workspaceRoleLabel } from '@/lib/member-roles';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/** Davet formunda sunulan workspace rolleri (`owner` atanamaz — domain kuralı). */
const WORKSPACE_INVITE_ROLES = [
  { value: 'admin', label: strings.members.roleAdmin },
  { value: 'member', label: strings.members.roleMember },
  { value: 'guest', label: strings.members.roleGuest },
] as const;

type WorkspaceInviteRole = (typeof WORKSPACE_INVITE_ROLES)[number]['value'];

/**
 * Faz 7D — workspace üye listesi ekranı. Üyeler ad + rol rozeti ile salt
 * görüntülenir; çağıran `admin+` ise üstte satır-içi davet formu görünür.
 * Çağıranın rolü `workspace.members.list` içinden kendi `userId`'si eşlenerek
 * bulunur (ayrı sorgu yok). Kapsam: liste + davet-et (rol değiştir / üye çıkar
 * kapsam dışı).
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

  const query = useQuery(
    trpc.workspace.members.list.queryOptions(
      { workspaceId },
      { enabled: Boolean(workspaceId) },
    ),
  );

  const invite = useMutation(trpc.workspace.members.invite.mutationOptions());

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
  const canInvite = canManageWorkspaceMembers(myRole);

  const handleInvite = async (email: string, role: WorkspaceInviteRole) => {
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
    setInviteOpen(false);
    setSuccessMessage(strings.members.inviteSuccess);
  };

  const listHeader = canInvite ? (
    <View className="gap-3 pb-1">
      {successMessage ? (
        <FormMessage tone="info">{successMessage}</FormMessage>
      ) : null}
      {inviteOpen ? (
        <MemberInviteForm<WorkspaceInviteRole>
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
            name={item.name ?? item.email}
            image={item.image}
            roleLabel={workspaceRoleLabel(item.role)}
          />
        )}
      />
    </>
  );
}
