'use client';

import { CalendarClockIcon } from 'lucide-react';
import { useReportI18n } from '../hooks/use-report-i18n';

export function EmptyStateScheduled() {
  const { t } = useReportI18n();
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-16 text-center"
      role="status"
      aria-live="polite"
      data-testid="reports-empty-scheduled"
    >
      <CalendarClockIcon className="size-10 text-muted-foreground/60" aria-hidden />
      <h2 className="text-base font-semibold">
        {t('reports.list.empty.scheduledTitle')}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('reports.list.empty.scheduledDescription')}
      </p>
    </div>
  );
}
