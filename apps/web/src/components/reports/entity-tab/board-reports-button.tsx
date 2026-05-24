/**
 * Faz 13G (DEM-263) — board top-bar "Raporlar" butonu.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.4.
 * Board top-bar'ın sağ kümesine eklenir (SearchDialog / BoardActivity yanına).
 * Click → `<ReportComposerDialog>` board scope ile açılır.
 *
 * Permission gating: `canGenerate=true` board:viewer dahil herkese açık;
 * UI gizleme yok. Server kanonik yetkilendirmeyi sağlar.
 */
'use client';

import { useState } from 'react';
import { BarChart3Icon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@pusula/ui';
import { useReportI18n } from '../hooks/use-report-i18n';
import { ReportComposerDialog } from '../composer/report-composer-dialog';

export interface BoardReportsButtonProps {
  boardId: string;
  workspaceId: string;
  /** Board top-bar `boardChromeButtonClass` Pusula konvansiyonu. */
  className?: string;
  /** Composer açıldığında dışarıdan opsiyonel observer. */
  onOpenChange?: (open: boolean) => void;
}

export function BoardReportsButton({
  boardId,
  workspaceId,
  className,
  onOpenChange,
}: BoardReportsButtonProps) {
  const { t } = useReportI18n();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleOpenChange(true)}
            aria-label={t('reports.entity.board.openButton')}
            className={cn('size-8', className)}
            data-testid="board-reports-button"
          >
            <BarChart3Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('reports.entity.board.openButton')}</TooltipContent>
      </Tooltip>
      {open && (
        <ReportComposerDialog
          open={open}
          onOpenChange={handleOpenChange}
          scope={{ kind: 'board', boardId, workspaceId }}
        />
      )}
    </TooltipProvider>
  );
}
