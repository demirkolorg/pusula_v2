import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  params: {} as { id?: string; boardId?: string },
  workspaces: [] as Array<{ id: string }>,
  boards: [] as Array<{
    id: string;
    title: string;
    icon: string;
    role: 'admin' | 'member' | 'viewer';
    version: number;
    archivedAt: Date | null;
    createdAt: Date;
  }>,
  boardGet: undefined as
    | {
        board: {
          id: string;
          title: string;
          icon: string;
          version: number;
          archivedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
          workspaceId: string;
          role: 'admin' | 'member' | 'viewer';
        };
      }
    | undefined,
}));

vi.mock('next/navigation', () => ({
  useParams: () => h.params,
  useRouter: () => ({ push: h.push }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: unknown[]; enabled?: boolean }) => {
    const key = options.queryKey?.[0];
    return {
      data:
        options.enabled === false
          ? undefined
          : key === 'workspace.list'
            ? h.workspaces
            : key === 'board.get'
              ? h.boardGet
              : h.boards,
      isPending: false,
      isError: false,
      isSuccess: options.enabled !== false,
      error: null,
    };
  },
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      list: { queryOptions: () => ({ queryKey: ['workspace.list'] }) },
    },
    board: {
      list: { queryOptions: (input: unknown) => ({ queryKey: ['board.list', input] }) },
      get: { queryOptions: (input: unknown) => ({ queryKey: ['board.get', input] }) },
    },
  }),
}));

vi.mock('../workspaces/[id]/_components/create-board-dialog', () => ({
  CreateBoardDialog: ({ open }: { open?: boolean } = {}) =>
    open ? <div role="dialog" aria-label="create-board" /> : null,
}));

import { BoardSwitcher } from './board-switcher';

const copy = strings.shell.boardSwitcher;

describe('<BoardSwitcher>', () => {
  beforeEach(() => {
    h.push.mockReset();
    h.params = {};
    h.boardGet = undefined;
    h.workspaces = [{ id: 'w1' }];
    h.boards = [
      {
        id: 'b1',
        title: 'Roadmap',
        icon: 'layout-grid',
        role: 'admin',
        version: 1,
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'b2',
        title: 'Archived Board',
        icon: 'archive',
        role: 'viewer',
        version: 1,
        archivedAt: new Date('2026-01-02T00:00:00Z'),
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
  });

  it('is disabled and shows a tooltip when no workspace is selected', async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    const trigger = screen.getByRole('button', { name: copy.ariaLabel });
    expect(trigger).toBeDisabled();
    expect(screen.getByText(copy.disabled)).toBeInTheDocument();

    await user.hover(trigger.parentElement ?? trigger);
    expect((await screen.findAllByText(copy.disabledTooltip)).length).toBeGreaterThan(0);
  });

  it('shows the board placeholder when a workspace is selected outside a board route', () => {
    h.params = { id: 'w1' };
    render(<BoardSwitcher />);

    expect(screen.getByRole('button', { name: copy.ariaLabel })).toBeEnabled();
    expect(screen.getByText(copy.placeholder)).toBeInTheDocument();
  });

  it('renders active boards only and navigates when one is selected', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1' };
    render(<BoardSwitcher />);

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    expect(await screen.findByRole('menuitem', { name: /Roadmap/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: copy.create })).toBeInTheDocument();
    expect(screen.queryByText('Archived Board')).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /Roadmap/ }));
    expect(h.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1');
  });

  it('uses board.get for the active title while keeping archived boards out of the menu', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1', boardId: 'b2' };
    h.boardGet = {
      board: {
        id: 'b2',
        title: 'Archived Board',
        icon: 'archive',
        version: 2,
        archivedAt: new Date('2026-01-02T00:00:00Z'),
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
        workspaceId: 'w1',
        role: 'viewer',
      },
    };
    render(<BoardSwitcher />);

    expect(screen.getByText('Archived Board')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    expect(screen.queryByRole('menuitem', { name: /Archived Board/ })).not.toBeInTheDocument();
  });

  it('uses the board.get title for the active dropdown row after a rename', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1', boardId: 'b1' };
    h.boardGet = {
      board: {
        id: 'b1',
        title: 'Renamed Roadmap',
        icon: 'rocket',
        version: 2,
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
        workspaceId: 'w1',
        role: 'admin',
      },
    };
    render(<BoardSwitcher />);

    expect(screen.getByText('Renamed Roadmap')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    expect(await screen.findByRole('menuitem', { name: 'Renamed Roadmap' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Roadmap' })).not.toBeInTheDocument();
  });

  it('uses transparent board chrome styling on board routes', () => {
    h.params = { id: 'w1', boardId: 'b1' };
    h.boardGet = {
      board: {
        id: 'b1',
        title: 'Roadmap',
        icon: 'layout-grid',
        version: 1,
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
        workspaceId: 'w1',
        role: 'admin',
      },
    };

    render(<BoardSwitcher />);

    const trigger = screen.getByRole('button', { name: copy.ariaLabel });
    expect(trigger.className).not.toContain('bg-background');
    expect(trigger.className).toContain('text-[color:var(--board-chrome-fg)]');
  });

  it('renders the persisted board icon in the trigger and dropdown rows', async () => {
    const user = userEvent.setup();
    h.params = { id: 'w1', boardId: 'b1' };
    h.boardGet = {
      board: {
        id: 'b1',
        title: 'Roadmap',
        icon: 'rocket',
        version: 2,
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
        workspaceId: 'w1',
        role: 'admin',
      },
    };

    render(<BoardSwitcher />);

    expect(
      screen
        .getByRole('button', { name: copy.ariaLabel })
        .querySelector('[data-entity-icon="rocket"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.ariaLabel }));
    const roadmap = await screen.findByRole('menuitem', { name: 'Roadmap' });
    expect(roadmap.querySelector('[data-entity-icon="rocket"]')).toBeInTheDocument();
  });
});
