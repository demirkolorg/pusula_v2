import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Suspense, act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  replace: vi.fn(),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.useQuery,
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    workspace: {
      get: { queryOptions: (input: unknown) => ({ key: 'workspace.get', input }) },
      list: { queryFilter: () => ({ key: 'workspace.list' }) },
      invitations: {
        list: { queryFilter: (input: unknown) => ({ key: 'workspace.invitations.list', input }) },
      },
    },
  }),
}));

vi.mock('../../_components/invite-member-dialog', () => ({
  InviteMemberDialog: () => <button type="button">Üye davet et</button>,
}));

vi.mock('./_components/archive-workspace-dialog', () => ({
  ArchiveWorkspaceDialog: () => <div data-testid="archive-workspace-dialog">archive workspace</div>,
}));

vi.mock('./_components/board-list-section', () => ({
  BoardListSection: ({ canCreateBoard }: { canCreateBoard: boolean }) => (
    <div data-testid="board-list-section">{String(canCreateBoard)}</div>
  ),
}));

vi.mock('./_components/delete-workspace-dialog', () => ({
  DeleteWorkspaceDialog: ({ workspaceName }: { workspaceName: string }) => (
    <div data-testid="delete-workspace-dialog">delete {workspaceName}</div>
  ),
}));

vi.mock('./_components/member-list', () => ({
  MemberList: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="member-list">{String(canManage)}</div>
  ),
}));

vi.mock('./_components/sent-invitations', () => ({
  SentInvitations: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="sent-invitations">{String(canManage)}</div>
  ),
}));

vi.mock('./_components/workspace-settings', () => ({
  WorkspaceSettings: ({
    name,
    slug,
    icon,
  }: {
    name: string;
    slug: string;
    icon: string;
  }) => (
    <div data-testid="workspace-settings">
      {name}:{slug}:{icon}
    </div>
  ),
}));

import WorkspaceManagePage from './page';

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
        <WorkspaceManagePage params={Promise.resolve({ id: 'w1' })} />
      </Suspense>,
    );
  });
}

describe('<WorkspaceManagePage>', () => {
  beforeEach(() => {
    h.useQuery.mockReset();
    h.invalidateQueries.mockReset();
    h.replace.mockReset();
  });

  it('uses the board settings layout pattern for workspace management', async () => {
    h.useQuery.mockReturnValue(
      queryStub({
        isSuccess: true,
        data: {
          id: 'w1',
          name: 'Acme',
          slug: 'acme',
          icon: 'briefcase',
          role: 'owner',
          memberCount: 4,
        },
      }),
    );

    await renderPage();

    expect(
      await screen.findByRole('heading', { name: strings.workspace.manage.settingsTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace kimliği, panoları, üyeleri ve işlemlerini yönetin.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Genel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.board.listSectionTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.members.sectionTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workspace rol bilgisi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.invitations.sentTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workspace işlemleri' })).toBeInTheDocument();
    expect(screen.getByTestId('workspace-settings')).toHaveTextContent('Acme:acme:briefcase');
    expect(screen.getByTestId('board-list-section')).toHaveTextContent('true');
    expect(screen.getByTestId('member-list')).toHaveTextContent('true');
    expect(screen.getByTestId('sent-invitations')).toHaveTextContent('true');
    expect(screen.getByTestId('archive-workspace-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('delete-workspace-dialog')).toHaveTextContent('delete Acme');
  });
});
