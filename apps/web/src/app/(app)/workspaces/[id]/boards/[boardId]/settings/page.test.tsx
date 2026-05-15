import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Suspense, act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      get: {
        queryOptions: (input: unknown) => ({
          key: 'board.get',
          input,
        }),
      },
    },
  }),
}));

vi.mock('../_components/board-settings/board-icon-picker', () => ({
  BoardIconPicker: ({
    icon,
    canManage,
    boardActive,
  }: {
    icon: string;
    canManage: boolean;
    boardActive: boolean;
  }) => (
    <div data-testid="board-icon-picker">
      {icon}:{String(canManage)}:{String(boardActive)}
    </div>
  ),
}));

vi.mock('../_components/board-settings/background-picker', () => ({
  BoardBackgroundPicker: ({
    background,
    canManage,
    boardActive,
  }: {
    background: string | null;
    canManage: boolean;
    boardActive: boolean;
  }) => (
    <div data-testid="board-background-picker">
      {background ?? 'default'}:{String(canManage)}:{String(boardActive)}
    </div>
  ),
}));

import BoardSettingsPage from './page';

type QueryStub = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data?: unknown;
  error?: { message: string };
};

const queryStub = (overrides: Partial<QueryStub>): QueryStub => ({
  isPending: false,
  isError: false,
  isSuccess: false,
  ...overrides,
});

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>loading</div>}>
        <BoardSettingsPage params={Promise.resolve({ id: 'w1', boardId: 'b1' })} />
      </Suspense>,
    );
  });
}

describe('<BoardSettingsPage>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
  });

  it('renders board icon and background settings for an active admin board', async () => {
    h.useQuery.mockReturnValue(
      queryStub({
        isSuccess: true,
        data: {
          board: {
            id: 'b1',
            workspaceId: 'w1',
            title: 'Roadmap',
            icon: 'rocket',
            background: 'solid:mavi',
            archivedAt: null,
            role: 'admin',
          },
          lists: [],
          cards: [],
        },
      }),
    );

    await renderPage();

    expect(
      await screen.findByRole('heading', { name: strings.board.settings.dropdownTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.board.settings.backToBoard })).toHaveAttribute(
      'href',
      '/workspaces/w1/boards/b1',
    );
    expect(screen.getByTestId('board-icon-picker')).toHaveTextContent('rocket:true:true');
    expect(screen.getByTestId('board-background-picker')).toHaveTextContent('solid:mavi:true:true');
  });
});
