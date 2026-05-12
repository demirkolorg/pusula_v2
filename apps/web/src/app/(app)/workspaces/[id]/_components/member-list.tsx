'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@pusula/domain';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { MemberRow } from './member-row';

type MemberListProps = {
  workspaceId: string;
  /** Whether the viewer is `admin+` — gates role/remove controls in each row. */
  canManage: boolean;
};

/**
 * Container for the workspace member list: loads `workspace.members.list`, then
 * renders a presentational `MemberRow` per member. Each row's role-change /
 * remove mutation invalidates the list on success; "leave" (the viewer removing
 * their own membership) instead invalidates `workspace.list` and navigates home.
 * The active mutation's target id + error live here so only that row reflects
 * pending/error state.
 */
export function MemberList({ workspaceId, canManage }: MemberListProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const viewerUserId = session?.user.id ?? '';

  const members = useQuery(trpc.workspace.members.list.queryOptions({ workspaceId }));

  // Which row a mutation is currently acting on (so only it shows pending/error).
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ userId: string; message: string } | null>(null);

  const clearRowState = () => {
    setActiveUserId(null);
    setRowError(null);
  };

  const updateRole = useMutation(
    trpc.workspace.members.updateRole.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.workspace.members.list.queryFilter({ workspaceId }),
        );
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          userId: variables.userId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const removeMember = useMutation(
    trpc.workspace.members.remove.mutationOptions({
      onSuccess: async (_data, variables) => {
        if (variables.userId === viewerUserId) {
          await queryClient.invalidateQueries(trpc.workspace.list.queryFilter());
          router.replace('/');
          return;
        }
        await queryClient.invalidateQueries(
          trpc.workspace.members.list.queryFilter({ workspaceId }),
        );
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          userId: variables.userId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const isBusy = updateRole.isPending || removeMember.isPending;

  if (members.isPending) {
    return <p className="text-muted-foreground text-sm">{strings.members.loading}</p>;
  }

  if (members.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{strings.members.loadErrorTitle}</AlertTitle>
        <AlertDescription>{members.error.message || strings.common.unknownError}</AlertDescription>
      </Alert>
    );
  }

  if (members.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.members.empty}</p>;
  }

  const handleRoleChange = (userId: string, role: Exclude<WorkspaceRole, 'owner'>) => {
    setRowError(null);
    setActiveUserId(userId);
    updateRole.mutate({ workspaceId, userId, role, clientMutationId: crypto.randomUUID() });
  };

  const handleRemove = (userId: string) => {
    setRowError(null);
    setActiveUserId(userId);
    removeMember.mutate({ workspaceId, userId, clientMutationId: crypto.randomUUID() });
  };

  return (
    <ul className="space-y-3">
      {members.data.map((member) => {
        const rowPending = isBusy && activeUserId === member.userId;
        return (
          <li key={member.userId}>
            <MemberRow
              member={member}
              viewerUserId={viewerUserId}
              canManage={canManage}
              pending={rowPending}
              error={rowError?.userId === member.userId ? rowError.message : null}
              onRoleChange={(role) => handleRoleChange(member.userId, role)}
              onRemove={() => handleRemove(member.userId)}
              onLeave={() => handleRemove(member.userId)}
            />
          </li>
        );
      })}
    </ul>
  );
}
