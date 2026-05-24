/**
 * Faz 13G (DEM-263) — composer action bar.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.1.
 * Sol: Önizle (sekonder). Sağ: Kaydet, PDF, Excel, Zamanla, ⋯ (Daha fazla).
 *
 * Permission gating: viewer için Kaydet/Zamanla hidden; PDF/Excel render
 * herkese açık (board:viewer dahil — `canRender=true`). Server kanonik
 * yetkilendirmeyi her durumda yapar; UI yalnız affordance.
 */
'use client';

import { useState } from 'react';
import {
  BarChart3Icon,
  CalendarClockIcon,
  DownloadIcon,
  EyeIcon,
  FileDownIcon,
  MoreHorizontalIcon,
  SaveIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  cn,
} from '@pusula/ui';
import type { ReportFilters, ReportScope } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useReportPermission } from '../hooks/use-report-permission';
import { PermissionGatedButton } from '../shared/permission-gated-button';
import { ScheduleDialog } from '../shared/schedule-dialog';
import type { ComposerState } from './use-composer-state';

export interface ActionBarProps {
  scope: ReportScope;
  state: ComposerState;
  /** "Kaydet" sonrası composer'ı kapat — duplicate save'i engelle. */
  onSaveSuccess?: (savedReportId: string) => void;
  /**
   * Daha-önce-kaydedilmiş report'un düzenlenme modu. Set olduğunda
   * "Kaydet" `report.update` çağrısı yapar (V1'de update wire'lı değil —
   * bu fazda fallback olarak yeni save oluşturur; 13H'de update path).
   */
  savedReportId?: string;
  /**
   * Manuel "Önizle" tetiği. `autoPreview=true` ile yoksayılır (default);
   * `autoPreview=false` ise composer state hook'a `previewQuery.refetch()`
   * çağrısı.
   */
  onPreview?: () => void;
}

export function ActionBar({ scope, state, onSaveSuccess, savedReportId, onPreview }: ActionBarProps) {
  const { t } = useReportI18n();
  const perm = useReportPermission({ scope });
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  const previewLoading = state.previewQuery.isFetching;
  const canExport = perm.canRender;

  function handleSave() {
    if (!state.presetId) return;
    state.saveMutation.mutate(
      {
        workspaceId: scope.workspaceId,
        scope,
        presetId: state.presetId,
        title: saveTitle.trim(),
        description: saveDescription.trim() || undefined,
        filters: state.filters,
        microReports: [],
        comparison: state.comparison.enabled ? state.comparison : undefined,
      },
      {
        onSuccess: (row) => {
          setSavePopoverOpen(false);
          setSaveTitle('');
          setSaveDescription('');
          onSaveSuccess?.(row.id);
        },
      },
    );
  }

  function handleExport(format: 'pdf' | 'xlsx') {
    if (!state.presetId) return;
    // code-review H3: `reportExportSchema` discriminated union — `saved`
    // variant'ında `comparison` ve scope alanları YOK, `adhoc` variant'ında
    // VAR. Cast hilesi yerine input'u variant'a göre kur (TS union'ı
    // dogru çıkarsın; gelecekteki şema değişimini yakalayalım).
    const input = savedReportId
      ? { source: 'saved' as const, savedReportId, format }
      : {
          source: 'adhoc' as const,
          workspaceId: scope.workspaceId,
          scope,
          presetId: state.presetId,
          filters: state.filters,
          microReports: [],
          comparison: state.comparison.enabled ? state.comparison : undefined,
          format,
        };
    state.exportMutation.mutate(input);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreview ?? (() => void state.previewQuery.refetch())}
          disabled={!state.presetId || previewLoading}
          data-testid="report-action-preview"
        >
          <EyeIcon className={cn('size-4', previewLoading && 'animate-pulse')} />
          {previewLoading
            ? t('reports.actions.previewing')
            : t('reports.actions.preview')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={savePopoverOpen} onOpenChange={setSavePopoverOpen}>
          <PopoverTrigger asChild>
            <PermissionGatedButton
              can={perm.canSave}
              hide
              variant="default"
              size="sm"
              data-testid="report-action-save"
              disabled={!state.presetId || state.saveMutation.isPending}
            >
              <SaveIcon className="size-4" />
              {t('reports.actions.save')}
            </PermissionGatedButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-save-title">
                {t('reports.composer.save.titleLabel')}
              </Label>
              <Input
                id="report-save-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={t('reports.composer.save.titlePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-save-description">
                {t('reports.composer.save.descriptionLabel')}
              </Label>
              <Textarea
                id="report-save-description"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder={t('reports.composer.save.descriptionPlaceholder')}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSavePopoverOpen(false)}>
                {t('reports.actions.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={
                  saveTitle.trim().length === 0 || state.saveMutation.isPending
                }
              >
                {state.saveMutation.isPending
                  ? t('reports.composer.save.saving')
                  : t('reports.actions.save')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport('pdf')}
          disabled={!state.presetId || !canExport || state.exportMutation.isPending}
          data-testid="report-action-export-pdf"
        >
          <DownloadIcon className="size-4" />
          {state.exportMutation.isPending
            ? t('reports.actions.export.preparing')
            : t('reports.actions.export.pdf')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled
          title={t('reports.actions.export.xlsxComingSoon')}
          data-testid="report-action-export-xlsx"
        >
          <FileDownIcon className="size-4" />
          {t('reports.actions.export.xlsx')}
        </Button>

        <PermissionGatedButton
          can={perm.canScheduleCreate && Boolean(savedReportId)}
          hide={!perm.canScheduleCreate}
          reason={
            !savedReportId
              ? t('reports.actions.schedule.requiresSaved')
              : undefined
          }
          variant="outline"
          size="sm"
          onClick={() => setScheduleOpen(true)}
          data-testid="report-action-schedule"
        >
          <CalendarClockIcon className="size-4" />
          {t('reports.actions.schedule.label')}
        </PermissionGatedButton>

        {savedReportId && perm.canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontalIcon className="size-4" />
                <span className="sr-only">{t('reports.actions.more')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>
                <BarChart3Icon className="size-4" />
                {t('reports.actions.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                {t('reports.actions.archive')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  // V1: delete UI confirm + tRPC `report.delete` — 13H detay
                  // sayfasında tam çalışıyor; composer içinde rare olduğu için
                  // toast ile yönlendir.
                }}
                disabled
                className="text-destructive"
              >
                {t('reports.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {savedReportId && perm.canScheduleCreate && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          savedReportId={savedReportId}
        />
      )}
    </div>
  );
}

// Type yardımcısı — JSX'te ReportFilters'i kullanıyoruz ama unused import
// olmasın diye burada referans alıyoruz (no-op).
type _Ref = ReportFilters;
