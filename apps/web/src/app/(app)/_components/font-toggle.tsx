'use client';

import { CheckIcon, MinusIcon, PlusIcon, RotateCcwIcon, TypeIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILIES,
  type FontFamilyId,
  useFontFamilyPreference,
} from '../../_components/font-family-provider';
import { useFontScalePreference } from '../../_components/font-size-provider';
import { strings } from '@/lib/strings';

export function FontToggle({ className }: { className?: string }) {
  const fontFamily = useFontFamilyPreference();
  const fontScale = useFontScalePreference();
  const familyLabels = strings.shell.fontFamily;
  const sizeLabels = strings.shell.fontSize;
  const triggerLabel = strings.shell.fontToggle.trigger;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={triggerLabel}
              className={cn('size-9', className)}
            >
              <TypeIcon className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{triggerLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[26rem] p-2">
        <div className="grid grid-cols-2 gap-2">
          <DropdownMenuGroup className="border-border/60 border-r pr-2">
            <DropdownMenuLabel className="flex items-center justify-between gap-2 pb-1">
              <span>{sizeLabels.label}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {fontScale.percent}%
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!fontScale.canDecrease}
              onSelect={(event) => {
                event.preventDefault();
                fontScale.decrease();
              }}
            >
              <MinusIcon className="size-4" aria-hidden />
              {sizeLabels.decrease}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!fontScale.canIncrease}
              onSelect={(event) => {
                event.preventDefault();
                fontScale.increase();
              }}
            >
              <PlusIcon className="size-4" aria-hidden />
              {sizeLabels.increase}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                fontScale.reset();
              }}
            >
              <RotateCcwIcon className="size-4" aria-hidden />
              {sizeLabels.reset}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuGroup>
            <DropdownMenuLabel className="pb-1">{familyLabels.label}</DropdownMenuLabel>
            {FONT_FAMILIES.map((font) => {
              const isActive = fontFamily.family === font.id;
              const optionLabel = familyLabels.options[font.id as FontFamilyId];
              return (
                <DropdownMenuItem
                  key={font.id}
                  aria-label={optionLabel}
                  onSelect={(event) => {
                    event.preventDefault();
                    fontFamily.select(font.id);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className="min-w-0 truncate text-sm"
                    style={{ fontFamily: font.cssValue }}
                  >
                    {optionLabel}
                  </span>
                  {isActive ? (
                    <CheckIcon className="text-primary size-4 shrink-0" aria-hidden />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem
              disabled={fontFamily.family === DEFAULT_FONT_FAMILY}
              onSelect={(event) => {
                event.preventDefault();
                fontFamily.reset();
              }}
            >
              <RotateCcwIcon className="size-4" aria-hidden />
              {familyLabels.reset}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
