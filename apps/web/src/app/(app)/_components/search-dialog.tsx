'use client';

import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGridIcon,
  ListIcon,
  MessageSquareIcon,
  PaperclipIcon,
  SearchIcon,
  TagsIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { friendlyErrorMessage } from '@/lib/error-message';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 275;
const SEARCH_LIMIT = 10;
const DISABLED_QUERY = '__inactive__';

type SearchResult = RouterOutputs['search']['query']['items'][number];
type SearchEntityType = SearchResult['entityType'];

type SearchDialogProps = {
  variant?: 'global' | 'board';
  workspaceId?: string;
  boardId?: string;
  enableShortcut?: boolean;
  triggerMode?: 'wide' | 'icon';
  triggerLabel?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const entityOrder: SearchEntityType[] = [
  'board',
  'list',
  'card',
  'comment',
  'attachment',
  'label',
];

const entityIcons = {
  board: LayoutGridIcon,
  list: ListIcon,
  card: LayoutGridIcon,
  comment: MessageSquareIcon,
  attachment: PaperclipIcon,
  label: TagsIcon,
} satisfies Record<SearchEntityType, LucideIcon>;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function groupResults(items: SearchResult[]) {
  return entityOrder
    .map((entityType) => ({
      entityType,
      items: items.filter((item) => item.entityType === entityType),
    }))
    .filter((group) => group.items.length > 0);
}

function resultContext(item: SearchResult) {
  return [
    item.workspaceTitle,
    item.boardTitle,
    item.entityType === 'comment' || item.entityType === 'attachment' ? item.cardTitle : null,
  ]
    .filter(Boolean)
    .join(' / ');
}

function TriggerButton({
  mode,
  label,
  className,
  ...props
}: {
  mode: NonNullable<SearchDialogProps['triggerMode']>;
  label: string;
  className?: string;
} & Omit<ComponentProps<typeof Button>, 'children'>) {
  if (mode === 'icon') {
    return (
      <Button
        {...props}
        type="button"
        variant="ghost"
        size="icon"
        className={cn('size-8', className)}
        aria-label={label}
      >
        <SearchIcon className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      {...props}
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'text-muted-foreground h-9 w-full justify-start gap-2 px-3 font-normal',
        className,
      )}
      aria-label={label}
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  );
}

function SearchResultButton({
  active,
  item,
  onActive,
  onSelect,
  resultRef,
}: {
  active: boolean;
  item: SearchResult;
  onActive: () => void;
  onSelect: () => void;
  resultRef: (node: HTMLButtonElement | null) => void;
}) {
  const copy = strings.search;
  const EntityIcon = entityIcons[item.entityType];
  const context = resultContext(item);
  const snippet = item.snippet.trim();

  return (
    <button
      type="button"
      ref={resultRef}
      aria-selected={active}
      className={cn(
        'hover:bg-accent focus-visible:bg-accent flex w-full min-w-0 items-start gap-3 rounded-md px-3 py-2 text-left outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        active && 'bg-accent',
      )}
      onFocus={onActive}
      onMouseMove={onActive}
      onClick={onSelect}
    >
      <span className="bg-muted text-muted-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
        <EntityIcon className="size-3.5" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-foreground truncate text-sm font-medium">{item.title}</span>
        {snippet && <span className="text-muted-foreground line-clamp-2 text-xs">{snippet}</span>}
        {context && <span className="text-muted-foreground truncate text-[11px]">{context}</span>}
      </span>
      <Badge variant="outline" className="mt-0.5">
        {copy.entityTypes[item.entityType]}
      </Badge>
    </button>
  );
}

