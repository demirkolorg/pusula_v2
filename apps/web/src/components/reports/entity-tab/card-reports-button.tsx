/**
 * Faz 13G (DEM-263) — card detail header "Raporlar" butonu.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.4.
 * Kullanıcı kararı (2026-05-24): Card detail modal'da Tabs YOK; mevcut
 * yapıya dokunmamak için ayrı dialog (overlay üstüne) açan buton.
 *
 * Card meta chips row'una veya CardModalHeader sağ tarafına yerleştirilir.
 */
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3Icon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { useReportI18n } from '../hooks/use-report-i18n';
import { ReportComposerDialog } from '../composer/report-composer-dialog';

export interface CardReportsButtonProps {
  cardId: string;
  boardId: string;
  /**
   * Optional override — `CardModalHeader`'a yeni prop drilling yapmamak
   * için `useParams<{id}>()` ile route'tan resolve eder (Pusula
   * `(app)/workspaces/[id]/boards/[boardId]` rotası).
   */
  workspaceId?: string;
  className?: string;
  /**
   * İkon-only varyant: card modal header'da label yerine Tooltip ile etiket
   * gösterir. `onColored` kapak rengi açıkken kontrast için.
   */
  iconOnly?: boolean;
  onColored?: boolean;
}

export function CardReportsButton({
  cardId,
  boardId,
  workspaceId: workspaceIdProp,
  className,
  iconOnly = false,
  onColored = false,
}: CardReportsButtonProps) {
  const { t } = useReportI18n();
  const params = useParams<{ id?: string }>();
  const workspaceId = workspaceIdProp ?? params?.id ?? '';
  const [open, setOpen] = useState(false);

  if (!workspaceId) return null;

  const label = t('reports.entity.card.openButton');

  const trigger = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => setOpen(true)}
          data-testid="card-reports-button"
          className={cn(
            'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&_svg]:size-4',
            onColored
              ? 'text-current hover:bg-current/15'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            className,
          )}
        >
          <BarChart3Icon aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setOpen(true)}
      className={cn('gap-1.5', className)}
      data-testid="card-reports-button"
    >
      <BarChart3Icon className="size-3.5" />
      {label}
    </Button>
  );

  return (
    <>
      {trigger}
      {open && (
        <ReportComposerDialog
          open={open}
          onOpenChange={setOpen}
          scope={{ kind: 'card', cardId, boardId, workspaceId }}
        />
      )}
    </>
  );
}
