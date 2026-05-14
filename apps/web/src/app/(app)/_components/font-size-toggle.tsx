'use client';

import { ALargeSmallIcon, MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@pusula/ui';
import { useFontScalePreference } from '../../_components/font-size-provider';
import { strings } from '@/lib/strings';

export function FontSizeToggle({ className }: { className?: string }) {
  const fontScale = useFontScalePreference();
  const labels = strings.shell.fontSize;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.trigger}
          title={labels.trigger}
          className={cn('size-9', className)}
        >
          <ALargeSmallIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>{labels.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{fontScale.percent}%</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!fontScale.canDecrease}
          onSelect={(event) => {
            event.preventDefault();
            fontScale.decrease();
          }}
        >
          <MinusIcon className="size-4" aria-hidden />
          {labels.decrease}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!fontScale.canIncrease}
          onSelect={(event) => {
            event.preventDefault();
            fontScale.increase();
          }}
        >
          <PlusIcon className="size-4" aria-hidden />
          {labels.increase}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            fontScale.reset();
          }}
        >
          <RotateCcwIcon className="size-4" aria-hidden />
          {labels.reset}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
