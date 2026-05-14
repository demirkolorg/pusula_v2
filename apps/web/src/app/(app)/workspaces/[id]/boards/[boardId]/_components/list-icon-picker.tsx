'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import {
  LIST_ICON_COLORS,
  LIST_ICONS,
  type ListIcon,
  type ListIconColor,
} from '@pusula/domain';
import { Button, cn, toast } from '@pusula/ui';
import {
  applyListPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import {
  LIST_ICON_CHECK_FG,
  LIST_ICON_COMPONENTS,
  LIST_ICON_SWATCH_BG,
} from './list-icon-presentation';

type ListIconPickerProps = {
  boardId: string;
  listId: string;
  value: ListIcon | null;
  color: ListIconColor | null;
};

export function ListIconPicker({ boardId, listId, value, color }: ListIconPickerProps) {
  const trpc = useTRPC();
  const copy = strings.board.list.iconPicker;

  const updateIcon = useOptimisticBoardMutation({
    mutationOptions: trpc.list.update.mutationOptions,
    boardId,
    apply: (data, vars) => {
      const patch: { icon?: ListIcon | null; iconColor?: ListIconColor | null } = {};
      if (vars.icon !== undefined) {
        patch.icon = vars.icon;
        if (vars.icon === null) patch.iconColor = null;
      }
      if (vars.iconColor !== undefined) {
        patch.iconColor = vars.iconColor;
      }
      return Object.keys(patch).length === 0 ? data : applyListPatch(data, vars.listId, patch);
    },
    onConflict: () => toast(strings.board.conflict.refreshed),
    onMutationError: () => toast.error(strings.board.optimistic.error),
  });

  const selectIcon = (next: ListIcon) => {
    if (next === value || updateIcon.isPending) return;
    updateIcon.mutate({ boardId, listId, icon: next });
  };

  const selectColor = (next: ListIconColor) => {
    if (value === null || next === color || updateIcon.isPending) return;
    updateIcon.mutate({ boardId, listId, iconColor: next });
  };

  const clearColor = () => {
    if (color === null || updateIcon.isPending) return;
    updateIcon.mutate({ boardId, listId, iconColor: null });
  };

  const clearIcon = () => {
    if (value === null || updateIcon.isPending) return;
    updateIcon.mutate({ boardId, listId, icon: null });
  };

  const error = getMutationErrorMessage(updateIcon);

  return (
    <div role="group" aria-label={copy.title} className="w-[15rem] space-y-3 p-1">
      <div className="grid grid-cols-4 gap-1.5">
        {LIST_ICONS.map((icon) => {
          const Icon = LIST_ICON_COMPONENTS[icon];
          const selected = value === icon;
          return (
            <button
              key={icon}
              type="button"
              aria-label={copy.icons[icon]}
              aria-pressed={selected}
              disabled={updateIcon.isPending}
              onClick={() => selectIcon(icon)}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground outline-none hover:bg-accent hover:text-foreground hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                selected && 'border-primary text-foreground ring-2 ring-primary/40',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {LIST_ICON_COLORS.map((nextColor) => {
          const selected = color === nextColor;
          return (
            <button
              key={nextColor}
              type="button"
              aria-label={copy.colors[nextColor]}
              aria-pressed={selected}
              disabled={value === null || updateIcon.isPending}
              onClick={() => selectColor(nextColor)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md border border-border/30 outline-none hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35',
                LIST_ICON_SWATCH_BG[nextColor],
              )}
            >
              {selected && (
                <CheckIcon
                  className={cn('size-4', LIST_ICON_CHECK_FG[nextColor])}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          disabled={color === null || updateIcon.isPending}
          onClick={clearColor}
        >
          <XIcon className="size-4" aria-hidden />
          {copy.clearColor}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          disabled={value === null || updateIcon.isPending}
          onClick={clearIcon}
        >
          <XIcon className="size-4" aria-hidden />
          {copy.clearIcon}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
