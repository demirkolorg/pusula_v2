import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({ mutate: vi.fn(), clipboardWriteText: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('./board-settings/board-members-section', () => ({
  BoardMembersSection: () => <div>Üyeler paneli</div>,
}));

vi.mock('./board-settings/board-invitations-section', () => ({
  BoardInvitationsSection: () => <div>Davetler paneli</div>,
}));

vi.mock('./board-settings/board-labels-section', () => ({
  BoardLabelsSection: () => <div>Etiketler paneli</div>,
}));

vi.mock('./board-settings/background-picker', () => ({
  BoardBackgroundPicker: () => <div>Arka plan paneli</div>,
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      update: { mutationOptions: (o: unknown) => o },
      archive: { mutationOptions: (o: unknown) => o },
      get: { queryFilter: () => ({}) },
    },
  }),
}));

import { BoardTopBar } from './board-top-bar';

const topCopy = strings.board.topBar;
const filterCopy = strings.board.filter;
const oldInviteShareCopy = 'Davet et / paylaş';
const actionCopy = {
  invite: 'Davet et',
  share: 'Paylaş',
  settings: 'Pano ayarları',
  settingsMembers: 'Üyeler',
  settingsInvitations: 'Davetler',
  settingsLabels: 'Etiketler',
  settingsBackground: 'Arka plan',
  settingsActions: 'Pano işlemleri',
};

const filterProps = {
  labels: [
    { id: 'l1', name: 'Acil', color: 'red' },
    { id: 'l2', name: 'Beklemede', color: 'blue' },
  ],
  selectedLabelIds: new Set<string>(['l1']),
  onToggleLabel: vi.fn(),
  onClearLabels: vi.fn(),
  showArchivedLists: false,
  onToggleArchivedLists: vi.fn(),
  archivedListCount: 2,
};

describe('<BoardTopBar>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    filterProps.onToggleLabel.mockReset();
    filterProps.onClearLabels.mockReset();
    filterProps.onToggleArchivedLists.mockReset();
    h.clipboardWriteText.mockRestore?.();
    const clipboard =
      window.navigator.clipboard ??
      ({
        writeText: vi.fn(),
      } as unknown as Clipboard);
    if (!window.navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      });
    }
    h.clipboardWriteText = vi
      .spyOn(clipboard, 'writeText')
      .mockResolvedValue(undefined);
  });

  it('renders the board title on the far left without the old workspace identity or favorite action', () => {
    const { container } = render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint Panosu"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sprint Panosu' })).toBeInTheDocument();
    expect(container.querySelector('.uppercase')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: strings.board.detail.backToWorkspace }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.favorite })).not.toBeInTheDocument();
  });

  it('shows the archived badge beside the title when the board is archived', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Eski Pano"
        background={null}
        archived
        isBoardAdmin
        filter={filterProps}
      />,
    );
    const title = screen.getByRole('heading', { name: 'Eski Pano' });
    const badge = screen.getByText(topCopy.archivedBadge);
    expect(title.compareDocumentPosition(badge)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('non-admin: no invite control, settings are viewable, share is still available, and title is not editable', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin={false}
        filter={filterProps}
      />,
    );
    expect(screen.queryByRole('button', { name: oldInviteShareCopy })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: actionCopy.invite })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settings })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.share })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sprint' })).not.toBeInTheDocument();
  });

  it('uses an icon button dropdown for board views instead of an inline tablist', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    expect(screen.queryByRole('tablist', { name: topCopy.eyebrow })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: topCopy.viewMenu }));
    expect(await screen.findByRole('menuitemcheckbox', { name: topCopy.viewBoard })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: topCopy.viewList })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: topCopy.viewLabels })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('opens filters from the top bar action area', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: filterCopy.labelsTitle }));
    expect(await screen.findByRole('menuitemcheckbox', { name: /Acil/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Beklemede/ }));
    expect(filterProps.onToggleLabel).toHaveBeenCalledWith('l2');
    await user.click(screen.getByRole('menuitemcheckbox', { name: filterCopy.archivedListsToggle }));
    expect(filterProps.onToggleArchivedLists).toHaveBeenCalledTimes(1);
  });

  it('admin active board: split invite/share/settings controls replace the old invite/share and more menu', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    expect(screen.queryByRole('button', { name: oldInviteShareCopy })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.invite })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.share })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: actionCopy.settings })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    expect(await screen.findByRole('tab', { name: actionCopy.settingsMembers })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: actionCopy.settingsInvitations })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: actionCopy.settingsLabels })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: actionCopy.settingsBackground })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: actionCopy.settingsActions })).toBeInTheDocument();
  });

  it('admin can rename the board from the settings actions tab', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    await user.click(await screen.findByRole('tab', { name: actionCopy.settingsActions }));
    await user.click(await screen.findByRole('menuitem', { name: topCopy.menuRename }));
    const input = await screen.findByLabelText(strings.board.detail.renamePlaceholder);
    await user.clear(input);
    await user.type(input, 'Yeni Sprint');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith(
      {
        boardId: 'b1',
        title: 'Yeni Sprint',
        clientMutationId: expect.any(String),
      },
      undefined,
    );
  });

  it('admin can rename the board inline by clicking the title', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sprint' }));
    const input = await screen.findByLabelText(strings.board.detail.renamePlaceholder);
    await user.clear(input);
    await user.type(input, 'Inline Sprint');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith(
      {
        boardId: 'b1',
        title: 'Inline Sprint',
        clientMutationId: expect.any(String),
      },
      undefined,
    );
  });

  it('admin archived board: the settings actions tab offers restore and no rename', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived
        isBoardAdmin
        filter={filterProps}
      />,
    );
    await user.click(screen.getByRole('button', { name: actionCopy.settings }));
    await user.click(await screen.findByRole('tab', { name: actionCopy.settingsActions }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRestore })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuArchive })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuRename })).not.toBeInTheDocument();
  });

  it('admin: invite opens board settings on the invitations tab', async () => {
    const user = userEvent.setup();
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );
    expect(screen.queryByRole('tab', { name: actionCopy.settingsInvitations })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: actionCopy.invite }));
    expect(await screen.findByRole('tab', { name: actionCopy.settingsInvitations })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('copies the canonical board link from the share button', async () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        background={null}
        archived={false}
        isBoardAdmin
        filter={filterProps}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: actionCopy.share }));
    await waitFor(() => {
      expect(h.clipboardWriteText).toHaveBeenCalledWith(
        `${window.location.origin}/workspaces/w1/boards/b1`,
      );
    });
  });
});
