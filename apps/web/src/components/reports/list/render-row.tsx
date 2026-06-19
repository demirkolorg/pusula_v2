/**
 * Faz 13H (DEM-264) — render history satırı.
 *
 * Anatomi:
 *   - Sol: rapor başlığı (saved ise link, ad-hoc ise "Ad-hoc render") +
 *     scope
 *   - Orta: format rozeti + tetikleyici rozeti + status rozeti
 *   - Sağ: tarih + indir butonu (completed) veya errorMessage tooltip
 *     (failed)
 *
 * Status rozetleri renkli + ikonlu (loading/check/x/clock).
 */
'use client';

import { useState } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  DownloadIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import type { ReportRenderFormat, ReportRenderStatus } from '@pusula/domain';
import { useReportI18n } from '../hooks/use-report-i18n';
import { useTRPC } from '@/trpc/client';

export interface RenderRowData {
  id: string;
  workspaceId: string;
  savedReportId: string | null;
  presetId: string;
  status: ReportRenderStatus;
  format: ReportRenderFormat;
  triggerKind: string;
  triggeredBy: string | null;
  errorMessage: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

export interface RenderRowProps {
  workspaceId: string;
  render: RenderRowData;
}

export function RenderRow({ workspaceId, render }: RenderRowProps) {
  const { t } = useReportI18n();
  const trpc = useTRPC();
  const [downloadOpen, setDownloadOpen] = useState(false);

  // Asset signed URL — sadece status='completed' ve kullanıcı indir
  // butonuna bastığında fetch (lazy; her render satırında otomatik fetch
  // gereksiz N+1 olurdu).
  const assetQuery = useQuery({
    ...trpc.report.getRender.queryOptions({ renderId: render.id }),
    enabled: downloadOpen && render.status === 'completed',
    staleTime: 4 * 60 * 1000, // signed URL 5dk; cache 4dk.
  });

  function handleDownloadClick() {
    if (render.status !== 'completed') return;
    if (!downloadOpen) {
      setDownloadOpen(true);
      return;
    }
    const url = assetQuery.data?.assets[0]?.downloadUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  const presetTitleKey = `reports.presets.${render.presetId}.title`;
  const presetTitle = t(presetTitleKey);
  const presetLabel = presetTitle === presetTitleKey ? render.presetId : presetTitle;

  return (
    <li
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-shadow hover:shadow-sm"
      data-testid={`render-row-${render.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-semibold">
          {render.savedReportId ? (
            <a
              href={`/workspaces/${workspaceId}/reports/${render.savedReportId}`}
              className="truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
              data-testid="render-row-link"
            >
              {presetLabel}
            </a>
          ) : (
            <span className="truncate text-muted-foreground italic">
              {t('reports.list.adhocRender')}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px] font-medium">
            {render.format.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-medium">
            {t(`reports.list.trigger.${render.triggerKind}`)}
          </Badge>
          <StatusBadge status={render.status} errorMessage={render.errorMessage} t={t} />
          <span aria-hidden>·</span>
          <span>{formatDateShort(render.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {render.status === 'completed' && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadClick}
                  disabled={assetQuery.isFetching}
                  data-testid="render-row-download"
                >
                  <DownloadIcon className="size-4" />
                  {downloadOpen
                    ? assetQuery.data?.assets[0]?.downloadUrl
                      ? t('reports.list.actions.openDownload')
                      : t('reports.list.actions.preparing')
                    : t('reports.list.actions.download')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('reports.list.actions.downloadTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {render.status === 'failed' && (
          <span className="text-xs text-destructive" data-testid="render-row-failed-label">
            {t('reports.list.failedHint')}
          </span>
        )}
      </div>
    </li>
  );
}

function StatusBadge({
  status,
  errorMessage,
  t,
}: {
  status: ReportRenderStatus;
  errorMessage: string | null;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const badge = (
    <Badge
      variant="outline"
      className={cn('inline-flex items-center gap-1 text-[10px] font-medium', config.className)}
      data-testid={`render-row-status-${status}`}
    >
      <Icon className={cn('size-3', config.iconClassName)} aria-hidden />
      {t(`reports.list.status.${status}`)}
    </Badge>
  );

  if (status !== 'failed' || !errorMessage) return badge;

  // PII-safe errorMessage UI'da i18n key olarak gelir (13I worker tarafı).
  // `t(errorMessage)` direkt resolve eder; eksik key fallback key string.
  const resolved = t(errorMessage);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {resolved === errorMessage ? errorMessage : resolved}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const STATUS_CONFIG: Record<
  ReportRenderStatus,
  {
    icon: typeof ClockIcon;
    iconClassName?: string;
    className: string;
  }
> = {
  queued: {
    icon: ClockIcon,
    iconClassName: 'text-muted-foreground',
    className: 'border-muted-foreground/30',
  },
  rendering: {
    icon: Loader2Icon,
    iconClassName: 'animate-spin text-primary',
    className: 'border-primary/40 bg-primary/5 text-primary',
  },
  completed: {
    icon: CheckCircle2Icon,
    iconClassName: 'text-success',
    className: 'border-success/40 bg-success/5 text-success',
  },
  failed: {
    icon: XCircleIcon,
    iconClassName: 'text-destructive',
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  expired: {
    icon: AlertCircleIcon,
    iconClassName: 'text-amber-600',
    className: 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
};

function formatDateShort(iso: Date | string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return String(iso);
  }
}
