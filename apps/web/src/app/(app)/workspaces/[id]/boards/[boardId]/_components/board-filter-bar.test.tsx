import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { BoardFilterMenuContent, type BoardFilterLabel } from './board-filter-bar';

const copy = strings.board.filter;

const labels: BoardFilterLabel[] = [
  { id: 'l1', name: 'Acil', color: 'red' },
  { id: 'l2', name: 'Beklemede', color: 'blue' },
];

function renderMenu(props: Partial<ComponentProps<typeof BoardFilterMenuContent>> = {}) {
  const defaults: ComponentProps<typeof BoardFilterMenuContent> = {
    labels,
    selectedLabelIds: new Set(),
    onToggleLabel: vi.fn(),
    onClearLabels: vi.fn(),
    dueDateFilter: 'all',
    onDueDateFilterChange: vi.fn(),
  };

  return render(
    <DropdownMenu open>
      <DropdownMenuContent forceMount>
        <BoardFilterMenuContent {...defaults} {...props} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe('<BoardFilterMenuContent>', () => {
  it('renders label checkbox items without the archived-lists control', () => {
    renderMenu();

    expect(screen.getByRole('menuitemcheckbox', { name: /Acil/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Beklemede/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemcheckbox', { name: new RegExp(copy.archivedListsToggle) }),
    ).not.toBeInTheDocument();
  });

  it('clicking a label item calls onToggleLabel with its id', async () => {
    const user = userEvent.setup();
    const onToggleLabel = vi.fn();
    renderMenu({ onToggleLabel });

    await user.click(screen.getByRole('menuitemcheckbox', { name: /Acil/ }));

    expect(onToggleLabel).toHaveBeenCalledWith('l1');
  });

  it('shows clear only when something is selected; clicking it calls onClearLabels', async () => {
    const user = userEvent.setup();
    const onClearLabels = vi.fn();
    const { rerender } = renderMenu({ onClearLabels });

    expect(screen.queryByRole('menuitem', { name: copy.clearLabels })).not.toBeInTheDocument();

    rerender(
      <DropdownMenu open>
        <DropdownMenuContent forceMount>
          <BoardFilterMenuContent
            labels={labels}
            selectedLabelIds={new Set(['l1'])}
            onToggleLabel={vi.fn()}
            onClearLabels={onClearLabels}
            dueDateFilter="all"
            onDueDateFilterChange={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('menuitem', { name: copy.clearLabels }));
    expect(onClearLabels).toHaveBeenCalledTimes(1);
  });

  it('shows the no-labels hint when the board has no labels', () => {
    renderMenu({ labels: [] });

    expect(screen.getByText(copy.noLabels)).toBeInTheDocument();
  });

  it('renders the due-date filter section with the selected option checked', () => {
    renderMenu({ dueDateFilter: 'overdue' });

    expect(screen.getByText(copy.dueDateTitle)).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: copy.dueDateOverdue })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: copy.dueDateAll })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('clicking a due-date option calls onDueDateFilterChange with its value', async () => {
    const user = userEvent.setup();
    const onDueDateFilterChange = vi.fn();
    renderMenu({ onDueDateFilterChange });

    await user.click(screen.getByRole('menuitemradio', { name: copy.dueDateWeek }));

    expect(onDueDateFilterChange).toHaveBeenCalledWith('week');
  });
});
