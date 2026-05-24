/**
 * Faz 13H (DEM-264) — saved report detay bar aksiyon menüsü.
 *
 * Düzenle/Çoğalt/Sil/Arşivle/JSON Export aksiyonları. Permission gating
 * 13G `useReportPermission` üzerinden.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  FileJsonIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@pusula/ui';
import type { ReportScope } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { ConfirmActionDialog } from '../shared/confirm-action-dialog';
import { useTRPC } from '@/trpc/client';

export interface SavedReportActionsProps {
  workspaceId: string;
  savedReportId: string;
  scope: ReportScope;
  title: string;
  isArchived: boolean;
}

export function SavedReportActions({
  workspaceId,
  savedReportId,
  scope,
  title,
  isArchived,
}: SavedReportActionsProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const perm = useReportPermission({ scope });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const archiveMutation = useMutation(
    trpc.report.archive.mutationOptions({
      onSuccess: () => {
        toast.success(
          isArchived
            ? t('reports.list.toast.unarchived')
            : t('reports.list.toast.archived'),
        );
        void queryClient.invalidateQueries(
          trpc.report.getSaved.queryFilter({ id: savedReportId }),
        );
        void queryClient.invalidateQueries(
          trpc.report.listSaved.queryFilter({ workspaceId }),
        );
      },
      onError: (err) => toast.error(err.message || t('reports.list.toast.archiveError')),
    }),
  );

  const deleteMutation = useMutation(
    trpc.report.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t('reports.list.toast.deleted'));
        router.replace(`/workspaces/${workspaceId}/reports`);
      },
      onError: (err) => toast.error(err.message || t('reports.list.toast.deleteError')),
    }),
  );

  function handleDelete() {
    deleteMutation.mutate({ id: savedReportId });
  }

  function handleJsonExport() {
    // V1: API tarafında özel JSON export yok; bu placeholder tooltip.
    toast.info(t('reports.detail.jsonExportComingSoon'));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('reports.list.actions.more')}>
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {perm.canSave && (
          <DropdownMenuItem disabled>
            <PencilIcon className="size-4" />
            {t('reports.list.actions.edit')}
          </DropdownMenuItem>
        )}
        {perm.canSave && (
          <DropdownMenuItem disabled>
            <CopyIcon className="size-4" />
            {t('reports.list.actions.duplicate')}
          </DropdownMenuItem>
        )}
        {perm.can('exportJson').allowed && (
          <DropdownMenuItem onSelect={handleJsonExport}>
            <FileJsonIcon className="size-4" />
            {t('reports.list.actions.exportJson')}
          </DropdownMenuItem>
        )}
        {(perm.canSave || perm.canDelete) && <DropdownMenuSeparator />}
        {perm.canSave && (
          <DropdownMenuItem
            onSelect={() =>
              archiveMutation.mutate({ id: savedReportId, archived: !isArchived })
            }
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
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('reports.list.confirm.deleteTitle')}
        description={t('reports.list.confirm.delete', { title })}
        confirmLabel={t('reports.list.actions.delete')}
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </DropdownMenu>
  );
}
