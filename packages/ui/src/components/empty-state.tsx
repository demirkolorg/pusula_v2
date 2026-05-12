import * as React from 'react';
import { cn } from '../lib/utils';

export interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Leading icon — caller sizes it (e.g. `size-8`). */
  icon?: React.ReactNode;
  message: React.ReactNode;
  /** Optional call-to-action. */
  action?: React.ReactNode;
}

/** Centered empty-state placeholder for lists/sections with no content yet. */
function EmptyState({ icon, message, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center gap-2 py-6 text-center', className)}
      {...props}
    >
      {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export { EmptyState };
