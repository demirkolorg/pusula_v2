'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './_components/create-workspace-dialog';
import { InviteMemberDialog } from './_components/invite-member-dialog';
import { PendingInvitations } from './_components/pending-invitations';

const MANAGER_ROLES = new Set(['owner', 'admin']);

export default function WorkspacesPage() {
  const trpc = useTRPC();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{strings.workspace.listTitle}</h1>
        <CreateWorkspaceDialog />
      </div>

      <PendingInvitations />

      {workspaces.isPending && (
        <p className="text-muted-foreground text-sm">{strings.workspace.loading}</p>
      )}

      {workspaces.isError && (
        <Alert variant="destructive">
          <AlertTitle>{strings.workspace.loadErrorTitle}</AlertTitle>
          <AlertDescription>
            {workspaces.error.message || strings.common.unknownError}
          </AlertDescription>
        </Alert>
      )}

      {workspaces.isSuccess && workspaces.data.length === 0 && (
        <Card>
          <CardHeader>
            <CardDescription>{strings.workspace.empty}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {workspaces.isSuccess && workspaces.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.data.map((workspace) => (
            <li key={workspace.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{workspace.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>{workspace.slug}</span>
                    <Badge variant="secondary">
                      {strings.workspace.roleBadgePrefix} {workspace.role}
                    </Badge>
                  </CardDescription>
                  {MANAGER_ROLES.has(workspace.role) && (
                    <CardAction>
                      <InviteMemberDialog
                        workspaceId={workspace.id}
                        workspaceName={workspace.name}
                      />
                    </CardAction>
                  )}
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
