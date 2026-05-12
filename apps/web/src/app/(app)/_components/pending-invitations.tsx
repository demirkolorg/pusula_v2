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
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type MineInvitation = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  invitedByName: string | null;
  expiresAt: Date;
  createdAt: Date;
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

function formatDate(value: Date) {
  return dateFormatter.format(value instanceof Date ? value : new Date(value));
}

/**
 * "Pending invitations" section for the current user — the invitations sent to
 * their own e-mail address (`workspace.invitations.mine`). Renders nothing when
 * there are none, so it never clutters the workspaces page. Each row owns its
 * accept/decline mutations + inline error.
 */
export function PendingInvitations() {
  const trpc = useTRPC();
  const invitations = useQuery(trpc.workspace.invitations.mine.queryOptions());

  if (!invitations.data || invitations.data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.invitations.pendingTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {invitations.data.map((invitation) => (
            <li key={invitation.token}>
              <PendingInvitationRow invitation={invitation} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PendingInvitationRow({ invitation }: { invitation: MineInvitation }) {
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
    (declineInvitation.isError && (declineInvitation.error.message || strings.common.unknownError)) ||
    null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{invitation.workspaceName}</span>
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
            acceptInvitation.mutate({ token: invitation.token, clientMutationId: crypto.randomUUID() })
          }
        >
          {acceptInvitation.isPending ? copy.accepting : copy.accept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            declineInvitation.mutate({ token: invitation.token, clientMutationId: crypto.randomUUID() })
          }
        >
          {declineInvitation.isPending ? copy.declining : copy.decline}
        </Button>
      </div>
    </div>
  );
}
