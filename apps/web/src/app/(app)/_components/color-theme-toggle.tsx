'use client';

import { CheckIcon, PaletteIcon } from 'lucide-react';
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
import { type ColorThemeId, useColorTheme } from '../../_components/color-theme-provider';
import { strings } from '@/lib/strings';

/**
 * Tema kataloğu — sıralama dropdown'da görünür. Swatch dot rengi her temanın
 * light-variant `--primary` değerini doğrudan yansıtır (görsel ipucu); CSS
 * tarafıyla tek kaynaklı bağlama gerek yok çünkü swatch sabit referans renk.
 */
const THEME_SWATCHES: Array<{ id: ColorThemeId; swatch: string }> = [
  { id: 'slate', swatch: 'oklch(0.46 0.17 265)' },
  { id: 'default', swatch: 'oklch(0.56 0.17 275)' },
  { id: 'zinc', swatch: 'oklch(0.45 0.005 286)' },
  { id: 'stone', swatch: 'oklch(0.45 0.008 49)' },
  { id: 'neutral', swatch: 'oklch(0.45 0 0)' },
  { id: 'rose', swatch: 'oklch(0.62 0.22 11)' },
  { id: 'red', swatch: 'oklch(0.58 0.22 27)' },
  { id: 'orange', swatch: 'oklch(0.65 0.2 50)' },
  { id: 'amber', swatch: 'oklch(0.78 0.16 80)' },
  { id: 'green', swatch: 'oklch(0.55 0.18 145)' },
  { id: 'blue', swatch: 'oklch(0.55 0.21 250)' },
  { id: 'cyan', swatch: 'oklch(0.6 0.13 205)' },
  { id: 'violet', swatch: 'oklch(0.55 0.22 295)' },
  { id: 'whatsapp', swatch: '#25d366' },
  { id: 'discord', swatch: '#5865f2' },
];

export function ColorThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useColorTheme();
  const labels = strings.shell.colorTheme;

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
              <PaletteIcon className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{labels.trigger}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{labels.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_SWATCHES.map(({ id, swatch }) => {
          const isActive = theme === id;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={(event) => {
                event.preventDefault();
                setTheme(id);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="border-border size-4 shrink-0 rounded-full border"
                  style={{ backgroundColor: swatch }}
                />
                <span>{labels.themes[id]}</span>
              </span>
              {isActive ? (
                <CheckIcon className="text-muted-foreground size-4" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
