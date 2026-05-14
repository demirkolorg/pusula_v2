import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  pathname: '/',
  params: {} as { id?: string; boardId?: string },
  push: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
}));

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
        data: undefined,
        isPending: false,
        isError: false,
        isSuccess: options.enabled !== false,
        error: null,
      };
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
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
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
  });

  it('renders brand and switchers on the left, then bell, theme, and avatar on the right', async () => {
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
    const bell = screen.getByRole('button', { name: strings.shell.notifications.label });
    const theme = await screen.findByRole('button', { name: strings.shell.themeToggleToDark });
    const avatar = screen.getByRole('button', { name: strings.shell.userMenu.ariaLabel });

    expect(brand.compareDocumentPosition(workspace)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(workspace.compareDocumentPosition(board)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(board.compareDocumentPosition(bell)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(bell.compareDocumentPosition(theme)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(theme.compareDocumentPosition(avatar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const headerInner = brand.closest('header')?.firstElementChild as HTMLElement | null;
    expect(headerInner?.className).not.toContain('max-w-7xl');
    expect(headerInner?.className).toContain('px-4');
    expect(screen.queryByRole('link', { name: 'Aria Chen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.shell.signOut })).not.toBeInTheDocument();
  });
});
