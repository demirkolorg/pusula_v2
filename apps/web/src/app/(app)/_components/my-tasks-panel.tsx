'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CalendarClockIcon,
  CircleIcon,
  ListChecksIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { EntityIconGlyph } from '@/components/entity-icon';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type MyTasksPanelProps = {
  /** Panel kendi kapanış sinyali. */
  onClose: () => void;
  /** Bir karta link tıklamasından sonra mobil sheet'i kapatmak için. */
  onNavigate?: () => void;
};

type Item = RouterOutputs['myTasks']['assignedToMe']['items'][number];

/** Bir günde milisaniye — gün hesaplarında kullanılır. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tarih grubu anahtarları — UI sırası bu liste sırasıyla aynı. */
const GROUP_KEYS = ['overdue', 'today', 'thisWeek', 'later', 'noDueDate'] as const;
type GroupKey = (typeof GROUP_KEYS)[number];

/**
 * Görevlerim paneli (Faz 17) — kullanıcının `assignee` olarak atandığı,
 * tamamlanmamış ve arşivsiz tüm kartları tarih gruplarıyla listeler.
 *
 * Diğer global panellerle (Gezgin, Hızlı Notlar, Planlayıcı) birebir aynı
 * görsel kabuk:
 * - `lg+` persistent sidebar; `<lg` overlay sheet
 * - Sistem teması (`bg-background` + `text-foreground`)
 * - Header (ikon + başlık + yenile + kapat) + scrollable body + empty/error
 *   state'ler
 *
 * 30 sn polling + window-focus refetch ile "neredeyse realtime" hissi. Tam
 * Socket.IO realtime push sonraki iterasyona.
 */
