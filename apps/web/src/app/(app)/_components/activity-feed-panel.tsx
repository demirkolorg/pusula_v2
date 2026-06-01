'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActivityIcon,
  ListChecksIcon,
  MessageSquareIcon,
  MoveIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import {
  Avatar,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { EntityIconGlyph } from '@/components/entity-icon';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type ActivityFeedPanelProps = {
  onClose: () => void;
  onNavigate?: () => void;
};

type FeedItem = RouterOutputs['activity']['feed']['items'][number];

/** UI chip grupları — backend `ACTIVITY_FEED_GROUPS` ile birebir. */
const FILTER_GROUPS = ['card_changes', 'comments', 'checklists', 'members', 'other'] as const;
type FilterGroup = (typeof FILTER_GROUPS)[number];

const FILTER_ICONS: Record<FilterGroup, typeof MoveIcon> = {
  card_changes: MoveIcon,
  comments: MessageSquareIcon,
  checklists: ListChecksIcon,
  members: UserIcon,
  other: SparklesIcon,
};

const PAGE_LIMIT = 30;

/**
 * Aktivite Akışı paneli (Faz 17) — kullanıcının erişebildiği tüm board'lardan
 * global aktivite feed'i. Cursor-paginated, chip-filtreli, 30 sn polling.
 *
 * Diğer global panellerle (Gezgin / Hızlı Notlar / Planlayıcı / Görevlerim)
 * birebir aynı görsel kabuk:
 * - `lg+` persistent sidebar; `<lg` overlay sheet
 * - Sistem teması, header + scroll body + empty/error
 */
export function ActivityFeedPanel({ onClose, onNavigate }: ActivityFeedPanelProps) {
  const trpc = useTRPC();
  const copy = strings.board.activityFeed;
  // Tek seçim: `null` → tümü, aksi halde seçili tek grup. Aynı chip'e tekrar
  // tıklamak `null`'a düşürür (= Tümü).
  const [selectedGroup, setSelectedGroup] = useState<FilterGroup | null>(null);

  const groupsParam = useMemo(
    () => (selectedGroup ? [selectedGroup] : undefined),
    [selectedGroup],
  );

  const query = useInfiniteQuery(
    trpc.activity.feed.infiniteQueryOptions(
      { limit: PAGE_LIMIT, groups: groupsParam },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        refetchOnWindowFocus: true,
        refetchInterval: 30 * 1000,
        staleTime: 10 * 1000,
      },
    ),
  );

  const allItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const selectGroup = useCallback((group: FilterGroup) => {
    setSelectedGroup((prev) => (prev === group ? null : group));
  }, []);

  const clearGroup = useCallback(() => setSelectedGroup(null), []);
  const hasFilter = selectedGroup !== null;

  return (
    <aside
      aria-label={copy.panelTitle}
      className="bg-background text-foreground border-border flex h-full w-80 shrink-0 flex-col overflow-hidden lg:w-96 lg:rounded-xl lg:border"
    >
      <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <ActivityIcon aria-hidden className="size-4 opacity-70" />
        <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={copy.refresh}
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCwIcon className={cn('size-4', query.isFetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copy.refresh}</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={copy.close}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </header>

      {/* Chip filtre satırı — tek seçim (radio benzeri). Yatay scroll yok;
          dar ekranda iki satıra wrap eder. */}
      <div className="border-border flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-2">
        <FilterChip
          label={copy.filterAll}
          active={!hasFilter}
          onClick={clearGroup}
        />
        {FILTER_GROUPS.map((group) => {
          const Icon = FILTER_ICONS[group];
          return (
            <FilterChip
              key={group}
              label={
                group === 'card_changes'
                  ? copy.filterCardChanges
                  : group === 'comments'
                    ? copy.filterComments
                    : group === 'checklists'
                      ? copy.filterChecklists
                      : group === 'members'
                        ? copy.filterMembers
                        : copy.filterOther
              }
              icon={<Icon className="size-3" aria-hidden />}
              active={selectedGroup === group}
              onClick={() => selectGroup(group)}
            />
          );
        })}
      </div>

      <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {strings.common.loading}
          </p>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-foreground text-sm font-medium">{copy.loadErrorTitle}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
            >
              {strings.common.retry}
            </Button>
          </div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <ActivityIcon aria-hidden className="text-muted-foreground size-8" />
            <p className="text-foreground text-sm font-medium">
              {hasFilter ? copy.emptyFilteredTitle : copy.emptyTitle}
            </p>
            <p className="text-muted-foreground text-xs">
              {hasFilter ? copy.emptyFilteredDescription : copy.emptyDescription}
            </p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {allItems.map((item) => (
              <li key={item.id}>
                <ActivityRow item={item} onNavigate={onNavigate} />
              </li>
            ))}
            {query.hasNextPage && (
              <li className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors',
        'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-foreground border-border hover:bg-accent',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ActivityRow({
  item,
  onNavigate,
}: {
  item: FeedItem;
  onNavigate?: () => void;
}) {
  const copy = strings.board.activityFeed;
  // Kart varsa link kart detayına; yoksa board'a.
  const href = item.cardId
    ? `/workspaces/${item.workspaceId}/boards/${item.boardId}?card=${item.cardId}`
    : `/workspaces/${item.workspaceId}/boards/${item.boardId}`;
  const actorName = item.actorName ?? copy.anonymousActor;
  const typeLabels = copy.typeLabels as Record<string, string>;
  const typeLabel = typeLabels[item.type] ?? copy.typeFallback;
  const cardTitle = item.cardTitle?.trim() ?? null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'hover:bg-accent/40 flex gap-2.5 px-3 py-2.5 transition-colors',
        'focus-visible:outline-none focus-visible:bg-accent/40',
      )}
    >
      <Avatar
        name={item.actorName ?? null}
        image={item.actorImage ?? null}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm leading-snug">
          <span className="text-foreground font-medium">{actorName}</span>{' '}
          <span className="text-muted-foreground">{typeLabel}</span>
        </p>
        {cardTitle && (
          // Kart başlığı uzun olduğunda satır şişmesin: max 2 satır, sonra
          // "…". Kullanıcı tam başlığı kart detayına geçince görür.
          <p
            className="text-foreground line-clamp-2 text-sm leading-snug"
            title={cardTitle}
          >
            {cardTitle}
          </p>
        )}
        <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
          <EntityIconGlyph
            icon={item.workspaceIcon}
            className="size-3 shrink-0 opacity-60"
          />
          <span className="min-w-0 truncate">{item.workspaceName}</span>
          <span aria-hidden> · </span>
          <EntityIconGlyph icon={item.boardIcon} className="size-3 shrink-0 opacity-60" />
          <span className="min-w-0 truncate">{item.boardTitle}</span>
          <span aria-hidden> · </span>
          <time
            dateTime={
              item.createdAt instanceof Date
                ? item.createdAt.toISOString()
                : new Date(item.createdAt).toISOString()
            }
            className="shrink-0"
          >
            {formatRelative(item.createdAt)}
          </time>
        </div>
      </div>
    </Link>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Kısa göreceli zaman: "az önce", "5 dk", "3 sa", "2 g", aksi halde tarih. Tek
 * yönlü (her zaman geçmiş) — feed sıralaması zaten DESC, gelecek satır oluşmaz.
 */
function formatRelative(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} g`;
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: sameYear ? 'short' : 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(date);
}
