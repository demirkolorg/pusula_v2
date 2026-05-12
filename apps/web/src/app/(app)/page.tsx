'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './_components/create-workspace-dialog';
import { PendingInvitations } from './_components/pending-invitations';

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
                  <CardTitle>
                    <Link
                      href={`/workspaces/${workspace.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {workspace.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>{workspace.slug}</span>
                    <Badge variant="secondary">
                      {strings.workspace.roleBadgePrefix} {workspaceRoleLabels[workspace.role]}
                    </Badge>
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
