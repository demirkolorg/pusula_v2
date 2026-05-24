/**
 * Faz 13H (DEM-264) — kaydedilmiş rapor list satırı.
 *
 * Anatomi:
 *   - Sol: başlık (link → detay) + scope etiketi + oluşturan
 *   - Orta: preset adı + filtre özet chips (en fazla 3)
 *   - Sağ: ⋯ menü (Düzenle/Çoğalt/Sil/Arşivle/Zamanla — admin+)
 *
 * Permission: 13G `useReportPermission` ile board:admin / workspace:admin.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarClockIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  toast,
} from '@pusula/ui';
import type { ComparisonConfig, ReportFilters, ReportScope } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { ConfirmActionDialog } from '../shared/confirm-action-dialog';
import { FilterSummaryChips } from '../shared/filter-summary-chips';
import { ScheduleDialog } from '../shared/schedule-dialog';
import { useTRPC } from '@/trpc/client';

export interface SavedReportRowSaved {
  id: string;
  workspaceId: string;
  scopeKind: 'card' | 'list' | 'board' | 'workspace';
  scopeId: string;
  presetId: string;
  title: string;
  description: string | null;
  filters: ReportFilters;
  comparison: ComparisonConfig | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  createdBy: string;
}

export interface SavedReportRowProps {
  workspaceId: string;
  saved: SavedReportRowSaved;
}

function buildScope(saved: SavedReportRowSaved): ReportScope {
  // V1: scope reconstruction list satırından — board/list/card için
  // boardId backend tarafında resolve edilir; row data'da yok. Permission
  // ctx için scope.workspaceId yeterli (board scope için server-side
  // canPerformReportAction yine kanonik). Burada UI affordance amaçlı
  // basit reconstruction.
  if (saved.scopeKind === 'workspace') {
    return { kind: 'workspace', workspaceId: saved.workspaceId };
  }
  if (saved.scopeKind === 'board') {
    return { kind: 'board', boardId: saved.scopeId, workspaceId: saved.workspaceId };
  }
  if (saved.scopeKind === 'list') {
    // boardId UI'da yok — workspace scope permission ctx ile fallback.
    return { kind: 'workspace', workspaceId: saved.workspaceId };
  }
  return { kind: 'workspace', workspaceId: saved.workspaceId };
}

export function SavedReportRow({ workspaceId, saved }: SavedReportRowProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const scope = buildScope(saved);
  const perm = useReportPermission({ scope });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isArchived = saved.archivedAt != null;
  const presetTitleKey = `reports.presets.${saved.presetId}.title`;
  const presetTitle = t(presetTitleKey);
  const scopeLabel = t(`reports.scope.${saved.scopeKind}`);

  const deleteMutation = useMutation(
    trpc.report.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.deleted'));
        void queryClient.invalidateQueries(
          trpc.report.listSaved.queryFilter({ workspaceId }),
        );
      },
      onError: (err) => toast.error(err.message || t('reports.list.toast.deleteError')),
    }),
  );

  const archiveMutation = useMutation(
    trpc.report.archive.mutationOptions({
      onSuccess: () => {
        toast.success(
          isArchived
            ? t('reports.list.toast.unarchived')
            : t('reports.list.toast.archived'),
        );
        void queryClient.invalidateQueries(
          trpc.report.listSaved.queryFilter({ workspaceId }),
        );
      },
      onError: (err) => toast.error(err.message || t('reports.list.toast.archiveError')),
    }),
  );

  const duplicateMutation = useMutation(
    trpc.report.save.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.duplicated'));
        void queryClient.invalidateQueries(
          trpc.report.listSaved.queryFilter({ workspaceId }),
        );
      },
      onError: (err) => toast.error(err.message || t('reports.list.toast.duplicateError')),
    }),
  );

  function handleDelete() {
    deleteMutation.mutate({ id: saved.id });
  }

  function handleArchive() {
    archiveMutation.mutate({ id: saved.id, archived: !isArchived });
  }

  function handleDuplicate() {
    duplicateMutation.mutate({
      workspaceId,
      scope,
      presetId: saved.presetId,
      title: t('reports.list.duplicateTitle', { title: saved.title }),
      description: saved.description ?? undefined,
      filters: saved.filters,
      microReports: [],
      comparison: saved.comparison ?? undefined,
    });
  }

  return (
    <li
      className={cn(
        'group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 transition-shadow hover:shadow-sm',
        isArchived && 'opacity-60',
      )}
      data-testid={`saved-report-row-${saved.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/workspaces/${workspaceId}/reports/${saved.id}`}
            className="truncate text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
            data-testid="saved-report-row-link"
          >
            {saved.title}
          </Link>
          {isArchived && (
            <Badge variant="outline" className="text-[10px]">
              {t('reports.list.archivedBadge')}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {scopeLabel} · {presetTitle === presetTitleKey ? saved.presetId : presetTitle}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDateShort(saved.createdAt)}</span>
        </div>
        <div className="mt-1.5">
          <FilterSummaryChips filters={saved.filters} comparison={saved.comparison} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t('reports.list.actions.more')}: ${saved.title}`}
              data-testid="saved-report-row-menu"
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/workspaces/${workspaceId}/reports/${saved.id}`}>
                <PencilIcon className="size-4" />
                {t('reports.list.actions.edit')}
              </Link>
            </DropdownMenuItem>
            {perm.canSave && (
              <DropdownMenuItem
                onSelect={handleDuplicate}
                disabled={duplicateMutation.isPending}
              >
                <CopyIcon className="size-4" />
                {t('reports.list.actions.duplicate')}
              </DropdownMenuItem>
            )}
            {perm.canScheduleCreate && (
              <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>
                <CalendarClockIcon className="size-4" />
                {t('reports.list.actions.schedule')}
              </DropdownMenuItem>
            )}
            {(perm.canSave || perm.canDelete) && <DropdownMenuSeparator />}
            {perm.canSave && (
              <DropdownMenuItem
                onSelect={handleArchive}
                disabled={archiveMutation.isPending}
              >
                {isArchived ? (
                  <>
                    <ArchiveRestoreIcon className="size-4" />
                    {t('reports.list.actions.unarchive')}
                  </>
                ) : (
                  <>
                    <ArchiveIcon className="size-4" />
                    {t('reports.list.actions.archive')}
                  </>
                )}
              </DropdownMenuItem>
            )}
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
      {scheduleOpen && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          savedReportId={saved.id}
        />
      )}
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('reports.list.confirm.deleteTitle')}
        description={t('reports.list.confirm.delete', { title: saved.title })}
        confirmLabel={t('reports.list.actions.delete')}
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </li>
  );
}

function formatDateShort(iso: Date | string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}
