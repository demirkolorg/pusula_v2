'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { NotificationCenter } from './notification-center';

export function NotificationBell() {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const unread = useQuery(
    trpc.notifications.unreadCount.queryOptions(undefined, {
      refetchOnWindowFocus: true,
    }),
  );
  const unreadCount = unread.data?.count ?? 0;
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={strings.notifications.bellAria(unreadCount)}
              className="relative size-9"
            >
              <BellIcon className="size-4" aria-hidden />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none tabular-nums"
                >
                  {badgeLabel}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{strings.notifications.bellAria(unreadCount)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <NotificationCenter onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
