/**
 * Faz 13H (DEM-264) — Kaydedilmiş sekmesi empty state.
 *
 * CTA: "İlk raporunu oluştur" → workspace scope composer aç.
 */
'use client';

import { BarChart3Icon } from 'lucide-react';
import { Button } from '@pusula/ui';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface EmptyStateSavedProps {
  onCreate?: () => void;
  canCreate: boolean;
}

export function EmptyStateSaved({ onCreate, canCreate }: EmptyStateSavedProps) {
  const { t } = useReportI18n();
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-16 text-center"
      role="status"
      aria-live="polite"
      data-testid="reports-empty-saved"
    >
      <BarChart3Icon className="size-10 text-muted-foreground/60" aria-hidden />
      <h2 className="text-base font-semibold">
        {t('reports.list.empty.savedTitle')}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('reports.list.empty.savedDescription')}
      </p>
      {canCreate && onCreate && (
        <Button onClick={onCreate} className="mt-2" data-testid="reports-empty-saved-cta">
          {t('reports.list.empty.savedCta')}
        </Button>
      )}
    </div>
  );
}
