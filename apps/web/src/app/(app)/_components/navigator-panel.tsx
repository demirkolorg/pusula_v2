'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleIcon,
  CompassIcon,
  RefreshCwIcon,
  SearchIcon,
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
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/** `nav.tree` için cache süresi — yeni kart/liste anında görünmese de
 *  5 dakika içinde manuel refresh ile tazelenir. */
const NAV_TREE_STALE_MS = 5 * 60 * 1000;

type NavigatorPanelProps = {
  /** Paneli kapat (toggle global header'da). */
  onClose: () => void;
  /**
   * Bir öğeye `Link` ile gidildikten sonra çağrılır. Mobil sheet modunda
   * panelin kendini kapatması için kullanılır; persistent (lg+) modda parent
   * `undefined` geçer ve panel açık kalır.
   */
  onNavigate?: () => void;
};

type TreeData = RouterOutputs['nav']['tree'];
type RawWorkspace = TreeData['workspaces'][number];
type RawCard = RawWorkspace['boards'][number]['lists'][number]['cards'][number];

type FlatCard = {
  workspaceId: string;
  boardId: string;
  boardTitle: string;
  listTitle: string;
  card: RawCard;
};

/**
 * Global "Gezgin" paneli — uygulamanın her ekranında erişilebilen sade düz
 * kart listesi. Workspace/pano/liste hiyerarşisi düzleştirilip her satırda
 * kart başlığı + altında "Pano › Liste" breadcrumb gösterilir.
 *
 * - `nav.tree` tek çağrıyla yüklenir; `staleTime: 5dk` + manuel refresh.
 * - Arama yalnızca kart başlığında çalışır; pano/liste adı süzme dışı.
 * - Sıra `nav.tree`'nin doğal (pano → liste → kart) sırası — aynı panonun
 *   kartları yan yana, breadcrumb tekrarı görsel gruplama hissi verir.
 * - Aktif highlight: URL'deki `?card=<id>` query param'ı.
 */
export function NavigatorPanel({ onClose, onNavigate }: NavigatorPanelProps) {
  const trpc = useTRPC();
  const tree = useQuery(trpc.nav.tree.queryOptions(undefined, { staleTime: NAV_TREE_STALE_MS }));
  const copy = strings.board.navigator;

  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('tr');

  const cards = useMemo<FlatCard[]>(() => {
    if (!tree.data) return [];
    return flattenCards(tree.data.workspaces, normalizedQuery);
  }, [tree.data, normalizedQuery]);

  const searchParams = useSearchParams();
  const activeCardId = searchParams?.get('card') ?? null;

  return (
    <aside
      aria-label={copy.panelTitle}
      // `lg+`: yuvarlak kart (Trello "Gelen Kutusu" deseni); shell rengi
      // (`bg-board-shell` fullBleed'de) gap'ten görünür. Mobilde overlay
      // sheet — full-bleed (köşesiz, kenarsız) daha doğal.
      className="bg-background text-foreground border-border flex h-full w-80 shrink-0 flex-col overflow-hidden lg:w-96 lg:rounded-xl lg:border"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
            <CompassIcon aria-hidden className="size-4 opacity-70" />
            <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        {/* Tek satırda kontroller — arama + yenile. Hiyerarşi olmadığı için
            genişlet/daralt ve tip filtresi yok. */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              className="bg-card h-8 pl-8 pr-7 text-sm"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={strings.common.close}
                className="text-muted-foreground hover:text-foreground absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={copy.refresh}
                onClick={() => tree.refetch()}
                disabled={tree.isFetching}
                className="bg-card size-8 shrink-0"
              >
                <RefreshCwIcon
                  className={cn('size-4', tree.isFetching && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.refresh}</TooltipContent>
          </Tooltip>
        </div>

        <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto">
          {tree.isPending ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {strings.common.loading}
            </p>
          ) : tree.isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-foreground text-sm font-medium">{copy.loadErrorTitle}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => tree.refetch()}
              >
                {strings.common.retry}
              </Button>
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <CompassIcon aria-hidden className="text-muted-foreground size-7" />
              <p className="text-foreground text-sm font-medium">{copy.emptyTitle}</p>
              <p className="text-muted-foreground text-xs">
                {normalizedQuery ? copy.emptySearchDescription : copy.emptyDescription}
              </p>
            </div>
          ) : (
            <ul role="list" className="space-y-0.5">
              {cards.map((entry) => (
                <CardRow
                  key={entry.card.id}
                  entry={entry}
                  active={entry.card.id === activeCardId}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

// --- alt bileşenler ---------------------------------------------------------

function CardRow({
  entry,
  active,
  onNavigate,
}: {
  entry: FlatCard;
  active: boolean;
  onNavigate?: () => void;
}) {
  const { workspaceId, boardId, boardTitle, listTitle, card } = entry;
  return (
    <li>
      <Link
        href={`/workspaces/${workspaceId}/boards/${boardId}?card=${card.id}`}
        onClick={onNavigate}
        className={cn(
          'group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm',
          'hover:bg-accent/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          active && 'bg-accent text-accent-foreground',
        )}
      >
        <span className="mt-0.5 shrink-0">
          {/* Tamamlanma durumu yalnızca ikon farkı — metne dokunmuyoruz. */}
          {card.completed ? (
            <CheckCircle2Icon className="size-3.5 opacity-70" aria-hidden />
          ) : (
            <CircleIcon className="size-3.5 opacity-70" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate">{card.title}</span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <span className="truncate">{boardTitle}</span>
            <ChevronRightIcon aria-hidden className="size-3 shrink-0 opacity-60" />
            <span className="truncate">{listTitle}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

// --- yardımcılar -------------------------------------------------------------

/** Tüm workspace ağacını düz kart listesine çevirir; arama sadece kart
 *  başlığında uygulanır. Sıra: pano → liste → kart (doğal). */
function flattenCards(
  workspaces: ReadonlyArray<RawWorkspace>,
  q: string,
): FlatCard[] {
  const out: FlatCard[] = [];
  for (const workspace of workspaces) {
    for (const board of workspace.boards) {
      for (const list of board.lists) {
        for (const card of list.cards) {
          if (q && !card.title.toLocaleLowerCase('tr').includes(q)) continue;
          out.push({
            workspaceId: workspace.id,
            boardId: board.id,
            boardTitle: board.title,
            listTitle: list.title,
            card,
          });
        }
      }
    }
  }
  return out;
}
