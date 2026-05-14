'use client';

import { InfoIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';

type InfoTooltipButtonProps = {
  label: string;
  content: string;
  className?: string;
};

export function InfoTooltipButton({ label, content, className }: InfoTooltipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground hover:text-foreground size-7 shrink-0', className)}
          aria-label={label}
        >
          <InfoIcon className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 leading-relaxed">{content}</TooltipContent>
    </Tooltip>
  );
}
