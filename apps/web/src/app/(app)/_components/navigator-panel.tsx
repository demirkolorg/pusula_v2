'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CompassIcon,
  ListIcon,
  RectangleHorizontalIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { EntityIconGlyph } from '@/components/entity-icon';
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

type EntityKind = 'workspaces' | 'boards' | 'lists' | 'cards';

type TreeData = RouterOutputs['nav']['tree'];
type RawWorkspace = TreeData['workspaces'][number];
type RawBoard = RawWorkspace['boards'][number];
type RawList = RawBoard['lists'][number];
type RawCard = RawList['cards'][number];

/**
 * Global "Gezgin" paneli — uygulamanın her ekranında erişilebilen, kullanıcının
 * görebildiği tüm workspace / pano / liste / kart hiyerarşisini gösteren sol
 * panel. Steam'in sol kütüphane panelinin mantığı.
 *
 * - `nav.tree` tek çağrıyla yüklenir; `staleTime: 5dk` + manuel refresh butonu.
 * - Sistem temasını kullanır (`bg-background`, `text-foreground`).
 * - `lg+`: persistent sidebar (`AppShell` içinde flex row), içeriği sağa iter.
 * - `<lg`: parent overlay sheet olarak render eder; `onNavigate` ile panel
 *   kendini kapatır.
 * - Aktif route highlight: `useParams` ile workspace/board id'leri okunur.
 */
