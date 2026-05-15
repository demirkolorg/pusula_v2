import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => {
  type SearchItem = {
    id: string;
    entityType: 'board' | 'list' | 'card' | 'comment' | 'label';
    entityId: string;
    workspaceId: string;
    workspaceTitle: string;
    boardId: string | null;
    boardTitle: string | null;
    cardId: string | null;
    cardTitle: string | null;
    title: string;
    snippet: string;
    rank: number;
    targetUrl: string;
    updatedAt: Date;
  };

  const cardResult = (id: string, title: string, targetUrl: string): SearchItem => ({
    id,
    entityType: 'card',
    entityId: id,
    workspaceId: 'w1',
    workspaceTitle: 'Urun',
    boardId: 'b1',
    boardTitle: 'Sprint',
    cardId: id,
    cardTitle: title,
    title,
    snippet: 'Arama eslesmesi',
    rank: 1,
    targetUrl,
    updatedAt: new Date('2026-05-14T10:00:00.000Z'),
  });

  const makeSearchQuery = (): {
    data: {
      items: SearchItem[];
      nextCursor: null;
    };
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
  } => ({
    data: {
      items: [cardResult('c1', 'Kart sonucu', '/workspaces/w1/boards/b1?card=c1')],
      nextCursor: null,
    },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
  });

  return {
    pathname: '/',
    params: {} as { id?: string; boardId?: string },
    push: vi.fn(),
    replace: vi.fn(),
    setTheme: vi.fn(),
    searchCalls: [] as Array<{ input: Record<string, unknown>; enabled?: boolean }>,
    boardGetData: undefined as
      | undefined
      | { board: { id: string; title: string; background: string | null } },
    makeSearchQuery,
    cardResult,
    searchQuery: makeSearchQuery(),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => h.pathname,
  useParams: () => h.params,
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: h.setTheme }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: vi.fn() }),
  useQuery: (options: { queryKey?: unknown[]; enabled?: boolean }) => {
    const key = options.queryKey?.[0];
    if (key === 'workspace.list') {
      return { data: [], isPending: false, isError: false, isSuccess: true, error: null };
    }
    if (key === 'workspace.get') {
      return {
        data: undefined,
        isPending: false,
        isError: false,
        isSuccess: options.enabled !== false,
        error: null,
      };
    }
    if (key === 'board.list') {
      return {
        data: options.enabled === false ? undefined : [],
        isPending: false,
        isError: false,
        isSuccess: options.enabled !== false,
        error: null,
      };
    }
    if (key === 'board.get') {
      return {
        data: h.boardGetData,
        isPending: false,
        isError: false,
        isSuccess: options.enabled !== false,
        error: null,
      };
    }
    if (key === 'search.query') {
      h.searchCalls.push({
        input: (options.queryKey?.[1] ?? {}) as Record<string, unknown>,
        enabled: options.enabled,
      });
      return h.searchQuery;
    }
    return { data: undefined, isPending: false, isError: false, isSuccess: true, error: null };
  },
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ queryKey: ['workspace.list'] }) },
      get: { queryOptions: (input: unknown) => ({ queryKey: ['workspace.get', input] }) },
    },
    board: {
      list: { queryOptions: (input: unknown) => ({ queryKey: ['board.list', input] }) },
      get: { queryOptions: (input: unknown) => ({ queryKey: ['board.get', input] }) },
    },
    search: {
      query: {
        queryOptions: (input: unknown, options?: { enabled?: boolean }) => ({
          queryKey: ['search.query', input],
          enabled: options?.enabled,
        }),
      },
    },
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock('@/lib/realtime/use-user-realtime', () => ({
  useUserRealtime: vi.fn(),
}));

vi.mock('./notification-bell', () => ({
  NotificationBell: () => (
    <button type="button" aria-label="Bildirimler">
      Bildirimler
    </button>
  ),
}));

