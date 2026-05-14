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

function renderMenu(
  props: Partial<ComponentProps<typeof BoardFilterMenuContent>> = {},
) {
  const defaults: ComponentProps<typeof BoardFilterMenuContent> = {
    labels,
    selectedLabelIds: new Set(),
    onToggleLabel: vi.fn(),
    onClearLabels: vi.fn(),
    showArchivedLists: false,
    onToggleArchivedLists: vi.fn(),
    archivedListCount: 2,
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
  it('renders label checkbox items and the archived-lists checkbox item', () => {
    renderMenu();

    expect(screen.getByRole('menuitemcheckbox', { name: /Acil/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Beklemede/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: new RegExp(copy.archivedListsToggle) }),
    ).toBeInTheDocument();
    expect(screen.getByText(`2 ${copy.archivedListCount}`)).toBeInTheDocument();
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
            showArchivedLists={false}
            onToggleArchivedLists={vi.fn()}
            archivedListCount={0}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('menuitem', { name: copy.clearLabels }));
    expect(onClearLabels).toHaveBeenCalledTimes(1);
  });

  it('the archived-lists item reflects state and fires onToggleArchivedLists', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = renderMenu({
      labels: [],
      showArchivedLists: false,
      onToggleArchivedLists: onToggle,
      archivedListCount: 1,
    });

    const item = screen.getByRole('menuitemcheckbox', {
      name: new RegExp(copy.archivedListsToggle),
    });
    expect(item).toHaveAttribute('aria-checked', 'false');

    await user.click(item);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <DropdownMenu open>
        <DropdownMenuContent forceMount>
          <BoardFilterMenuContent
            labels={[]}
            selectedLabelIds={new Set()}
            onToggleLabel={vi.fn()}
            onClearLabels={vi.fn()}
            showArchivedLists
            onToggleArchivedLists={onToggle}
            archivedListCount={1}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(
      screen.getByRole('menuitemcheckbox', { name: new RegExp(copy.archivedListsToggle) }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the no-labels hint when the board has no labels', () => {
    renderMenu({ labels: [], archivedListCount: 0 });

    expect(screen.getByText(copy.noLabels)).toBeInTheDocument();
  });
});