export function MyTasksPanel({ onClose, onNavigate }: MyTasksPanelProps) {
  const trpc = useTRPC();
  const copy = strings.board.myTasks;
  const query = useQuery({
    ...trpc.myTasks.assignedToMe.queryOptions(undefined),
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });

  const grouped = useMemo(() => groupByDueDate(query.data?.items ?? []), [query.data]);
  const totalItems = query.data?.items.length ?? 0;
  const showHasMoreHint = Boolean(query.data?.hasMore);

  return (
    <aside
      aria-label={copy.panelTitle}
      className="bg-background text-foreground border-border flex h-full w-80 shrink-0 flex-col overflow-hidden lg:w-96 lg:rounded-xl lg:border"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
            <ListChecksIcon aria-hidden className="size-4 opacity-70" />
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
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>{strings.common.panels.closeShortcut}</TooltipContent>
            </Tooltip>
          </header>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onClose}>{strings.common.panels.closeThis}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
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
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <ListChecksIcon aria-hidden className="text-muted-foreground size-8" />
            <p className="text-foreground text-sm font-medium">{copy.emptyTitle}</p>
            <p className="text-muted-foreground text-xs">{copy.emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {GROUP_KEYS.map((key) => {
              const items = grouped[key];
              if (items.length === 0) return null;
              return (
                <TaskGroup key={key} groupKey={key} items={items} onNavigate={onNavigate} />
              );
            })}
            {showHasMoreHint && (
              <p className="text-muted-foreground py-2 text-center text-xs">
                {copy.hasMoreHint(totalItems)}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function TaskGroup({
  groupKey,
  items,
  onNavigate,
}: {
  groupKey: GroupKey;
  items: Item[];
  onNavigate?: () => void;
}) {
  const copy = strings.board.myTasks;
  const params = useParams<{ boardId?: string }>();
  const activeBoardId = params?.boardId ?? null;
  const label =
    groupKey === 'overdue'
      ? copy.groupOverdue
      : groupKey === 'today'
        ? copy.groupToday
        : groupKey === 'thisWeek'
          ? copy.groupThisWeek
          : groupKey === 'later'
            ? copy.groupLater
            : copy.groupNoDueDate;
  const isAlert = groupKey === 'overdue';

  return (
    <section aria-label={label}>
      <header className="mb-1.5 flex items-center justify-between">
        <h3
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            isAlert ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {label}
        </h3>
        <span className="text-muted-foreground text-xs">{items.length}</span>
      </header>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.card.id}>
            <TaskRow
              item={item}
              isOnActiveBoard={activeBoardId === item.board.id}
              dueAlert={isAlert}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskRow({
  item,
  isOnActiveBoard,
  dueAlert,
  onNavigate,
}: {
  item: Item;
  isOnActiveBoard: boolean;
  dueAlert: boolean;
  onNavigate?: () => void;
}) {
  const copy = strings.board.myTasks;
  const href = `/workspaces/${item.workspace.id}/boards/${item.board.id}?card=${item.card.id}`;
  const dueLabel = item.card.dueAt ? formatDueDate(item.card.dueAt) : null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'border-border bg-card hover:bg-accent/60 flex flex-col gap-1 rounded-md border px-2.5 py-2 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        isOnActiveBoard && 'ring-primary/40 ring-1',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <CircleIcon
          aria-hidden
          className="text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-70"
        />
        <span className="text-foreground min-w-0 flex-1 truncate font-medium">
          {item.card.title}
        </span>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-1 pl-5 text-xs">
        <EntityIconGlyph icon={item.workspace.icon} className="size-3 shrink-0 opacity-60" />
        <span className="min-w-0 truncate">{item.workspace.name}</span>
        <span aria-hidden>{copy.contextSeparator}</span>
        <EntityIconGlyph icon={item.board.icon} className="size-3 shrink-0 opacity-60" />
        <span className="min-w-0 truncate">{item.board.title}</span>
      </div>
      {dueLabel && (
        <div
          className={cn(
            'flex items-center gap-1 pl-5 text-xs',
            dueAlert ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          <CalendarClockIcon aria-hidden className="size-3" />
          <span>{copy.dueLabel(dueLabel)}</span>
        </div>
      )}
    </Link>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Bir tarihin günün başlangıcına (00:00 yerel saat) normalize hali. */
function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Görevleri tarih kovalarına ayır. Yerel saat dilimi kullanılır — "bugün" /
 * "bu hafta" kullanıcının lokal gününe göre.
 *
 * Sınırlar:
 * - overdue: `dueAt < startOfToday`
 * - today: `startOfToday <= dueAt < startOfTomorrow`
 * - thisWeek: `startOfTomorrow <= dueAt < startOfToday + 7 gün`
 * - later: `dueAt >= startOfToday + 7 gün`
 * - noDueDate: `dueAt === null`
 */
function groupByDueDate(items: readonly Item[]): Record<GroupKey, Item[]> {
  const todayStart = startOfDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
  const weekEnd = new Date(todayStart.getTime() + 7 * MS_PER_DAY);

  const groups: Record<GroupKey, Item[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    noDueDate: [],
  };

  for (const item of items) {
    const due = item.card.dueAt ? new Date(item.card.dueAt) : null;
    if (!due) {
      groups.noDueDate.push(item);
      continue;
    }
    if (due < todayStart) groups.overdue.push(item);
    else if (due < tomorrowStart) groups.today.push(item);
    else if (due < weekEnd) groups.thisWeek.push(item);
    else groups.later.push(item);
  }

  return groups;
}

/**
 * Görev satırı için kısa tarih etiketi. Bugün/yarın ise gün ismi; aynı yılsa
 * "5 Haziran" gibi; farklı yılsa "5 Haz 2027". Saat genelde önemsiz — gün
 * yeterli; bugün ise "Bugün, 14:30".
 */
function formatDueDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const todayStart = startOfDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
  const dayAfterTomorrow = new Date(todayStart.getTime() + 2 * MS_PER_DAY);

  if (date >= todayStart && date < tomorrowStart) {
    const time = new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    return `Bugün ${time}`;
  }
  if (date >= tomorrowStart && date < dayAfterTomorrow) {
    return 'Yarın';
  }
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: sameYear ? 'long' : 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(date);
}