vi.mock('./create-workspace-dialog', () => ({
  CreateWorkspaceDialog: () => null,
}));

vi.mock('../workspaces/[id]/_components/create-board-dialog', () => ({
  CreateBoardDialog: () => null,
}));

import { AppShell } from './app-shell';

describe('<AppShell>', () => {
  beforeEach(() => {
    h.pathname = '/';
    h.params = {};
    h.push.mockReset();
    h.searchCalls = [];
    h.boardGetData = undefined;
    h.searchQuery = h.makeSearchQuery();
  });

  it('renders brand and switchers on the left, then bell, theme, font size, and avatar on the right', async () => {
    render(
      <AppShell userName="Aria Chen" userEmail="aria@example.com">
        <div>content</div>
      </AppShell>,
    );

    const brand = screen.getByRole('link', { name: strings.common.appName });
    const workspace = screen.getByRole('button', {
      name: strings.shell.workspaceSwitcher.ariaLabel,
    });
    const board = screen.getByRole('button', {
      name: strings.shell.boardSwitcher.ariaLabel,
    });
    const search = screen.getByRole('button', { name: 'Ara' });
    const bell = screen.getByRole('button', { name: strings.notifications.bellAria(0) });
    const theme = await screen.findByRole('button', { name: strings.shell.themeToggleToDark });
    const fontSize = screen.getByRole('button', { name: strings.shell.fontSize.trigger });
    const avatar = screen.getByRole('button', { name: strings.shell.userMenu.ariaLabel });

    expect(brand.compareDocumentPosition(workspace)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(workspace.compareDocumentPosition(board)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(board.compareDocumentPosition(search)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(search.compareDocumentPosition(bell)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(bell.compareDocumentPosition(theme)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(theme.compareDocumentPosition(fontSize)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fontSize.compareDocumentPosition(avatar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const headerInner = brand.closest('header')?.firstElementChild as HTMLElement | null;
    expect(headerInner?.className).not.toContain('max-w-7xl');
    expect(headerInner?.className).toContain('px-4');
    const logoMark = brand.querySelector('[data-slot="brand-logo-mark"]');
    expect(logoMark).toHaveClass('bg-current');
    expect(logoMark).not.toHaveClass('bg-primary');
    expect(logoMark).not.toHaveClass('rounded-md');
    expect(brand.querySelector('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Aria Chen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.shell.signOut })).not.toBeInTheDocument();
  });

  it('opens global search with Ctrl+K, debounces query calls, and follows result targetUrl', () => {
    vi.useFakeTimers();
    try {
      render(
        <AppShell userName="Aria Chen" userEmail="aria@example.com">
          <div>content</div>
        </AppShell>,
      );

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const input = screen.getByRole('searchbox', { name: 'Arama sorgusu' });

      fireEvent.change(input, { target: { value: 'k' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(h.searchCalls.some((call) => call.enabled === true)).toBe(false);

      fireEvent.change(input, { target: { value: 'kart' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(h.searchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            enabled: true,
            input: expect.objectContaining({ query: 'kart', limit: 10 }),
          }),
        ]),
      );

      fireEvent.click(screen.getByRole('button', { name: /Kart sonucu/ }));
      expect(h.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=c1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens global search with Ctrl+Space', () => {
    render(
      <AppShell userName="Aria Chen" userEmail="aria@example.com">
        <div>content</div>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: ' ', ctrlKey: true });

    expect(screen.getByRole('searchbox', { name: 'Arama sorgusu' })).toBeInTheDocument();
  });

  it('keeps the result list scrollable and avoids the browser search clear button', () => {
    vi.useFakeTimers();
    try {
      h.searchQuery.data.items = Array.from({ length: 14 }, (_, idx) =>
        h.cardResult(
          `c${idx + 1}`,
          `Kart sonucu ${idx + 1}`,
          `/workspaces/w1/boards/b1?card=c${idx + 1}`,
        ),
      );
      render(
        <AppShell userName="Aria Chen" userEmail="aria@example.com">
          <div>content</div>
        </AppShell>,
      );

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const input = screen.getByRole('searchbox', { name: 'Arama sorgusu' });
      fireEvent.change(input, { target: { value: 'kart' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(input).toHaveAttribute('type', 'text');
      expect(screen.getByTestId('search-results')).toHaveClass(
        'min-h-0',
        'flex-1',
        'overflow-y-auto',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports ArrowDown, ArrowUp, and Enter navigation without moving focus from the input', () => {
    vi.useFakeTimers();
    try {
      h.searchQuery.data.items = [
        h.cardResult('c1', 'Birinci kart', '/workspaces/w1/boards/b1?card=c1'),
        h.cardResult('c2', 'Ikinci kart', '/workspaces/w1/boards/b1?card=c2'),
      ];
      render(
        <AppShell userName="Aria Chen" userEmail="aria@example.com">
          <div>content</div>
        </AppShell>,
      );

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const input = screen.getByRole('searchbox', { name: 'Arama sorgusu' });
      fireEvent.change(input, { target: { value: 'kart' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input).toHaveFocus();
      expect(screen.getByRole('button', { name: /Ikinci kart/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByRole('button', { name: /Birinci kart/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(h.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1?card=c1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an empty state when a debounced global search has no results', () => {
    vi.useFakeTimers();
    try {
      h.searchQuery.data.items = [];
      render(
        <AppShell userName="Aria Chen" userEmail="aria@example.com">
          <div>content</div>
        </AppShell>,
      );

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(screen.getByRole('searchbox', { name: 'Arama sorgusu' }), {
        target: { value: 'olmayan' },
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('Sonuç yok.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an error state when global search fails', () => {
    vi.useFakeTimers();
    try {
      h.searchQuery.isError = true;
      h.searchQuery.error = new Error('Arama servisi yanıt vermedi.');
      render(
        <AppShell userName="Aria Chen" userEmail="aria@example.com">
          <div>content</div>
        </AppShell>,
      );

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(screen.getByRole('searchbox', { name: 'Arama sorgusu' }), {
        target: { value: 'hata' },
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByRole('alert')).toHaveTextContent('Arama tamamlanamadı');
      expect(screen.getByRole('alert')).toHaveTextContent('Arama servisi yanıt vermedi.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the active board background to tint the app header on board routes', () => {
    h.pathname = '/workspaces/w1/boards/b1';
    h.params = { id: 'w1', boardId: 'b1' };
    h.boardGetData = { board: { id: 'b1', title: 'Sprint', background: 'solid:mavi' } };

    render(
      <AppShell userName="Aria Chen" userEmail="aria@example.com">
        <div>content</div>
      </AppShell>,
    );

    const brand = screen.getByRole('link', { name: strings.common.appName });
    const shell = brand.closest('div[class*="board-bg-"]');
    const header = brand.closest('header');

    expect(shell?.className).toContain('board-bg-solid-mavi');
    expect(header?.className).toContain('bg-board-shell');
    expect(header?.className).not.toContain('bg-card');
  });

  it('keeps board settings routes inside the standard page container', () => {
    h.pathname = '/workspaces/w1/boards/b1/settings';
    h.params = { id: 'w1', boardId: 'b1' };
    h.boardGetData = { board: { id: 'b1', title: 'Sprint', background: 'solid:mavi' } };

    render(
      <AppShell userName="Aria Chen" userEmail="aria@example.com">
        <div>content</div>
      </AppShell>,
    );

    const content = screen.getByText('content');
    const main = content.closest('main');
    const brand = screen.getByRole('link', { name: strings.common.appName });
    const header = brand.closest('header');

    expect(main?.className).toContain('max-w-5xl');
    expect(main?.className).toContain('px-4');
    expect(header?.className).toContain('bg-card');
    expect(header?.className).not.toContain('bg-board-shell');
  });
});
