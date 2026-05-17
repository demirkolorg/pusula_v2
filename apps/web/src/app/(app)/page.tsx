'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { OnboardingEmptyState } from './_components/onboarding-empty-state';
import { PendingInvitations } from './_components/pending-invitations';
import { BoardGrid } from './_components/home/board-grid';
import { HomeHero } from './_components/home/home-hero';
import { WorkspaceOverviewHeader } from './_components/home/workspace-overview-header';
import { WorkspaceRail } from './_components/home/workspace-rail';
import { WorkspaceStatStrip } from './_components/home/workspace-stat-strip';
import type { BoardRow, WorkspaceRow } from './_components/home/types';

/**
 * `(app)/` landing — DEM-192 "Anasayfa Variant A". Branches on how many
 * workspaces the caller has (see `docs/architecture/13-ui-tasarim-dili.md`
 * §13.11): 0 -> onboarding empty state; 1+ -> a workspace rail on the left and
 * the selected workspace's overview (header + stat strip + board grid) on the
 * right. Pending invitations stay surfaced above either branch.
 */
export default function WorkspacesPage() {
  const trpc = useTRPC();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>();

  const workspaces = useQuery(trpc.workspace.list.queryOptions());
  const workspaceList = workspaces.isSuccess
    ? ((workspaces.data ?? []) as WorkspaceRow[])
    : [];
  const selectedWorkspace =
    workspaceList.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaceList[0];

  const boards = useQuery({
    ...trpc.board.list.queryOptions({ workspaceId: selectedWorkspace?.id ?? '__none__' }),
    enabled: Boolean(selectedWorkspace),
  });
  const boardList = (boards.data ?? []) as BoardRow[];

  if (workspaces.isPending) {
    return <AppSpinner label={strings.workspace.loading} showLabel className="justify-start" />;
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

  // No workspaces -> onboarding (bootstrap is best-effort). Still surface invites.
  if (workspaceList.length === 0 || !selectedWorkspace) {
    return (
      <div className="space-y-6">
        <PendingInvitations />
        <OnboardingEmptyState />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {/* Atmospheric glow — token-driven, low-opacity radial behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-0 -z-10 h-72 w-[44rem] rounded-full bg-primary/15 blur-3xl dark:bg-primary/25"
      />

      <HomeHero />

      <PendingInvitations />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100svh-7rem)]">
          <WorkspaceRail
            workspaces={workspaceList}
            selectedWorkspaceId={selectedWorkspace.id}
            onSelect={setSelectedWorkspaceId}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <WorkspaceOverviewHeader workspace={selectedWorkspace} />
          <WorkspaceStatStrip workspaceId={selectedWorkspace.id} />
          <BoardGrid
            workspace={selectedWorkspace}
            boards={boardList}
            isPending={boards.isPending}
            isError={boards.isError}
            errorMessage={boards.error?.message}
          />
        </div>
      </div>
    </div>
  );
}
