'use client';

import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type HomeBreadcrumbProps = {
  workspaceName: string | null;
  boardTitle: string | null;
  listTitle: string | null;
  /** Reset selection to the workspaces column (drops `ws` + `board` + `list`). */
  onResetAll: () => void;
  /** Keep `ws`, drop `board` + `list`. */
  onResetToBoards: () => void;
  /** Keep `ws` + `board`, drop `list`. */
  onResetToLists: () => void;
  className?: string;
};

/**
 * Responsive accordion breadcrumb shown only on `<lg` screens (§13.11).
 * On `lg+` the four columns sit side-by-side and this strip is hidden.
 *
 * Each crumb is a `<button>` that re-targets the selection one column
 * shallower (drops the trailing search params). The last segment shows the
 * current selection without an action.
 */
export function HomeBreadcrumb({
  workspaceName,
  boardTitle,
  listTitle,
  onResetAll,
  onResetToBoards,
  onResetToLists,
  className,
}: HomeBreadcrumbProps) {
  const copy = strings.home.breadcrumb;

  // Compose crumbs in order. The last item is treated as the active column and
  // rendered as plain text (not actionable).
  const crumbs: Array<{ key: string; label: string; onClick?: () => void }> = [
    { key: 'home', label: copy.home, onClick: onResetAll },
  ];
  if (workspaceName) {
    crumbs.push({ key: 'ws', label: workspaceName, onClick: onResetToBoards });
  }
  if (boardTitle) {
    crumbs.push({ key: 'board', label: boardTitle, onClick: onResetToLists });
  }
  if (listTitle) {
    crumbs.push({ key: 'list', label: listTitle });
  }

  // Remove the last crumb's onClick (rendered as inert).
  const last = crumbs[crumbs.length - 1];
  if (last) last.onClick = undefined;

  return (
    <nav
      aria-label={copy.navLabel}
      className={cn(
        'bg-card flex items-center gap-1 overflow-x-auto rounded-md border px-3 py-2 text-xs',
        className,
      )}
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={crumb.key} className="flex items-center gap-1">
            {idx === 0 && (
              <HomeIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            )}
            {crumb.onClick ? (
              <button
                type="button"
                onClick={crumb.onClick}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 truncate rounded-sm px-1 outline-none transition-colors focus-visible:ring-2"
              >
                {crumb.label}
              </button>
            ) : (
              <span
                className={cn(
                  'truncate px-1 font-medium',
                  isLast ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {crumb.label}
              </span>
            )}
            {!isLast && (
              <ChevronRightIcon
                className="text-muted-foreground/60 size-3 shrink-0"
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </nav>
  );
}
