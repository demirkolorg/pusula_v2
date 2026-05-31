'use client';

import { useMemo } from 'react';
import { ListIcon as ListGlyphIcon } from 'lucide-react';
import { Badge, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import {
  LIST_ICON_COMPONENTS,
  LIST_ICON_FG,
  asListIcon,
  asListIconColor,
} from '../../workspaces/[id]/boards/[boardId]/_components/list-icon-presentation';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import { isArchivedList, type CardRow, type ListRow } from './types';

type ListsColumnProps = {
  /** Owning board id; null when Sütun 2'de seçim yok. */
  boardId: string | null;
  lists: readonly ListRow[];
  cards: readonly CardRow[];
  selectedListId: string | null;
  onSelect: (listId: string) => void;
  onBack?: () => void;
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

/**
 * Sütun 3 — Lists (§13.11). Reads from the same `board.get` payload as Sütun 4;
 * row shows list icon + title + card count. Read-only nav — yeni liste yalnızca
 * board ekranında oluşturulur (`+` butonu yok).
 */
export function ListsColumn({
  boardId,
  lists,
  cards,
  selectedListId,
  onSelect,
  onBack,
  isPending,
  isError,
  errorMessage,
}: ListsColumnProps) {
  const copy = strings.home.listsColumn;

  const cardCountByList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      if (card.archivedAt != null) continue;
      counts.set(card.listId, (counts.get(card.listId) ?? 0) + 1);
    }
    return counts;
  }, [cards]);

  return (
    <HomeColumnShell
      ariaLabel={copy.eyebrow}
      eyebrow={copy.eyebrow}
      count={copy.count(lists.length)}
      icon={<ListGlyphIcon className="size-4" />}
      onBack={onBack}
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
    >
      {!boardId ? (
        <HomeColumnEmpty
          icon={<ListGlyphIcon className="size-5" aria-hidden />}
          title={copy.selectBoardTitle}
          description={copy.selectBoardDescription}
        />
      ) : lists.length === 0 ? (
        <HomeColumnEmpty
          icon={<ListGlyphIcon className="size-5" aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <ul className="space-y-1 p-2">
          {lists.map((list) => {
            const active = list.id === selectedListId;
            const archived = isArchivedList(list);
            const resolvedIcon = asListIcon(list.icon);
            const resolvedColor = asListIconColor(list.iconColor);
            const IconComponent = resolvedIcon
              ? LIST_ICON_COMPONENTS[resolvedIcon]
              : ListGlyphIcon;
            const iconColorClass = resolvedColor
              ? LIST_ICON_FG[resolvedColor]
              : 'text-muted-foreground';
            const cardCount = cardCountByList.get(list.id) ?? 0;

            return (
              <li key={list.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  data-active={active ? 'true' : undefined}
                  onClick={() => onSelect(list.id)}
                  className={cn(
                    'hover:bg-accent focus-visible:ring-ring/60 relative flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2',
                    active && 'bg-primary/10 text-foreground',
                    archived && 'opacity-60',
                  )}
                >
                  {active && (
                    <span
                      className="bg-primary absolute inset-y-2 -left-2 w-0.5 rounded-full"
                      aria-hidden
                    />
                  )}
                  <span
                    className="bg-muted/50 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                    aria-hidden
                  >
                    <IconComponent className={cn('size-3.5', iconColorClass)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {archived && (
                        <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                          {copy.archivedBadge}
                        </Badge>
                      )}
                      <span className="truncate text-sm font-medium">{list.title}</span>
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {copy.cardCount(cardCount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HomeColumnShell>
  );
}
