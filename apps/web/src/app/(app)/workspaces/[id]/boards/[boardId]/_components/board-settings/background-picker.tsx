'use client';

import { CheckIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  BOARD_BACKGROUND_SOLID_COLORS,
  BG_GRADIENT_CLASS,
  BOARD_BACKGROUND_GRADIENTS,
  BOARD_SOLID_BACKGROUND_CLASS,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  boardBackgroundClass,
  cn,
  type BoardBackgroundSolidColor,
} from '@pusula/ui';
import {
  applyBoardPatch,
  getMutationErrorMessage,
  useOptimisticBoardMutation,
} from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardBackgroundPickerProps = {
  boardId: string;
  background: string | null;
  canManage: boolean;
  boardActive: boolean;
};

export function BoardBackgroundPicker({
  boardId,
  background,
  canManage,
  boardActive,
}: BoardBackgroundPickerProps) {
  const trpc = useTRPC();
  const copy = strings.board.background;
  const updateBackground = useOptimisticBoardMutation({
    mutationOptions: trpc.board.update.mutationOptions,
    boardId,
    apply: (data, vars) =>
      vars.background === undefined ? data : applyBoardPatch(data, { background: vars.background }),
  });
  const disabled = !canManage || !boardActive || updateBackground.isPending;
  const error = getMutationErrorMessage(updateBackground);

  const selectBackground = (next: string | null) => {
    if (disabled || next === background) return;
    updateBackground.reset();
    updateBackground.mutate({ boardId, background: next });
  };

  return (
    <div className="space-y-3">
      <Tabs defaultValue="gradient" className="gap-3">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="gradient" className="h-8">
            {copy.tabs.gradient}
          </TabsTrigger>
          <TabsTrigger value="solid" className="h-8">
            {copy.tabs.solid}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gradient" className="mt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {BOARD_BACKGROUND_GRADIENTS.map((name) => {
              const value = `gradient:${name}`;
              const selected = background === value;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={copy.gradientNames[name]}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => selectBackground(value)}
                  className={cn(
                    'relative aspect-[5/3] rounded-md border outline-none ring-offset-2 transition',
                    'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
                    BG_GRADIENT_CLASS[name],
                    selected && 'ring-2 ring-foreground',
                  )}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-card text-foreground shadow-card">
                      <CheckIcon className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="solid" className="mt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button
              type="button"
              aria-label={copy.default}
              aria-pressed={background == null}
              disabled={disabled}
              onClick={() => selectBackground(null)}
              className={cn(
                'relative aspect-[5/3] rounded-md border text-xs font-medium text-[color:var(--board-chrome-fg)] outline-none ring-offset-2 transition',
                'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
                boardBackgroundClass(null),
                background == null && 'ring-2 ring-foreground',
              )}
            >
              {copy.default}
              {background == null && (
                <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-card text-foreground shadow-card">
                  <CheckIcon className="size-3.5" />
                </span>
              )}
            </button>
            {BOARD_BACKGROUND_SOLID_COLORS.map((name: BoardBackgroundSolidColor) => {
              const value = `solid:${name}`;
              const selected = background === value;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={copy.colorNames[name]}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => selectBackground(value)}
                  className={cn(
                    'relative aspect-[5/3] rounded-md border outline-none ring-offset-2 transition',
                    'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
                    BOARD_SOLID_BACKGROUND_CLASS[name],
                    selected && 'ring-2 ring-foreground',
                  )}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-card text-foreground shadow-card">
                      <CheckIcon className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
