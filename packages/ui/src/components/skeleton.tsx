import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * shadcn-style skeleton — animate-pulse placeholder. Faz 13F report
 * loading states + `<ReportSkeleton variant>` wrapper'ı tarafından
 * kullanılır.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent motion-reduce:animate-none animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

export { Skeleton };
