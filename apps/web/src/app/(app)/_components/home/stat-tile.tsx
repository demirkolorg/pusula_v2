'use client';

import type { ComponentType, SVGProps } from 'react';
import { cn } from '@pusula/ui';

/** Semantic accent of a stat tile — drives the icon badge colour. */
export type StatTone = 'primary' | 'success' | 'warning' | 'destructive';

const TONE_CLASS: Record<StatTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning-foreground',
  destructive: 'bg-destructive/12 text-destructive',
};

type StatTileProps = {
  label: string;
  value: number;
  /** Lucide icon component for the badge. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: StatTone;
  /** Optional supporting line under the value (delta, hint, …). */
  sub?: string;
  className?: string;
};

/**
 * A single metric box in the workspace stat strip (DEM-192): a small tinted
 * icon badge, the label, a large tabular number and an optional sub line.
 * Token-driven so it reads correctly in both themes.
 */
export function StatTile({ label, value, icon: Icon, tone, sub, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'bg-card shadow-card flex flex-col gap-3 rounded-md border p-4',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md',
            TONE_CLASS[tone],
          )}
          aria-hidden
        >
          <Icon className="size-3.5" />
        </span>
        <span>{label}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {sub && <span className="text-muted-foreground text-[11px]">{sub}</span>}
      </div>
    </div>
  );
}
