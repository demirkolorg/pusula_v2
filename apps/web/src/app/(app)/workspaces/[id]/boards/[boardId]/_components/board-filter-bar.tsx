'use client';

import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  LabelChip,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_PALETTE } from './label-colors';

export type BoardFilterLabel = { id: string; name: string; color: string };

export type BoardFilterMenuContentProps = {
  labels: BoardFilterLabel[];
  selectedLabelIds: ReadonlySet<string>;
  onToggleLabel: (labelId: string) => void;
  onClearLabels: () => void;
};

function isLabelColor(color: string): color is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(color);
}

export function BoardFilterMenuContent({
  labels,
  selectedLabelIds,
  onToggleLabel,
  onClearLabels,
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
    </>
  );
}
