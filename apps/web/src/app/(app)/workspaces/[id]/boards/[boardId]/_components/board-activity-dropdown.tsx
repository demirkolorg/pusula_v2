'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { ActivityDetailDialog, ActivityRow } from './card-detail/activity-feed';
import type { CardActivityEvent } from './card-detail/activity-summary';

type BoardActivityDropdownProps = {
  boardId: string;
};

const PAGE_SIZE = 20;

const boardChromeButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

/**
 * Board activity feed as a top-bar dropdown — same surface pattern as the
 * settings / members dropdowns. Each row opens a shared activity detail modal;
 * the dropdown closes when the modal opens so the two never nest.
 */
export function BoardActivityDropdown({ boardId }: BoardActivityDropdownProps) {
  const copy = strings.board.activity;
  const topCopy = strings.board.topBar;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CardActivityEvent | null>(null);
  const [extraItems, setExtraItems] = useState<CardActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const firstPage = useQuery(
    trpc.board.activity.list.queryOptions({ boardId, limit: PAGE_SIZE }, { enabled: open }),
  );

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(undefined);
    setLoadingMore(false);
  }, [boardId, open]);

  // Drop a stale detail modal when the board changes (e.g. board switch) — kept
  // separate from the reset above so it never races `showDetail`'s `setOpen`.
  useEffect(() => {
    setDetailEvent(null);
  }, [boardId]);

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
    } catch {
      toast.error(copy.loadErrorTitle);
    } finally {
      setLoadingMore(false);
    }
  }

  function showDetail(event: CardActivityEvent) {
    setOpen(false);
    setDetailEvent(event);
  }

  return (
    <>
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('size-8', boardChromeButtonClass)}
                aria-label={topCopy.activity}
              >
                <ActivityIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{topCopy.activity}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="flex max-h-[70vh] w-[min(380px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 shadow-popover"
        >
          <DropdownMenuLabel className="border-b px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ActivityIcon className="size-4" aria-hidden />
              {copy.title}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
              {copy.description}
            </span>
          </DropdownMenuLabel>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {firstPage.isPending ? (
              <ul className="space-y-1.5" aria-busy>
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
                    <span className="bg-muted size-5 shrink-0 animate-pulse rounded-full" />
                    <span className="bg-muted h-3 flex-1 animate-pulse rounded" />
                  </li>
                ))}
              </ul>
            ) : firstPage.isError ? (
              <p className="text-destructive px-1 py-2 text-sm">
                {firstPage.error?.message || copy.loadErrorTitle}
              </p>
            ) : items.length === 0 ? (
              <EmptyState icon={<ActivityIcon className="size-8" />} message={copy.empty} />
            ) : (
              <div className="space-y-2">
                <ul className="space-y-1.5">
                  {items.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      unknownActor={copy.unknownActor}
                      onShowDetail={showDetail}
                    />
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
        </DropdownMenuContent>
      </DropdownMenu>

      <ActivityDetailDialog
        event={detailEvent}
        open={detailEvent != null}
        onOpenChange={(next) => {
          if (!next) setDetailEvent(null);
        }}
        unknownActor={copy.unknownActor}
      />
    </>
  );
}
