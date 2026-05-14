'use client';

import { BellIcon } from 'lucide-react';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

export function NotificationBellPlaceholder() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={strings.shell.notifications.label}
            disabled
          >
            <BellIcon className="size-4" aria-hidden />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{strings.shell.notifications.soon}</TooltipContent>
    </Tooltip>
  );
}
