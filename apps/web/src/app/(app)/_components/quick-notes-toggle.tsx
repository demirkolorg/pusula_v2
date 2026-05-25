'use client';

import { InboxIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type QuickNotesToggleProps = {
  open: boolean;
  onToggle: () => void;
};

/**
 * Global "Hızlı Notlar" toggle butonu — `AppShell` header'ında `NavigatorToggle`
 * ile birlikte zilin solunda. NavigatorToggle ile birebir aynı stil (`ghost`
 * variant, `size-9`); açıkken `aria-pressed` + hafif vurgu (`bg-accent/40`).
 */
export function QuickNotesToggle({ open, onToggle }: QuickNotesToggleProps) {
  const label = strings.board.quickNotes.toggle;

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
          <InboxIcon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
