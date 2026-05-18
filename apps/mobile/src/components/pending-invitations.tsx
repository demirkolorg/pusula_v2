import { useState } from 'react';
import { Alert, View, useColorScheme } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { boardRoleLabel, workspaceRoleLabel } from '@/lib/member-roles';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/** Listede tek bir satır — workspace ya da board daveti tek tip altında birleşir. */
type InvitationRow = {
  /** Birleşik liste için benzersiz anahtar. */
  key: string;
  kind: 'workspace' | 'board';
  /** Davet edilen hedefin adı (workspace adı ya da board başlığı). */
  title: string;
  /** Alt satır bağlamı — board için workspace adı, workspace için boş. */
  context: string | null;
  roleLabel: string;
  invitedByName: string | null;
  token: string;
};

/**
 * "Bekleyen davetler" bölümü — `(boards)/index` (workspace listesi) ekranının
 * üstünde. `workspace.invitations.mine` + `board.invitations.mine` birleşik
 * gösterilir; her satırda kabul / reddet. Davet yoksa bölüm tamamen gizlenir
 * (her iki query de boş ya da hata → `null` döner, ekranı bloklamaz).
 */
export function PendingInvitations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  // Hangi token üzerinde işlem sürüyor — satır bazında buton kilidi için.
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const workspaceInvites = useQuery(trpc.workspace.invitations.mine.queryOptions());
  const boardInvites = useQuery(trpc.board.invitations.mine.queryOptions());

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.workspace.invitations.mine.queryFilter()),
      queryClient.invalidateQueries(trpc.board.invitations.mine.queryFilter()),
      // Kabul sonrası yeni workspace/board listede görünmeli.
      queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
    ]);
  };

  const acceptWorkspace = useMutation(trpc.workspace.invitations.accept.mutationOptions());
  const declineWorkspace = useMutation(trpc.workspace.invitations.decline.mutationOptions());
  const acceptBoard = useMutation(trpc.board.invitations.accept.mutationOptions());
  const declineBoard = useMutation(trpc.board.invitations.decline.mutationOptions());

  const rows: InvitationRow[] = [
    ...(workspaceInvites.data ?? []).map((invite) => ({
      key: `ws:${invite.token}`,
      kind: 'workspace' as const,
      title: invite.workspaceName,
      context: null,
      roleLabel: workspaceRoleLabel(invite.role),
      invitedByName: invite.invitedByName,
      token: invite.token,
    })),
    ...(boardInvites.data ?? []).map((invite) => ({
      key: `bd:${invite.token}`,
      kind: 'board' as const,
      title: invite.boardTitle,
      context: invite.workspaceName,
      roleLabel: boardRoleLabel(invite.role),
      invitedByName: invite.invitedByName,
      token: invite.token,
    })),
  ];

  // Davet yok (ya da yüklenmedi / hata) → bölümü hiç çizme.
  if (rows.length === 0) return null;

  const runAction = async (
    row: InvitationRow,
    action: 'accept' | 'decline',
  ): Promise<void> => {
    setBusyToken(row.token);
    try {
      const input = { token: row.token, clientMutationId: newClientMutationId() };
      if (row.kind === 'workspace') {
        await (action === 'accept' ? acceptWorkspace : declineWorkspace).mutateAsync(input);
      } else {
        await (action === 'accept' ? acceptBoard : declineBoard).mutateAsync(input);
      }
      await invalidateAll();
    } catch {
      Alert.alert(strings.invitations.sectionTitle, strings.invitations.actionError);
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name="mail" size={15} color={theme.mutedForeground} />
        <Text weight="semibold" className="text-xs uppercase text-muted-foreground">
          {strings.invitations.sectionTitle}
        </Text>
      </View>
      <View className="gap-3">
        {rows.map((row) => {
          const busy = busyToken === row.token;
          return (
            <View
              key={row.key}
              className="gap-3 rounded-xl border border-border bg-card p-3"
            >
              <View className="flex-row items-center gap-3">
                <EntityAvatar name={row.title} size={40} />
                <View className="flex-1 gap-0.5">
                  <Text
                    weight="semibold"
                    className="text-base text-foreground"
                    numberOfLines={1}
                  >
                    {row.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {(row.kind === 'workspace'
                      ? strings.invitations.workspaceKind
                      : strings.invitations.boardKind) +
                      (row.context ? ` · ${row.context}` : '') +
                      ` · ${row.roleLabel}`}
                  </Text>
                  {row.invitedByName ? (
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {`${strings.invitations.invitedByPrefix} ${row.invitedByName}`}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label={
                      busy ? strings.invitations.declining : strings.invitations.decline
                    }
                    variant="ghost"
                    pending={busy}
                    disabled={busyToken !== null && !busy}
                    onPress={() => runAction(row, 'decline')}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label={
                      busy ? strings.invitations.accepting : strings.invitations.accept
                    }
                    pending={busy}
                    disabled={busyToken !== null && !busy}
                    onPress={() => runAction(row, 'accept')}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
