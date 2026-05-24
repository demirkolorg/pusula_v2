/**
 * Faz 13H (DEM-264) — zamanlanmış rapor satırı.
 *
 * Anatomi:
 *   - Sol: saved başlık (link) + scope etiketi
 *   - Orta: cadence label + alıcı sayımı
 *   - Sağ: son/sonraki çalışma + ⋯ menü (Hemen Çalıştır / Aktif toggle /
 *     Sil — admin+)
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  MoreHorizontalIcon,
  PlayIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
  cn,
  toast,
} from '@pusula/ui';
import type { CadenceConfig, ReportScope } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { ConfirmActionDialog } from '../shared/confirm-action-dialog';
import { useTRPC } from '@/trpc/client';

export interface ScheduleRowData {
  schedule: {
    id: string;
    savedReportId: string;
    cadence: 'daily' | 'weekly' | 'monthly';
    cadenceConfig: CadenceConfig;
    timezone: string;
    recipientUserIds: string[];
    recipientEmails: string[];
    isActive: boolean;
    lastRunAt: Date | string | null;
    nextRunAt: Date | string;
  };
  savedReport: {
    id: string;
    workspaceId: string;
    scopeKind: 'card' | 'list' | 'board' | 'workspace';
    title: string;
  };
}

export interface ScheduleRowProps {
  workspaceId: string;
  data: ScheduleRowData;
}

export function ScheduleRow({ workspaceId, data }: ScheduleRowProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const scope: ReportScope = { kind: 'workspace', workspaceId };
  const perm = useReportPermission({ scope });
  const [active, setActive] = useState(data.schedule.isActive);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const cadenceLabel = formatCadence(data.schedule.cadenceConfig, t);
  const recipientCount =
    data.schedule.recipientUserIds.length + data.schedule.recipientEmails.length;

  const invalidateFilter = trpc.report.schedule.listByWorkspace.queryFilter({ workspaceId });

  const updateMutation = useMutation(
    trpc.report.schedule.update.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.scheduleUpdated'));
        void queryClient.invalidateQueries(invalidateFilter);
      },
      onError: (err) => {
        // Optimistic toggle revert.
        setActive(data.schedule.isActive);
        toast.error(err.message || t('reports.list.toast.scheduleUpdateError'));
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.report.schedule.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.scheduleDeleted'));
        void queryClient.invalidateQueries(invalidateFilter);
      },
      onError: (err) =>
        toast.error(err.message || t('reports.list.toast.scheduleDeleteError')),
    }),
  );

  const runNowMutation = useMutation(
    trpc.report.schedule.runNow.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.scheduleRunNow'));
        void queryClient.invalidateQueries(
          trpc.report.listRenders.queryFilter({ workspaceId }),
        );
      },
      onError: (err) =>
        toast.error(err.message || t('reports.list.toast.scheduleRunNowError')),
    }),
  );

  function handleToggleActive(next: boolean) {
    setActive(next); // optimistic
    updateMutation.mutate({ id: data.schedule.id, isActive: next });
  }

  function handleDelete() {
    deleteMutation.mutate({ id: data.schedule.id });
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-shadow hover:shadow-sm',
        !active && 'opacity-60',
      )}
      data-testid={`schedule-row-${data.schedule.id}`}
    >
      <CalendarClockIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          href={`/workspaces/${workspaceId}/reports/${data.savedReport.id}`}
          className="truncate text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
          data-testid="schedule-row-link"
        >
          {data.savedReport.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{cadenceLabel}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="size-3" aria-hidden />
            {t('reports.list.recipientCount', { count: recipientCount })}
          </span>
          {data.schedule.lastRunAt && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2Icon className="size-3 text-green-600" aria-hidden />
                {t('reports.list.lastRun', { date: formatRelative(data.schedule.lastRunAt) })}
              </span>
            </>
          )}
          {active && (
            <>
              <span aria-hidden>·</span>
              <span>{t('reports.list.nextRun', { date: formatDateShort(data.schedule.nextRunAt) })}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {perm.canScheduleCreate && (
          <Switch
            checked={active}
            onCheckedChange={handleToggleActive}
            disabled={updateMutation.isPending}
            aria-label={`${t('reports.list.actions.toggleActive')}: ${data.savedReport.title}`}
            data-testid="schedule-row-active-toggle"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t('reports.list.actions.more')}: ${data.savedReport.title}`}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {perm.canScheduleCreate && (
              <DropdownMenuItem
                onSelect={() => runNowMutation.mutate({ id: data.schedule.id })}
                disabled={runNowMutation.isPending}
                data-testid="schedule-row-runnow"
              >
                <PlayIcon className="size-4" />
                {t('reports.list.actions.runNow')}
              </DropdownMenuItem>
            )}
            {perm.canScheduleCreate && perm.canDelete && <DropdownMenuSeparator />}
            {perm.canDelete && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setDeleteOpen(true);
                }}
                disabled={deleteMutation.isPending}
                className="text-destructive"
              >
                <Trash2Icon className="size-4" />
                {t('reports.list.actions.delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('reports.list.confirm.scheduleDeleteTitle')}
        description={t('reports.list.confirm.scheduleDelete', { title: data.savedReport.title })}
        confirmLabel={t('reports.list.actions.delete')}
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </li>
  );
}

function formatCadence(
  config: CadenceConfig,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const hh = String(config.hour).padStart(2, '0');
  const mm = String(config.minute).padStart(2, '0');
  const time = `${hh}:${mm}`;
  if (config.cadence === 'daily') {
    return t('reports.list.cadenceLabel.daily', { time });
  }
  if (config.cadence === 'weekly') {
    const dayKey = `reports.schedule.weekday.${config.dayOfWeek}`;
    return t('reports.list.cadenceLabel.weekly', { dayOfWeek: t(dayKey), time });
  }
  return t('reports.list.cadenceLabel.monthly', {
    dayOfMonth: config.dayOfMonth === 'last' ? t('reports.list.cadenceLabel.lastDay') : config.dayOfMonth,
    time,
  });
}

function formatDateShort(iso: Date | string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return String(iso);
  }
}

function formatRelative(iso: Date | string): string {
  try {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days === 0) return 'bugün';
    if (days === 1) return '1 gün önce';
    if (days < 7) return `${days} gün önce`;
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(date);
  } catch {
    return String(iso);
  }
}
