/**
 * DEM-210 — mobil üye yönetimi mutation hook'ları: workspace/board üye rol
 * değiştirme + üye çıkarma + gönderilen davet iptali.
 *
 * Optimistic akış (web simetrisi): `onMutate` ilgili `members.list` /
 * `invitations.list` cache'ini iyimser günceller + snapshot tutar; `onError`
 * snapshot'a geri sarar; `onSettled` listeyi invalidate eder. Her mutation
 * `clientMutationId` taşır (`newClientMutationId()`). Permission backend'de
 * doğrulanır — bu hook yalnız çağıranın iyimser UI'ını yönetir.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardRole, WorkspaceRole } from '@pusula/domain';
import { useTRPC } from '@/trpc/provider';
import { newClientMutationId } from '@/lib/client-mutation-id';

/** Atanabilir workspace rolleri (`owner` hariç — domain kuralı). */
export type AssignableWorkspaceRole = Exclude<WorkspaceRole, 'owner'>;

/** Workspace üye yönetimi mutation'ları — rol değiştir, çıkar, davet iptal. */
export function useWorkspaceMemberMutations(workspaceId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const membersKey = trpc.workspace.members.list.queryKey({ workspaceId });
  const membersFilter = trpc.workspace.members.list.queryFilter({ workspaceId });
  const invitationsKey = trpc.workspace.invitations.list.queryKey({ workspaceId });
  const invitationsFilter = trpc.workspace.invitations.list.queryFilter({ workspaceId });

  const updateRole = useMutation(
    trpc.workspace.members.updateRole.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(membersFilter);
        const previous = queryClient.getQueryData(membersKey);
        if (previous) {
          queryClient.setQueryData(
            membersKey,
            previous.map((member) =>
              member.userId === vars.userId ? { ...member, role: vars.role } : member,
            ),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(membersFilter);
      },
    }),
  );

  const removeMember = useMutation(
    trpc.workspace.members.remove.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(membersFilter);
        const previous = queryClient.getQueryData(membersKey);
        if (previous) {
          queryClient.setQueryData(
            membersKey,
            previous.filter((member) => member.userId !== vars.userId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(membersFilter);
      },
    }),
  );

  const revokeInvitation = useMutation(
    trpc.workspace.invitations.revoke.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(invitationsFilter);
        const previous = queryClient.getQueryData(invitationsKey);
        if (previous) {
          queryClient.setQueryData(
            invitationsKey,
            previous.filter((invitation) => invitation.id !== vars.invitationId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(invitationsKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(invitationsFilter);
      },
    }),
  );

  return {
    changeRole: (userId: string, role: AssignableWorkspaceRole) =>
      updateRole.mutateAsync({
        workspaceId,
        userId,
        role,
        clientMutationId: newClientMutationId(),
      }),
    remove: (userId: string) =>
      removeMember.mutateAsync({
        workspaceId,
        userId,
        clientMutationId: newClientMutationId(),
      }),
    cancelInvitation: (invitationId: string) =>
      revokeInvitation.mutateAsync({
        workspaceId,
        invitationId,
        clientMutationId: newClientMutationId(),
      }),
    /** Hangi üye/davet üzerinde mutasyon uçuşta — satır bazlı buton kilidi için. */
    memberPending: (userId: string) =>
      (updateRole.isPending && updateRole.variables?.userId === userId) ||
      (removeMember.isPending && removeMember.variables?.userId === userId),
    invitationPending: (invitationId: string) =>
      revokeInvitation.isPending && revokeInvitation.variables?.invitationId === invitationId,
  };
}

/** Board üye yönetimi mutation'ları — rol değiştir, çıkar, davet iptal. */
export function useBoardMemberMutations(boardId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const membersKey = trpc.board.members.list.queryKey({ boardId });
  const membersFilter = trpc.board.members.list.queryFilter({ boardId });
  const invitationsKey = trpc.board.invitations.list.queryKey({ boardId });
  const invitationsFilter = trpc.board.invitations.list.queryFilter({ boardId });

  const updateRole = useMutation(
    trpc.board.members.updateRole.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(membersFilter);
        const previous = queryClient.getQueryData(membersKey);
        if (previous) {
          // Yalnız *açık* (`inherited: false`) üyenin rolü iyimser güncellenir;
          // devralınan satır (`inherited: true`) zaten rolü değiştirilemez ve
          // tip olarak `role: 'admin'` literal'ine sabittir — dokunulmaz.
          queryClient.setQueryData(
            membersKey,
            previous.map((member) =>
              member.userId === vars.userId && !member.inherited
                ? { ...member, role: vars.role }
                : member,
            ),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(membersFilter);
      },
    }),
  );

  const removeMember = useMutation(
    trpc.board.members.remove.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(membersFilter);
        const previous = queryClient.getQueryData(membersKey);
        if (previous) {
          queryClient.setQueryData(
            membersKey,
            previous.filter((member) => member.userId !== vars.userId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(membersFilter);
      },
    }),
  );

  const revokeInvitation = useMutation(
    trpc.board.invitations.revoke.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(invitationsFilter);
        const previous = queryClient.getQueryData(invitationsKey);
        if (previous) {
          queryClient.setQueryData(
            invitationsKey,
            previous.filter((invitation) => invitation.id !== vars.invitationId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(invitationsKey, ctx.previous);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(invitationsFilter);
      },
    }),
  );

  return {
    changeRole: (userId: string, role: BoardRole) =>
      updateRole.mutateAsync({
        boardId,
        userId,
        role,
        clientMutationId: newClientMutationId(),
      }),
    remove: (userId: string) =>
      removeMember.mutateAsync({
        boardId,
        userId,
        clientMutationId: newClientMutationId(),
      }),
    cancelInvitation: (invitationId: string) =>
      revokeInvitation.mutateAsync({
        boardId,
        invitationId,
        clientMutationId: newClientMutationId(),
      }),
    memberPending: (userId: string) =>
      (updateRole.isPending && updateRole.variables?.userId === userId) ||
      (removeMember.isPending && removeMember.variables?.userId === userId),
    invitationPending: (invitationId: string) =>
      revokeInvitation.isPending && revokeInvitation.variables?.invitationId === invitationId,
  };
}
