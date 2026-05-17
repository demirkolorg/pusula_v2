'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleIcon, CircleCheckIcon, FlagIcon, UserIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { StatTile } from './stat-tile';

type WorkspaceStats = {
  openCount: number;
  completedThisWeek: number;
  completedLastWeek: number;
  overdueCount: number;
  assignedToMeOpen: number;
  assignedToMeDueToday: number;
};

type WorkspaceStatStripProps = {
  workspaceId: string;
};

/** Builds the "this week vs last week" delta line for the completed-tasks tile. */
function completedDeltaSub(stats: WorkspaceStats): string {
  const delta = stats.completedThisWeek - stats.completedLastWeek;
  const copy = strings.home.stats.completedThisWeek;
  if (delta > 0) return copy.deltaUp(delta);
  if (delta < 0) return copy.deltaDown(-delta);
  return copy.deltaSame;
}

/**
 * Four-tile metric strip for the selected workspace (DEM-192). Reads
 * `workspace.stats`; renders a compact spinner while pending and a sober
 * alert on error so a failed stats fetch never blocks the board grid below.
 */
export function WorkspaceStatStrip({ workspaceId }: WorkspaceStatStripProps) {
  const trpc = useTRPC();
  const copy = strings.home.stats;
  const stats = useQuery(trpc.workspace.stats.queryOptions({ workspaceId }));

  if (stats.isPending) {
    return (
      <section aria-label={copy.sectionLabel}>
        <AppSpinner showLabel className="justify-start" />
      </section>
    );
  }

  if (stats.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.loadErrorTitle}</AlertTitle>
        <AlertDescription>
          {stats.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  const data = stats.data as WorkspaceStats;

  return (
    <section
      aria-label={copy.sectionLabel}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatTile
        icon={CircleIcon}
        tone="warning"
        label={copy.openTasks.label}
        value={data.openCount}
        sub={copy.openTasks.sub}
      />
      <StatTile
        icon={CircleCheckIcon}
        tone="success"
        label={copy.completedThisWeek.label}
        value={data.completedThisWeek}
        sub={completedDeltaSub(data)}
      />
      <StatTile
        icon={FlagIcon}
        tone="destructive"
        label={copy.overdue.label}
        value={data.overdueCount}
        sub={data.overdueCount === 0 ? copy.overdue.subEmpty : copy.overdue.sub}
      />
      <StatTile
        icon={UserIcon}
        tone="primary"
        label={copy.assignedToMe.label}
        value={data.assignedToMeOpen}
        sub={copy.assignedToMe.sub(data.assignedToMeDueToday)}
      />
    </section>
  );
}
