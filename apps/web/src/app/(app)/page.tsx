'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
  cn,
} from '@pusula/ui';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './_components/create-workspace-dialog';
import { OnboardingEmptyState } from './_components/onboarding-empty-state';
import { PendingInvitations } from './_components/pending-invitations';

/**
 * `(app)/` landing. Branches on how many workspaces the caller has (see
 * `docs/architecture/08-web-ve-mobil.md` §8.1.3): 0 → onboarding empty state
 * (the signup bootstrap is best-effort, so this can happen), 1 → straight to that
 * workspace, 2+ → the workspace list.
 */
export default function WorkspacesPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());

  // Exactly one workspace → go straight there. `router.replace` can't run during
  // render, so it lives in an effect keyed by the (stable) workspace id.
  const soleWorkspaceId =
    workspaces.isSuccess && workspaces.data.length === 1 ? workspaces.data[0]?.id : undefined;
  useEffect(() => {
    if (soleWorkspaceId) router.replace(`/workspaces/${soleWorkspaceId}`);
  }, [soleWorkspaceId, router]);

  if (workspaces.isPending) {
    return <p className="text-muted-foreground text-sm">{strings.workspace.loading}</p>;
  }

  if (workspaces.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{strings.workspace.loadErrorTitle}</AlertTitle>
        <AlertDescription>
          {workspaces.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  if (soleWorkspaceId) {
    // Redirect in flight — brief placeholder while the effect runs.
    return <p className="text-muted-foreground text-sm">{strings.workspace.redirecting}</p>;
  }

  // No workspaces → onboarding (bootstrap is best-effort). Still surface invites.
  if (workspaces.data.length === 0) {
    return (
      <div className="space-y-6">
        <PendingInvitations />
        <OnboardingEmptyState />
      </div>
    );
  }

  // 2+ workspaces → the list.
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{strings.workspace.listTitle}</h1>
        <CreateWorkspaceDialog />
      </div>

      <PendingInvitations />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.data.map((workspace) => (
          <li key={workspace.id}>
            <Card
              className={cn(
                'transition-[box-shadow,border-color] hover:border-foreground/30 hover:shadow-card-hover',
              )}
            >
              <CardHeader>
                <CardTitle>
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    className="rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {workspace.name}
                  </Link>
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
