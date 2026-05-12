import * as React from 'react';
import { cn } from '../lib/utils';

export interface ProgressProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  value: number;
  max?: number;
  /** Force the "complete" colour; defaults to `value >= max`. */
  complete?: boolean;
}

/**
 * Slim determinate progress bar. Not Radix-based — a plain `role="progressbar"`
 * div is enough for our checklist/completion meters.
 */
function Progress({ value, max = 100, complete, className, ...props }: ProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = Math.round((clamped / safeMax) * 100);
  const isComplete = complete ?? clamped >= safeMax;

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          isComplete ? 'bg-success' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
