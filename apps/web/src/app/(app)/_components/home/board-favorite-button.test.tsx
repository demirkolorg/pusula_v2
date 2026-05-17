import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

// Capture the args handed to `useOptimisticBoardListMutation` and expose a
// spy `mutate` so the test can assert the toggle payload without a real
// TanStack Query / tRPC stack.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  lastArgs: undefined as unknown,
}));

vi.mock('@/lib/board-cache', () => ({
  useOptimisticBoardListMutation: (args: unknown) => {
    h.lastArgs = args;
    return { mutate: h.mutate, isPending: h.isPending };
  },
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: { setFavorite: { mutationOptions: (o: unknown) => o } },
  }),
}));

import { BoardFavoriteButton } from './board-favorite-button';

describe('<BoardFavoriteButton>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.isPending = false;
  });

  it('reflects the favorited state via aria-pressed and the add/remove label', () => {
    const { rerender } = render(
      <BoardFavoriteButton
        workspaceId="w1"
        boardId="b1"
        boardTitle="Sprint"
        favorited={false}
      />,
    );
    const button = screen.getByRole('button', {
      name: strings.home.boards.favoriteAdd('Sprint'),
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <BoardFavoriteButton workspaceId="w1" boardId="b1" boardTitle="Sprint" favorited />,
    );
    expect(
      screen.getByRole('button', { name: strings.home.boards.favoriteRemove('Sprint') }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles the favorite flag on click (off -> on)', async () => {
    const user = userEvent.setup();
    render(
      <BoardFavoriteButton
        workspaceId="w1"
        boardId="b1"
        boardTitle="Sprint"
        favorited={false}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', favorited: true });
  });

  it('toggles the favorite flag on click (on -> off)', async () => {
    const user = userEvent.setup();
    render(
      <BoardFavoriteButton workspaceId="w1" boardId="b1" boardTitle="Sprint" favorited />,
    );
    await user.click(screen.getByRole('button'));
    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', favorited: false });
  });

  it('optimistically flips the favorited flag in the board-list cache', () => {
    render(
      <BoardFavoriteButton
        workspaceId="w1"
        boardId="b2"
        boardTitle="Roadmap"
        favorited={false}
      />,
    );
    const args = h.lastArgs as {
      workspaceId: string;
      apply: (
        boards: { id: string; favorited: boolean }[],
        vars: { boardId: string; favorited: boolean },
      ) => { id: string; favorited: boolean }[];
    };
    expect(args.workspaceId).toBe('w1');
    const next = args.apply(
      [
        { id: 'b1', favorited: false },
        { id: 'b2', favorited: false },
      ],
      { boardId: 'b2', favorited: true },
    );
    expect(next).toEqual([
      { id: 'b1', favorited: false },
      { id: 'b2', favorited: true },
    ]);
  });

  it('disables the button while the mutation is pending', () => {
    h.isPending = true;
    render(
      <BoardFavoriteButton workspaceId="w1" boardId="b1" boardTitle="Sprint" favorited />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
