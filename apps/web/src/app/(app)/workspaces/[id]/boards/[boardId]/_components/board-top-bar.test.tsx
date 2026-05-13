import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({ mutate: vi.fn() }));

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

vi.mock('./board-settings/board-settings-dialog', () => ({
  BoardSettingsDialog: ({ open }: { open?: boolean }) =>
    open ? <div role="dialog" aria-label="board-settings" /> : null,
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

describe('<BoardTopBar>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
  });

  it('renders the board name and eyebrow', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint Panosu"
        archived={false}
        isBoardAdmin
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sprint Panosu' })).toBeInTheDocument();
  });

  it('shows the archived badge when the board is archived', () => {
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Eski Pano" archived isBoardAdmin />);
    expect(screen.getByText(topCopy.archivedBadge)).toBeInTheDocument();
  });

  it('non-admin: no invite button, no more menu', () => {
    render(
      <BoardTopBar
        boardId="b1"
        workspaceId="w1"
        title="Sprint"
        archived={false}
        isBoardAdmin={false}
      />,
    );
    expect(screen.queryByRole('button', { name: topCopy.invite })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
  });

  it('admin active board: the more menu offers rename, archive, and settings', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin />);
    await user.click(screen.getByRole('button', { name: topCopy.more }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRename })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: topCopy.menuArchive })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: topCopy.menuSettings })).toBeInTheDocument();
  });

  it('admin can rename the board inline by clicking the title', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin />);

    await user.click(screen.getByRole('button', { name: 'Sprint' }));
    const input = screen.getByLabelText(strings.board.detail.renamePlaceholder);
    await user.clear(input);
    await user.type(input, 'Yeni Sprint');
    await user.tab();

    expect(h.mutate).toHaveBeenCalledWith({
      boardId: 'b1',
      title: 'Yeni Sprint',
      clientMutationId: expect.any(String),
    });
  });

  it('admin archived board: the more menu offers restore and no rename', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived isBoardAdmin />);
    await user.click(screen.getByRole('button', { name: topCopy.more }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRestore })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuArchive })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuRename })).not.toBeInTheDocument();
  });

  it('admin: invite opens board settings', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin />);
    expect(screen.queryByRole('dialog', { name: 'board-settings' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: topCopy.invite }));
    expect(screen.getByRole('dialog', { name: 'board-settings' })).toBeInTheDocument();
  });
});