export function NavigatorPanel({ onClose, onNavigate }: NavigatorPanelProps) {
  const trpc = useTRPC();
  const tree = useQuery(trpc.nav.tree.queryOptions(undefined, { staleTime: NAV_TREE_STALE_MS }));
  const copy = strings.board.navigator;

  // Filtreler — hepsi default açık (Steam: 'hepsi seçili' davranışı).
  const [visible, setVisible] = useState<Set<EntityKind>>(
    () => new Set<EntityKind>(['workspaces', 'boards', 'lists', 'cards']),
  );
  const toggleKind = (kind: EntityKind) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  // Genişletme durumu — workspace + board + list seviyeleri.
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<string>>(() => new Set());
  const [openBoards, setOpenBoards] = useState<Set<string>>(() => new Set());
  const [openLists, setOpenLists] = useState<Set<string>>(() => new Set());

  // İlk veri geldiğinde TÜM seviyeler (workspace + board + list) açık —
  // kullanıcı için "her şey görünür, kartlara kadar" beklentisi.
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (!tree.data || initialisedRef.current) return;
    initialisedRef.current = true;
    if (tree.data.workspaces.length === 0) return;
    setOpenWorkspaces(new Set(tree.data.workspaces.map((w) => w.id)));
    setOpenBoards(
      new Set(tree.data.workspaces.flatMap((w) => w.boards.map((b) => b.id))),
    );
    setOpenLists(
      new Set(
        tree.data.workspaces.flatMap((w) =>
          w.boards.flatMap((b) => b.lists.map((l) => l.id)),
        ),
      ),
    );
  }, [tree.data]);

  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('tr');

  const filtered = useMemo(() => {
    if (!tree.data) return [];
    return filterTree(tree.data.workspaces, normalizedQuery, visible);
  }, [tree.data, normalizedQuery, visible]);

  const params = useParams<{ id?: string; boardId?: string }>();
  const activeBoardId = params?.boardId ?? null;
  const activeWorkspaceId = params?.id ?? null;

  const anyExpanded =
    openWorkspaces.size > 0 || openBoards.size > 0 || openLists.size > 0;
  const toggleAll = () => {
    if (anyExpanded) {
      setOpenWorkspaces(new Set());
      setOpenBoards(new Set());
      setOpenLists(new Set());
      return;
    }
    if (!tree.data) return;
    setOpenWorkspaces(new Set(tree.data.workspaces.map((w) => w.id)));
    setOpenBoards(
      new Set(tree.data.workspaces.flatMap((w) => w.boards.map((b) => b.id))),
    );
    setOpenLists(
      new Set(
        tree.data.workspaces.flatMap((w) =>
          w.boards.flatMap((b) => b.lists.map((l) => l.id)),
        ),
      ),
    );
  };

  return (
    <aside
      aria-label={copy.panelTitle}
      // `lg+`: yuvarlak kart (Trello "Gelen Kutusu" deseni); shell rengi
      // (`bg-board-shell` fullBleed'de) gap'ten görünür. Mobilde overlay
      // sheet — full-bleed (köşesiz, kenarsız) daha doğal.
      className="bg-background text-foreground border-border flex h-full w-80 shrink-0 flex-col overflow-hidden lg:w-96 lg:rounded-xl lg:border"
    >
      <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <CompassIcon aria-hidden className="size-4 opacity-70" />
        <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        {/* Tek satırda kontroller — arama, daralt/genişlet toggle, yenile, filtre. */}
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
                aria-label={anyExpanded ? copy.collapseAll : copy.expandAll}
                onClick={toggleAll}
                className="bg-card size-8 shrink-0"
              >
                {anyExpanded ? (
                  <ChevronsDownUpIcon className="size-4" />
                ) : (
                  <ChevronsUpDownIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {anyExpanded ? copy.collapseAll : copy.expandAll}
            </TooltipContent>
          </Tooltip>

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

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={copy.filterTitle}
                    className={cn(
                      'bg-card relative size-8 shrink-0',
                      visible.size < 4 && 'border-primary text-primary',
                    )}
                  >
                    <SlidersHorizontalIcon className="size-4" />
                    {visible.size < 4 && (
                      <span
                        aria-hidden
                        className="bg-primary absolute right-1 top-1 size-1.5 rounded-full"
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{copy.filterTitle}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">{copy.filterTitle}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={visible.has('workspaces')}
                onCheckedChange={() => toggleKind('workspaces')}
                onSelect={(event) => event.preventDefault()}
              >
                {copy.filterWorkspaces}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visible.has('boards')}
                onCheckedChange={() => toggleKind('boards')}
                onSelect={(event) => event.preventDefault()}
              >
                {copy.filterBoards}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visible.has('lists')}
                onCheckedChange={() => toggleKind('lists')}
                onSelect={(event) => event.preventDefault()}
              >
                {copy.filterLists}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visible.has('cards')}
                onCheckedChange={() => toggleKind('cards')}
                onSelect={(event) => event.preventDefault()}
              >
                {copy.filterCards}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <CompassIcon aria-hidden className="text-muted-foreground size-7" />
              <p className="text-foreground text-sm font-medium">{copy.emptyTitle}</p>
              <p className="text-muted-foreground text-xs">{copy.emptyDescription}</p>
            </div>
          ) : (
            <ul role="tree" className="space-y-0.5">
              {filtered.map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  visible={visible}
                  openWorkspaces={openWorkspaces}
                  setOpenWorkspaces={setOpenWorkspaces}
                  openBoards={openBoards}
                  setOpenBoards={setOpenBoards}
                  openLists={openLists}
                  setOpenLists={setOpenLists}
                  activeBoardId={activeBoardId}
                  activeWorkspaceId={activeWorkspaceId}
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

function WorkspaceRow({
  workspace,
  visible,
  openWorkspaces,
  setOpenWorkspaces,
  openBoards,
  setOpenBoards,
  openLists,
  setOpenLists,
  activeBoardId,
  activeWorkspaceId,
  onNavigate,
}: {
  workspace: RawWorkspace;
  visible: ReadonlySet<EntityKind>;
  openWorkspaces: Set<string>;
  setOpenWorkspaces: (next: Set<string>) => void;
  openBoards: Set<string>;
  setOpenBoards: (next: Set<string>) => void;
  openLists: Set<string>;
  setOpenLists: (next: Set<string>) => void;
  activeBoardId: string | null;
  activeWorkspaceId: string | null;
  onNavigate?: () => void;
}) {
  const showWorkspaces = visible.has('workspaces');
  const showBoards = visible.has('boards');
  const expanded = showWorkspaces ? openWorkspaces.has(workspace.id) : true;
  const copy = strings.board.navigator;
  // Aktif workspace highlight'ı yalnız board ekranında değilken — board ekranındaysa
  // board row vurgusu daha bilgi verici, workspace satırını sade bırak.
  const isActive = !activeBoardId && workspace.id === activeWorkspaceId;

  const toggle = () => {
    const next = new Set(openWorkspaces);
    if (next.has(workspace.id)) next.delete(workspace.id);
    else next.add(workspace.id);
    setOpenWorkspaces(next);
  };

  return (
    <li role="treeitem" aria-expanded={expanded}>
      {showWorkspaces && (
        <TreeRow
          depth={0}
          chevron={
            workspace.boards.length > 0 ? (expanded ? 'down' : 'right') : 'none'
          }
          onChevronClick={toggle}
          href={`/workspaces/${workspace.id}`}
          icon={<EntityIconGlyph icon={workspace.icon} className="size-3.5" />}
          label={workspace.name}
          active={isActive}
          onNavigate={onNavigate}
        />
      )}
      {expanded && showBoards && (
        <ul role="group" className="space-y-0.5">
          {workspace.boards.length === 0 ? (
            <EmptyRow depth={showWorkspaces ? 1 : 0} text={copy.emptyBoards} />
          ) : (
            workspace.boards.map((board) => (
              <BoardRow
                key={board.id}
                workspaceId={workspace.id}
                board={board}
                depth={showWorkspaces ? 1 : 0}
                visible={visible}
                openBoards={openBoards}
                setOpenBoards={setOpenBoards}
                openLists={openLists}
                setOpenLists={setOpenLists}
                isActive={board.id === activeBoardId}
                onNavigate={onNavigate}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function BoardRow({
  workspaceId,
  board,
  depth,
  visible,
  openBoards,
  setOpenBoards,
  openLists,
  setOpenLists,
  isActive,
  onNavigate,
}: {
  workspaceId: string;
  board: RawBoard;
  depth: number;
  visible: ReadonlySet<EntityKind>;
  openBoards: Set<string>;
  setOpenBoards: (next: Set<string>) => void;
  openLists: Set<string>;
  setOpenLists: (next: Set<string>) => void;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const showLists = visible.has('lists');
  const expanded = openBoards.has(board.id);
  const copy = strings.board.navigator;

  const toggle = () => {
    const next = new Set(openBoards);
    if (next.has(board.id)) next.delete(board.id);
    else next.add(board.id);
    setOpenBoards(next);
  };

  return (
    <li role="treeitem" aria-expanded={expanded}>
      <TreeRow
        depth={depth}
        chevron={board.lists.length > 0 ? (expanded ? 'down' : 'right') : 'none'}
        onChevronClick={toggle}
        href={`/workspaces/${workspaceId}/boards/${board.id}`}
        icon={<EntityIconGlyph icon={board.icon} className="size-3.5" />}
        label={board.title}
        active={isActive}
        onNavigate={onNavigate}
      />
      {expanded && showLists && (
        <ul role="group" className="space-y-0.5">
          {board.lists.length === 0 ? (
            <EmptyRow depth={depth + 1} text={copy.emptyLists} />
          ) : (
            board.lists.map((list) => (
              <ListRow
                key={list.id}
                workspaceId={workspaceId}
                boardId={board.id}
                list={list}
                depth={depth + 1}
                visible={visible}
                openLists={openLists}
                setOpenLists={setOpenLists}
                onNavigate={onNavigate}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function ListRow({
  workspaceId,
  boardId,
  list,
  depth,
  visible,
  openLists,
  setOpenLists,
  onNavigate,
}: {
  workspaceId: string;
  boardId: string;
  list: RawList;
  depth: number;
  visible: ReadonlySet<EntityKind>;
  openLists: Set<string>;
  setOpenLists: (next: Set<string>) => void;
  onNavigate?: () => void;
}) {
  const showCards = visible.has('cards');
  const expanded = openLists.has(list.id);
  const copy = strings.board.navigator;

  const toggle = () => {
    const next = new Set(openLists);
    if (next.has(list.id)) next.delete(list.id);
    else next.add(list.id);
    setOpenLists(next);
  };

  return (
    <li role="treeitem" aria-expanded={expanded}>
      <TreeRow
        depth={depth}
        chevron={list.cards.length > 0 ? (expanded ? 'down' : 'right') : 'none'}
        onChevronClick={toggle}
        href={`/workspaces/${workspaceId}/boards/${boardId}`}
        icon={<ListIcon className="size-3.5 opacity-70" aria-hidden />}
        label={list.title}
        onNavigate={onNavigate}
      />
      {expanded && showCards && (
        <ul role="group" className="space-y-0.5">
          {list.cards.length === 0 ? (
            <EmptyRow depth={depth + 1} text={copy.emptyCards} />
          ) : (
            list.cards.map((card) => (
              <CardRow
                key={card.id}
                workspaceId={workspaceId}
                boardId={boardId}
                card={card}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function CardRow({
  workspaceId,
  boardId,
  card,
  depth,
  onNavigate,
}: {
  workspaceId: string;
  boardId: string;
  card: RawCard;
  depth: number;
  onNavigate?: () => void;
}) {
  return (
    <li role="treeitem">
      <TreeRow
        depth={depth}
        chevron="none"
        href={`/workspaces/${workspaceId}/boards/${boardId}?card=${card.id}`}
        icon={
          <RectangleHorizontalIcon
            className={cn(
              'size-3.5 opacity-70',
              card.completed && 'line-through opacity-50',
            )}
            aria-hidden
          />
        }
        label={card.title}
        muted={card.completed}
        onNavigate={onNavigate}
      />
    </li>
  );
}

function TreeRow({
  depth,
  chevron,
  onChevronClick,
  href,
  icon,
  label,
  active,
  muted,
  onNavigate,
}: {
  depth: number;
  chevron: 'down' | 'right' | 'none';
  onChevronClick?: () => void;
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  muted?: boolean;
  onNavigate?: () => void;
}) {
  const indentPx = depth * 14;
  return (
    <div
      className={cn(
        'group flex items-center rounded-md text-sm',
        'hover:bg-accent/60',
        active && 'bg-accent text-accent-foreground',
      )}
      style={{ paddingLeft: indentPx }}
    >
      {chevron === 'none' ? (
        <span className="inline-block size-5 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={onChevronClick}
          aria-label={chevron === 'down' ? 'Daralt' : 'Genişlet'}
          className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded"
        >
          {chevron === 'down' ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
      )}
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          muted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    </div>
  );
}

function EmptyRow({ depth, text }: { depth: number; text: string }) {
  return (
    <li
      role="none"
      className="text-muted-foreground py-1 text-xs italic"
      style={{ paddingLeft: depth * 14 + 24 }}
    >
      {text}
    </li>
  );
}

// --- yardımcılar -------------------------------------------------------------

/** Recursive filter: query string ve görünür-tipler maskesine göre ağacı sadeleştirir. */
function filterTree(
  workspaces: ReadonlyArray<RawWorkspace>,
  q: string,
  visible: ReadonlySet<EntityKind>,
): RawWorkspace[] {
  const showCards = visible.has('cards');
  const showLists = visible.has('lists');
  const showBoards = visible.has('boards');

  return workspaces
    .map((w) => {
      const boards: RawBoard[] = showBoards
        ? w.boards
            .map((b) => {
              const lists: RawList[] = showLists
                ? b.lists
                    .map((l) => {
                      const cards: RawCard[] = showCards
                        ? l.cards.filter((c) => matches(c.title, q))
                        : [];
                      const listVisible = matches(l.title, q) || cards.length > 0;
                      return listVisible ? { ...l, cards } : null;
                    })
                    .filter((l): l is RawList => l !== null)
                : [];
              const boardVisible = matches(b.title, q) || lists.length > 0;
              return boardVisible ? { ...b, lists } : null;
            })
            .filter((b): b is RawBoard => b !== null)
        : [];
      const workspaceVisible = matches(w.name, q) || boards.length > 0;
      return workspaceVisible ? { ...w, boards } : null;
    })
    .filter((w): w is RawWorkspace => w !== null);
}

function matches(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLocaleLowerCase('tr').includes(q);
}
