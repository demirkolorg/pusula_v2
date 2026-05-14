'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { LIST_COLORS, type ListColor } from '@pusula/domain';
import { Button, cn, toast } from '@pusula/ui';
import {
  applyListPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type ListColorPickerProps = {
  boardId: string;
  listId: string;
  value: ListColor | null;
};

const SWATCH_BG: Record<ListColor, string> = {
  yesil: 'bg-palet-yesil',
  sari: 'bg-palet-sari',
  turuncu: 'bg-palet-turuncu',
  kirmizi: 'bg-palet-kirmizi',
  mor: 'bg-palet-mor',
  mavi: 'bg-palet-mavi',
  sky: 'bg-palet-sky',
  lime: 'bg-palet-lime',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
};

const CHECK_FG: Record<ListColor, string> = {
  yesil: 'text-palet-yesil-foreground',
  sari: 'text-palet-sari-foreground',
  turuncu: 'text-palet-turuncu-foreground',
  kirmizi: 'text-palet-kirmizi-foreground',
  mor: 'text-palet-mor-foreground',
  mavi: 'text-palet-mavi-foreground',
  sky: 'text-palet-sky-foreground',
  lime: 'text-palet-lime-foreground',
  pembe: 'text-palet-pembe-foreground',
  gri: 'text-palet-gri-foreground',
};

export function ListColorPicker({ boardId, listId, value }: ListColorPickerProps) {
  const trpc = useTRPC();
  const copy = strings.board.list.colorPicker;

  const updateColor = useOptimisticBoardMutation({
    mutationOptions: trpc.list.update.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.color === undefined ? data : applyListPatch(data, vars.listId, { color: vars.color }),
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
  });

  const selectColor = (next: ListColor | null) => {
    if (next === value || updateColor.isPending) return;
    updateColor.mutate({ boardId, listId, color: next });
  };

  const error = getMutationErrorMessage(updateColor);

  return (
    <div role="group" aria-label={copy.title} className="w-[12.75rem] space-y-2 p-1">
      <div className="grid grid-cols-5 gap-1.5">
        {LIST_COLORS.map((color) => {
          const selected = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={copy.colors[color]}
              aria-pressed={selected}
              disabled={updateColor.isPending}
              onClick={() => selectColor(color)}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border border-border/30 outline-none hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                SWATCH_BG[color],
              )}
            >
              {selected && <CheckIcon className={cn('size-4', CHECK_FG[color])} aria-hidden />}
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-center"
        disabled={value === null || updateColor.isPending}
        onClick={() => selectColor(null)}
      >
        <XIcon className="size-4" aria-hidden />
        {copy.clear}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
