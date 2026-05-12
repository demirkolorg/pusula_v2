import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardFilterBar, type BoardFilterLabel } from './board-filter-bar';

const copy = strings.board.filter;

const labels: BoardFilterLabel[] = [
  { id: 'l1', name: 'Acil', color: 'red' },
  { id: 'l2', name: '', color: 'blue' },
];

describe('<BoardFilterBar>', () => {
  it('renders label chips and the archived-lists toggle', () => {
    render(
      <BoardFilterBar
        labels={labels}
        selectedLabelIds={new Set()}
        onToggleLabel={vi.fn()}
        onClearLabels={vi.fn()}
        showArchivedLists={false}
        onToggleArchivedLists={vi.fn()}
        archivedListCount={2}
      />,
    );
    expect(screen.getByRole('button', { name: /Acil/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.showArchivedLists })).toBeInTheDocument();
    expect(screen.getByText(`2 ${copy.archivedListCount}`)).toBeInTheDocument();
  });

  it('clicking a chip calls onToggleLabel with its id', async () => {
    const user = userEvent.setup();
    const onToggleLabel = vi.fn();
    render(
      <BoardFilterBar
        labels={labels}
        selectedLabelIds={new Set()}
        onToggleLabel={onToggleLabel}
        onClearLabels={vi.fn()}
        showArchivedLists={false}
        onToggleArchivedLists={vi.fn()}
        archivedListCount={0}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Acil/ }));
    expect(onToggleLabel).toHaveBeenCalledWith('l1');
  });

  it('shows "clear" only when something is selected; clicking it calls onClearLabels', async () => {
    const user = userEvent.setup();
    const onClearLabels = vi.fn();
    const { rerender } = render(
      <BoardFilterBar
        labels={labels}
        selectedLabelIds={new Set()}
        onToggleLabel={vi.fn()}
        onClearLabels={onClearLabels}
        showArchivedLists={false}
        onToggleArchivedLists={vi.fn()}
        archivedListCount={0}
      />,
    );
    expect(screen.queryByRole('button', { name: copy.clearLabels })).not.toBeInTheDocument();
    rerender(
      <BoardFilterBar
        labels={labels}
        selectedLabelIds={new Set(['l1'])}
        onToggleLabel={vi.fn()}
        onClearLabels={onClearLabels}
        showArchivedLists={false}
        onToggleArchivedLists={vi.fn()}
        archivedListCount={0}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.clearLabels }));
    expect(onClearLabels).toHaveBeenCalledTimes(1);
  });

  it('toggle button reflects state and fires onToggleArchivedLists', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <BoardFilterBar
        labels={[]}
        selectedLabelIds={new Set()}
        onToggleLabel={vi.fn()}
        onClearLabels={vi.fn()}
        showArchivedLists={false}
        onToggleArchivedLists={onToggle}
        archivedListCount={1}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.showArchivedLists }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <BoardFilterBar
        labels={[]}
        selectedLabelIds={new Set()}
        onToggleLabel={vi.fn()}
        onClearLabels={vi.fn()}
        showArchivedLists
        onToggleArchivedLists={onToggle}
        archivedListCount={1}
      />,
    );
    expect(screen.getByRole('button', { name: copy.hideArchivedLists })).toBeInTheDocument();
  });

  it('shows the "no labels" hint when the board has no labels', () => {
    render(
      <BoardFilterBar
        labels={[]}
        selectedLabelIds={new Set()}
        onToggleLabel={vi.fn()}
        onClearLabels={vi.fn()}
        showArchivedLists={false}
        onToggleArchivedLists={vi.fn()}
        archivedListCount={0}
      />,
    );
    expect(screen.getByText(copy.noLabels)).toBeInTheDocument();
  });
});
