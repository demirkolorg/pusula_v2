import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// The settings dialog pulls in member/invitation/label sections that fetch data;
// stub it to a minimal marker so the top bar can be tested in isolation.
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
  it('renders the board name and the "Pano" eyebrow', () => {
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint Panosu" archived={false} isBoardAdmin />);
    expect(screen.getByRole('heading', { name: 'Sprint Panosu' })).toBeInTheDocument();
  });

  it('shows the "Arşivli" badge and an archive icon when the board is archived', () => {
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Eski Pano" archived isBoardAdmin />);
    expect(screen.getByText(topCopy.archivedBadge)).toBeInTheDocument();
  });

  it('non-admin: no invite button, no "⋮" menu', () => {
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin={false} />);
    expect(screen.queryByRole('button', { name: topCopy.invite })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: topCopy.more })).not.toBeInTheDocument();
  });

  it('admin (active board): the "⋮" menu offers rename / archive / board settings', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin />);
    await user.click(screen.getByRole('button', { name: topCopy.more }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRename })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: topCopy.menuArchive })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: topCopy.menuSettings })).toBeInTheDocument();
  });

  it('admin (archived board): the "⋮" menu offers restore instead of archive, and no rename', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived isBoardAdmin />);
    await user.click(screen.getByRole('button', { name: topCopy.more }));
    expect(await screen.findByRole('menuitem', { name: topCopy.menuRestore })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuArchive })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: topCopy.menuRename })).not.toBeInTheDocument();
  });

  it('admin: the "Davet et / paylaş" button opens the board settings dialog', async () => {
    const user = userEvent.setup();
    render(<BoardTopBar boardId="b1" workspaceId="w1" title="Sprint" archived={false} isBoardAdmin />);
    expect(screen.queryByRole('dialog', { name: 'board-settings' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: topCopy.invite }));
    expect(screen.getByRole('dialog', { name: 'board-settings' })).toBeInTheDocument();
  });
});
