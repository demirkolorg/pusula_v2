import { Skeleton } from '../../components/skeleton';
import { cn } from '../../lib/utils';

export type ReportSkeletonVariant = 'kpi' | 'chart' | 'table' | 'timeline' | 'banner';

export interface ReportSkeletonProps {
  variant: ReportSkeletonVariant;
  /** Tek bir variant'ın kaç satırını render edeceği (tablo/timeline için). */
  rows?: number;
  className?: string;
}

/**
 * Loading state — micro-report verisi yüklenirken layout-stable
 * placeholder. Tüm varyantlar shadcn `Skeleton` üstüne kurulu.
 */
export function ReportSkeleton({ variant, rows = 5, className }: ReportSkeletonProps) {
  switch (variant) {
    case 'kpi':
      return (
        <div data-slot="report-skeleton" data-variant="kpi" className={cn('flex flex-col gap-2 p-3', className)}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      );
    case 'chart':
      return (
        <div
          data-slot="report-skeleton"
          data-variant="chart"
          className={cn('flex flex-col gap-3', className)}
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-48 w-full" />
        </div>
      );
    case 'table':
      return (
        <div
          data-slot="report-skeleton"
          data-variant="table"
          className={cn('flex flex-col gap-2', className)}
        >
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      );
    case 'timeline':
      return (
        <div
          data-slot="report-skeleton"
          data-variant="timeline"
          className={cn('flex flex-col gap-3', className)}
        >
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    case 'banner':
      return (
        <Skeleton
          data-slot="report-skeleton"
          data-variant="banner"
          className={cn('h-10 w-full', className)}
        />
      );
  }
}
