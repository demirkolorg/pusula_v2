'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIcon, InfoIcon } from 'lucide-react';
import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@pusula/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { summarizeCardActivity, type CardActivityEvent } from './card-detail/activity-summary';

type BoardActivityDrawerProps = {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PAGE_SIZE = 20;

export function BoardActivityDrawer({ boardId, open, onOpenChange }: BoardActivityDrawerProps) {
  const copy = strings.board.activity;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [extraItems, setExtraItems] = useState<CardActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const firstPageOptions = trpc.board.activity.list.queryOptions(
    { boardId, limit: PAGE_SIZE },
    { enabled: open },
  );
  const firstPage = useQuery(firstPageOptions);

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(undefined);
    setLoadingMore(false);
  }, [boardId, open]);

  const items = useMemo(
    () => [...(firstPage.data?.items ?? []), ...extraItems],
    [extraItems, firstPage.data?.items],
  );
  const currentNextCursor =
    nextCursor === undefined ? (firstPage.data?.nextCursor ?? null) : nextCursor;

  async function loadMore() {
    if (!currentNextCursor) return;
    setLoadingMore(true);
    try {
      const page = await queryClient.fetchQuery(
        trpc.board.activity.list.queryOptions({
          boardId,
          limit: PAGE_SIZE,
          cursor: currentNextCursor,
        }),
      );
      setExtraItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={strings.common.close}
        className="top-0 right-0 left-auto flex h-svh w-[min(420px,100vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b px-4 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="size-4" aria-hidden />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {firstPage.isPending ? (
            <ul className="space-y-3" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="bg-muted size-5 shrink-0 animate-pulse rounded-full" />
                  <span className="bg-muted h-3 flex-1 animate-pulse rounded" />
                </li>
              ))}
            </ul>
          ) : firstPage.isError ? (
            <p className="text-destructive text-sm">
              {firstPage.error?.message || copy.loadErrorTitle}
            </p>
          ) : items.length === 0 ? (
            <EmptyState icon={<ActivityIcon className="size-8" />} message={copy.empty} />
          ) : (
            <div className="space-y-4">
              <ul className="space-y-3">
                {items.map((event) => (
                  <li key={event.id} className="flex items-start gap-2 text-xs">
                    <Avatar name={event.actorName} size="xs" />
                    <span className="min-w-0 flex-1 break-words">
                      {summarizeCardActivity(event, copy.unknownActor)}{' '}
                      <span className="text-muted-foreground">· {formatDate(event.createdAt)}</span>
                    </span>
                    <InfoIcon
                      className="text-muted-foreground mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                  </li>
                ))}
              </ul>
              {currentNextCursor && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    void loadMore();
                  }}
                  disabled={loadingMore}
                >
                  {loadingMore ? copy.loadingMore : copy.loadMore}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
