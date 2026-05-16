'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const ariaLabel = isDark ? strings.shell.themeToggleToLight : strings.shell.themeToggleToDark;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          onClick={() => setTheme(nextTheme)}
          className={cn('size-9', className)}
        >
          {mounted ? (
            isDark ? (
              <MoonIcon className="size-4" aria-hidden />
            ) : (
              <SunIcon className="size-4" aria-hidden />
            )
          ) : (
            <span className="size-4" aria-hidden />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ariaLabel}</TooltipContent>
    </Tooltip>
  );
}
