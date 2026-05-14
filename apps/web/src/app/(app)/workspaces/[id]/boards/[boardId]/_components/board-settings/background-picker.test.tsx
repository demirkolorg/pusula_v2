import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardBackgroundPicker } from './background-picker';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  capturedArgs: undefined as undefined | { apply: (data: unknown, vars: { background?: string | null }) => unknown },
  mutationState: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
    reset: vi.fn(),
  },
}));

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    board: {
      update: { mutationOptions: (options: unknown) => options },
    },
  }),
}));

vi.mock('@/lib/board-cache', async () => {
  const actual = await vi.importActual('@/lib/board-cache');
  return {
    ...(actual as object),
    useOptimisticBoardMutation: vi.fn((args: typeof h.capturedArgs) => {
      h.capturedArgs = args;
      return h.mutationState;
    }),
  };
});

const copy = strings.board.background;

function setup(overrides: Partial<Parameters<typeof BoardBackgroundPicker>[0]> = {}) {
  h.mutationState.mutate = h.mutate;
  const props = {
    boardId: 'b1',
    background: null,
    canManage: true,
    boardActive: true,
    ...overrides,
  };
  render(<BoardBackgroundPicker {...props} />);
  return props;
}

describe('<BoardBackgroundPicker>', () => {
  beforeEach(() => {
    h.mutate.mockReset();
    h.capturedArgs = undefined;
    h.mutationState.isPending = false;
    h.mutationState.isError = false;
    h.mutationState.error = null;
    h.mutationState.reset.mockReset();
  });

  it('selects a gradient swatch through board.update', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: copy.gradientNames.ocean }));

    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: 'gradient:ocean' });
  });

  it('switches to solid colours and selects a palette swatch', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('tab', { name: copy.tabs.solid }));
    expect(screen.getByText(copy.colorNames.mavi)).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.colorNames.mavi }));

    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: 'solid:mavi' });
  });

  it('renders expanded gradient and board-only white solid swatches', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByText('Trello Mavi')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Lagun' }));
    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: 'gradient:lagoon' });

    await user.click(screen.getByRole('button', { name: 'Trello Mavi' }));
    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: 'gradient:trello-snow' });

    await user.click(screen.getByRole('tab', { name: copy.tabs.solid }));
    await user.click(screen.getByRole('button', { name: 'Beyaz' }));

    expect(h.mutate).toHaveBeenLastCalledWith({ boardId: 'b1', background: 'solid:beyaz' });
  });

  it('clears the background from the default tile', async () => {
    const user = userEvent.setup();
    setup({ background: 'solid:mavi' });

    await user.click(screen.getByRole('tab', { name: copy.tabs.solid }));
    await user.click(screen.getByRole('button', { name: copy.default }));

    expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: null });
  });

  it('disables all swatches for non-admin users', async () => {
    const user = userEvent.setup();
    setup({ canManage: false });

    expect(screen.getByRole('button', { name: copy.gradientNames.ocean })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: copy.tabs.solid }));
    expect(screen.getByRole('button', { name: copy.default })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.colorNames.mavi })).toBeDisabled();
  });

  it('configures an optimistic board background patch compatible with rollback', () => {
    setup();
    const fixture = { board: { id: 'b1', background: null }, lists: [], cards: [] };

    const next = h.capturedArgs?.apply(fixture, { background: 'gradient:ocean' }) as typeof fixture;

    expect(next.board.background).toBe('gradient:ocean');
    expect(fixture.board.background).toBeNull();
  });

  it('leaves optimistic cache untouched when background is omitted', () => {
    setup();
    const fixture = { board: { id: 'b1', background: 'solid:mavi' }, lists: [], cards: [] };

    const next = h.capturedArgs?.apply(fixture, {}) as typeof fixture;

    expect(next).toBe(fixture);
    expect(next.board.background).toBe('solid:mavi');
  });

  it('surfaces mutation errors inline', () => {
    h.mutationState.isError = true;
    h.mutationState.error = { message: 'Arka plan geri alındı.' };
    setup();

    expect(screen.getByRole('alert')).toHaveTextContent('Arka plan geri alındı.');
  });
});
