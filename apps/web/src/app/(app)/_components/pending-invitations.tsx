'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type WorkspaceMineInvitation = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  invitedByName: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
};

type BoardMineInvitation = {
  token: string;
  boardId: string;
  boardTitle: string;
  workspaceName: string;
  role: string;
  invitedByName: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
};

/**
 * "Pending invitations" section for the current user — the invitations sent to
 * their own e-mail address: workspace invitations (`workspace.invitations.mine`)
 * and board invitations (`board.invitations.mine`), grouped under one heading.
 * Renders nothing when there are none, so it never clutters the page. Each row
 * owns its accept/decline mutations + inline error. `clientMutationId` is
 * generated client-side per mutation.
 */
export function PendingInvitations() {
  const trpc = useTRPC();
  const workspaceInvitations = useQuery(trpc.workspace.invitations.mine.queryOptions());
  const boardInvitations = useQuery(trpc.board.invitations.mine.queryOptions());

  const wsList = workspaceInvitations.data ?? [];
  const boardList = boardInvitations.data ?? [];
  if (wsList.length === 0 && boardList.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invitations.pendingTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {wsList.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-sm font-medium">
              {strings.invitations.workspaceGroupTitle}
            </h3>
            <ul className="space-y-3">
              {wsList.map((invitation) => (
                <li key={invitation.token}>
                  <WorkspaceInvitationRow invitation={invitation} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {boardList.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-sm font-medium">
              {strings.invitations.boardGroupTitle}
            </h3>
            <ul className="space-y-3">
              {boardList.map((invitation) => (
                <li key={invitation.token}>
                  <BoardInvitationRow invitation={invitation} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkspaceInvitationRow({ invitation }: { invitation: WorkspaceMineInvitation }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.invitations;

  const acceptInvitation = useMutation(
    trpc.workspace.invitations.accept.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
          queryClient.invalidateQueries(trpc.workspace.invitations.mine.queryFilter()),
        ]);
      },
    }),
  );

  const declineInvitation = useMutation(
    trpc.workspace.invitations.decline.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.invitations.mine.queryFilter());
      },
    }),
  );

  const busy = acceptInvitation.isPending || declineInvitation.isPending;
  const errorMessage =
    (acceptInvitation.isError && (acceptInvitation.error.message || strings.common.unknownError)) ||
    (declineInvitation.isError &&
      (declineInvitation.error.message || strings.common.unknownError)) ||
    null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{invitation.workspaceName}</span>
          <Badge variant="secondary">{invitation.role}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {copy.invitedBy}: {invitation.invitedByName ?? '—'} · {copy.expiresAt}:{' '}
          {formatDate(invitation.expiresAt)}
        </p>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            acceptInvitation.mutate({
              token: invitation.token,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {acceptInvitation.isPending ? copy.accepting : copy.accept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            declineInvitation.mutate({
              token: invitation.token,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {declineInvitation.isPending ? copy.declining : copy.decline}
        </Button>
      </div>
    </div>
  );
}

function BoardInvitationRow({ invitation }: { invitation: BoardMineInvitation }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.invitations;

  const acceptInvitation = useMutation(
    trpc.board.invitations.accept.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
          queryClient.invalidateQueries(trpc.board.invitations.mine.queryFilter()),
          queryClient.invalidateQueries(trpc.workspace.invitations.mine.queryFilter()),
        ]);
      },
    }),
  );

  const declineInvitation = useMutation(
    trpc.board.invitations.decline.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.invitations.mine.queryFilter());
      },
    }),
  );

  const busy = acceptInvitation.isPending || declineInvitation.isPending;
  const errorMessage =
    (acceptInvitation.isError && (acceptInvitation.error.message || strings.common.unknownError)) ||
    (declineInvitation.isError &&
      (declineInvitation.error.message || strings.common.unknownError)) ||
    null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{invitation.boardTitle}</span>
          <Badge variant="secondary">{invitation.role}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {invitation.workspaceName} · {copy.invitedBy}: {invitation.invitedByName ?? '—'} ·{' '}
          {copy.expiresAt}: {formatDate(invitation.expiresAt)}
        </p>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            acceptInvitation.mutate({
              token: invitation.token,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {acceptInvitation.isPending ? copy.accepting : copy.accept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            declineInvitation.mutate({
              token: invitation.token,
              clientMutationId: crypto.randomUUID(),
            })
          }
        >
          {declineInvitation.isPending ? copy.declining : copy.decline}
        </Button>
      </div>
    </div>
  );
}
