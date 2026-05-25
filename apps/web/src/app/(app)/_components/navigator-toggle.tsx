'use client';

import { CompassIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type NavigatorToggleProps = {
  open: boolean;
  onToggle: () => void;
};

/**
 * Global "Gezgin" toggle butonu — `AppShell` header'ında `NotificationBell`'in
 * solunda. Tıklayınca sol panel açılır/kapanır. `aria-pressed` ile durum,
 * `open` iken hafif vurgu (`bg-accent/40`).
 *
 * Stil olarak `NotificationBell` ile uyumlu: ghost variant, `size-9`. Board
 * ekranındaki chrome (koyu) renkte de iç-text inherit edilir.
 */
export function NavigatorToggle({ open, onToggle }: NavigatorToggleProps) {
  const label = strings.board.navigator.toggle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={open}
          aria-label={label}
          onClick={onToggle}
          className={cn('relative size-9', open && 'bg-accent/40')}
        >
          <CompassIcon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
