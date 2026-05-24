/**
 * Faz 13L (DEM-268) — tek micro-report widget'ı için "Resim olarak indir"
 * dropdown menüsü. `MicroReportGrid` her widget'ın sağ üst köşesine bunu
 * absolute positioned overlay olarak yerleştirir. Panel mode'da görünür,
 * print mode'da gizli (`panel-only` class'ı print.css'te `display: none`).
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9 (PNG/SVG export).
 */
'use client';

import { FileImageIcon, ImageIcon, MoreVerticalIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pusula/ui';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface MicroReportPngExportMenuProps {
  microReportId: string;
  disabled?: boolean;
  onExport: (input: { microReportId: string; format: 'png' | 'svg' }) => void;
}

export function MicroReportPngExportMenu({
  microReportId,
  disabled,
  onExport,
}: MicroReportPngExportMenuProps) {
  const { t } = useReportI18n();
  return (
    <div className="absolute right-2 top-2 z-10 panel-only">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            data-testid={`report-widget-export-trigger-${microReportId}`}
            aria-label={t('reports.actions.export.image')}
          >
            <MoreVerticalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => onExport({ microReportId, format: 'png' })}
            data-testid={`report-widget-export-png-${microReportId}`}
          >
            <ImageIcon className="size-3.5" />
            {t('reports.actions.export.png')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onExport({ microReportId, format: 'svg' })}
            data-testid={`report-widget-export-svg-${microReportId}`}
          >
            <FileImageIcon className="size-3.5" />
            {t('reports.actions.export.svg')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
