'use client';

import { type LabelColor } from '@pusula/domain';
import { Badge, Button, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_SWATCH } from './label-colors';

export type BoardFilterLabel = { id: string; name: string; color: string };

type BoardFilterBarProps = {
  /** The board's labels (the filter chips). May be empty. */
  labels: BoardFilterLabel[];
  /** Currently-selected label ids (a card shows if it has at least one). */
  selectedLabelIds: ReadonlySet<string>;
  /** Toggle a label id in/out of the selection. */
  onToggleLabel: (labelId: string) => void;
  /** Clear all selected labels. */
  onClearLabels: () => void;
  /** Whether archived lists are currently shown. */
  showArchivedLists: boolean;
  /** Toggle the archived-lists visibility. */
  onToggleArchivedLists: () => void;
  /** How many archived lists exist on the board (shown next to the toggle). */
  archivedListCount: number;
};

/** Small round colour swatch for a label token. */
function Swatch({ color }: { color: string }) {
  const cls = LABEL_SWATCH[color as LabelColor] ?? 'bg-muted';
  return <span className={cn('inline-block size-3 shrink-0 rounded-full', cls)} aria-hidden />;
}

/**
 * Filter bar above the board columns: label chips (multi-select — a card shows
 * if it has at least one selected label) + an "show archived lists" toggle.
 * Presentational — `BoardColumns` owns the (local) filter state. Renders the
 * archived-lists toggle even when there are no labels.
 */
export function BoardFilterBar({
  labels,
  selectedLabelIds,
  onToggleLabel,
  onClearLabels,
  showArchivedLists,
  onToggleArchivedLists,
  archivedListCount,
}: BoardFilterBarProps) {
  const copy = strings.board.filter;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground font-medium">{copy.labelsTitle}:</span>
        {labels.length === 0 ? (
          <span className="text-muted-foreground">{copy.noLabels}</span>
        ) : (
          <>
            {labels.map((label) => {
              const on = selectedLabelIds.has(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => onToggleLabel(label.id)}
                  aria-pressed={on}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                    on ? 'border-foreground bg-muted' : 'border-transparent bg-muted/60 hover:bg-muted',
                  )}
                >
                  <Swatch color={label.color} />
                  <span>{label.name.trim() || copy.unnamedLabel}</span>
                </button>
              );
            })}
            {selectedLabelIds.size > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onClearLabels}>
                {copy.clearLabels}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onToggleArchivedLists}>
          {showArchivedLists ? copy.hideArchivedLists : copy.showArchivedLists}
        </Button>
        {archivedListCount > 0 && (
          <Badge variant="secondary">
            {archivedListCount} {copy.archivedListCount}
          </Badge>
        )}
      </div>
    </div>
  );
}