export function SearchDialog({
  variant = 'global',
  workspaceId,
  boardId,
  enableShortcut = false,
  triggerMode = 'wide',
  triggerLabel,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: SearchDialogProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const copy = strings.search;
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const open = controlledOpen ?? internalOpen;
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const searchEnabled = open && debouncedQuery.length >= MIN_SEARCH_LENGTH;
  const label = triggerLabel ?? (variant === 'board' ? copy.boardTrigger : copy.globalTrigger);

  const setDialogOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
      if (!next) setQuery('');
    },
    [controlledOpen, onOpenChange],
  );

  useEffect(() => {
    if (!enableShortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const isGlobalSearchShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('tr') === 'k';
      const isCtrlSpaceShortcut = event.ctrlKey && event.key === ' ';
      if (isGlobalSearchShortcut || isCtrlSpaceShortcut) {
        event.preventDefault();
        setDialogOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableShortcut, setDialogOpen]);

  const search = useQuery(
    trpc.search.query.queryOptions(
      {
        query: searchEnabled ? debouncedQuery : DISABLED_QUERY,
        workspaceId,
        boardId,
        limit: SEARCH_LIMIT,
      },
      { enabled: searchEnabled },
    ),
  );

  const items = searchEnabled ? (search.data?.items ?? []) : [];
  const groups = useMemo(() => groupResults(items), [items]);
  const loading = searchEnabled && (search.isPending || search.isFetching);
  const showEmpty = searchEnabled && !loading && !search.isError && items.length === 0;

  const selectResult = (item: SearchResult) => {
    router.push(item.targetUrl);
    setDialogOpen(false);
  };

  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, items.length);
    setActiveIndex(items.length > 0 ? 0 : -1);
  }, [items]);

  useEffect(() => {
    if (activeIndex < 0) return;
    resultRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const moveActive = (direction: 1 | -1) => {
    if (items.length === 0) return;
    setActiveIndex((current) => {
      if (current < 0) return direction > 0 ? 0 : items.length - 1;
      return (current + direction + items.length) % items.length;
    });
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Home' && items.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End' && items.length > 0) {
      event.preventDefault();
      setActiveIndex(items.length - 1);
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      const item = items[activeIndex];
      if (!item) return;
      event.preventDefault();
      selectResult(item);
    }
  };

  let resultIndex = 0;

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      {triggerMode === 'icon' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <TriggerButton mode={triggerMode} label={label} className={triggerClassName} />
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>
          <TriggerButton mode={triggerMode} label={label} className={triggerClassName} />
        </DialogTrigger>
      )}
      <DialogContent
        closeLabel={strings.common.close}
        className="top-[18vh] flex max-h-[min(76vh,40rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {variant === 'board' ? copy.boardDialogTitle : copy.dialogTitle}
          </DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            type="text"
            role="searchbox"
            aria-label={copy.inputLabel}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={copy.inputPlaceholder}
            className="placeholder:text-muted-foreground h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div data-testid="search-results" className="min-h-0 flex-1 overflow-y-auto p-2">
          {trimmedQuery.length < MIN_SEARCH_LENGTH ? (
            <EmptyState
              icon={<SearchIcon className="size-8" />}
              message={copy.minLength}
              className="py-10"
            />
          ) : null}

          {loading ? (
            <AppSpinner
              label={copy.loading}
              showLabel
              size="sm"
              className="justify-start px-3 py-4"
            />
          ) : null}

          {searchEnabled && search.isError ? (
            <div role="alert" className="px-3 py-4 text-sm">
              <p className="text-foreground font-medium">{copy.errorTitle}</p>
              <p className="text-muted-foreground mt-1">
                {friendlyErrorMessage(search.error)}
              </p>
            </div>
          ) : null}

          {showEmpty ? (
            <EmptyState
              icon={<SearchIcon className="size-8" />}
              message={copy.empty}
              className="py-10"
            />
          ) : null}

          {!loading && !search.isError && groups.length > 0 ? (
            <div className="grid gap-3">
              {groups.map((group) => (
                <section key={group.entityType} aria-label={copy.entityTypes[group.entityType]}>
                  <h3 className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold uppercase tracking-normal">
                    {copy.entityTypes[group.entityType]}
                  </h3>
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const index = resultIndex++;
                      return (
                        <SearchResultButton
                          key={item.id}
                          active={index === activeIndex}
                          item={item}
                          onActive={() => setActiveIndex(index)}
                          onSelect={() => selectResult(item)}
                          resultRef={(node) => {
                            resultRefs.current[index] = node;
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
