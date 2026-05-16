'use client';

import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  LabelChip,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { DUE_DATE_FILTERS, type DueDateFilter } from './board-filter';
import { LABEL_PALETTE } from './label-colors';

export type BoardFilterLabel = { id: string; name: string; color: string };

export type BoardFilterMenuContentProps = {
  labels: BoardFilterLabel[];
  selectedLabelIds: ReadonlySet<string>;
  onToggleLabel: (labelId: string) => void;
  onClearLabels: () => void;
  dueDateFilter: DueDateFilter;
  onDueDateFilterChange: (filter: DueDateFilter) => void;
};

function isLabelColor(color: string): color is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(color);
}

const DUE_DATE_LABEL_KEYS = {
  all: 'dueDateAll',
  overdue: 'dueDateOverdue',
  day: 'dueDateDay',
  week: 'dueDateWeek',
  month: 'dueDateMonth',
  none: 'dueDateNone',
} as const satisfies Record<DueDateFilter, keyof typeof strings.board.filter>;

export function BoardFilterMenuContent({
  labels,
  selectedLabelIds,
  onToggleLabel,
  onClearLabels,
  dueDateFilter,
  onDueDateFilterChange,
}: BoardFilterMenuContentProps) {
  const copy = strings.board.filter;

  return (
    <>
      <DropdownMenuLabel>{copy.labelsTitle}</DropdownMenuLabel>
      {labels.length === 0 ? (
        <DropdownMenuItem disabled>{copy.noLabels}</DropdownMenuItem>
      ) : (
        labels.map((label) => {
          const selected = selectedLabelIds.has(label.id);
          const displayName = label.name.trim() || copy.unnamedLabel;

          return (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={selected}
              onCheckedChange={() => onToggleLabel(label.id)}
              onSelect={(event) => event.preventDefault()}
            >
              {isLabelColor(label.color) ? (
                <LabelChip
                  color={LABEL_PALETTE[label.color]}
                  name={displayName}
                  variant={selected ? 'solid' : 'soft'}
                />
              ) : (
                <span className="bg-muted text-muted-foreground inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                  {displayName}
                </span>
              )}
            </DropdownMenuCheckboxItem>
          );
        })
      )}

      {selectedLabelIds.size > 0 && (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onClearLabels();
          }}
        >
          {copy.clearLabels}
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuLabel>{copy.dueDateTitle}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={dueDateFilter}
        onValueChange={(value) => onDueDateFilterChange(value as DueDateFilter)}
      >
        {DUE_DATE_FILTERS.map((value) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            onSelect={(event) => event.preventDefault()}
          >
            {copy[DUE_DATE_LABEL_KEYS[value]]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
