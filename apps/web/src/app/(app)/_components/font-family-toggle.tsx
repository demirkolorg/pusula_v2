'use client';

import { CheckIcon, RotateCcwIcon, TypeIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { strings } from '@/lib/strings';

export function FontFamilyToggle({ className }: { className?: string }) {
  const fontFamily = useFontFamilyPreference();
  const labels = strings.shell.fontFamily;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.trigger}
              className={cn('size-9', className)}
            >
              <TypeIcon className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{labels.trigger}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{labels.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FONT_FAMILIES.map((font) => {
          const isActive = fontFamily.family === font.id;
          const optionLabel = labels.options[font.id as FontFamilyId];
          return (
            <DropdownMenuItem
              key={font.id}
              aria-label={optionLabel}
              onSelect={(event) => {
                event.preventDefault();
                fontFamily.select(font.id);
              }}
              className="flex items-center justify-between gap-3"
            >
              <span
                className="flex flex-col leading-tight"
                style={{ fontFamily: font.cssValue }}
              >
                <span className="text-sm">{optionLabel}</span>
                <span className="text-muted-foreground text-xs" aria-hidden>
                  {labels.preview}
                </span>
              </span>
              {isActive ? (
                <CheckIcon className="text-primary size-4 shrink-0" aria-hidden />
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={fontFamily.family === DEFAULT_FONT_FAMILY}
          onSelect={(event) => {
            event.preventDefault();
            fontFamily.reset();
          }}
        >
          <RotateCcwIcon className="size-4" aria-hidden />
          {labels.reset}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
