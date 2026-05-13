'use client';

import { useId } from 'react';
import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import { Badge, Button, Checkbox, LabelChip, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_PALETTE } from './label-colors';

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

/** Whether `color` is one of the domain's known label colours. */
function isLabelColor(color: string): color is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(color);
}

/**
 * Filter bar above the board columns: label chips (multi-select — a card shows
 * if it has at least one selected label) + an "show archived lists" checkbox.
 * Presentational — `BoardColumns` owns the (local) filter state. The archived
 * checkbox is always rendered; chips only when the board has labels.
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
  const archivedToggleId = useId();

  return (
    <div className="bg-card flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm shadow-xs">
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
                    'inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    on && 'ring-2 ring-primary/60',
                  )}
                >
                  {isLabelColor(label.color) ? (
                    <LabelChip
                      color={LABEL_PALETTE[label.color]}
                      name={label.name.trim() || undefined}
                      variant={on ? 'solid' : 'soft'}
                    />
                  ) : (
                    <span className="bg-muted text-muted-foreground inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                      {label.name.trim() || copy.unnamedLabel}
                    </span>
                  )}
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

      <div className="ml-auto flex items-center gap-2">
        <label htmlFor={archivedToggleId} className="text-muted-foreground flex items-center gap-2">
          <Checkbox
            id={archivedToggleId}
            checked={showArchivedLists}
            onCheckedChange={() => onToggleArchivedLists()}
          />
          {copy.archivedListsToggle}
        </label>
        {archivedListCount > 0 && (
          <Badge variant="secondary">
            {archivedListCount} {copy.archivedListCount}
          </Badge>
        )}
      </div>
    </div>
  );
}
