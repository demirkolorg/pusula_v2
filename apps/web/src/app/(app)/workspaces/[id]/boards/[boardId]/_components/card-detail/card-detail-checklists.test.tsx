import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailChecklists, type ChecklistView } from './card-detail-checklists';

const copy = strings.card.checklist;

const handlers = () => ({
  onCreateChecklist: vi.fn(),
  onRenameChecklist: vi.fn(),
  onDeleteChecklist: vi.fn(),
  onAddItem: vi.fn(),
  onToggleItem: vi.fn(),
  onEditItem: vi.fn(),
  onDeleteItem: vi.fn(),
});

const checklists: ChecklistView[] = [
  {
    id: 'c1',
    cardId: 'card1',
    title: 'Hazırlık',
    position: 'a0',
    items: [
      {
        id: 'i1',
        checklistId: 'c1',
        content: 'Birinci',
        position: 'a0',
        completed: false,
        completedBy: null,
      },
      {
        id: 'i2',
        checklistId: 'c1',
        content: 'İkinci',
        position: 'a1',
        completed: true,
        completedBy: null,
      },
    ],
  },
];

describe('<CardDetailChecklists>', () => {
  it('empty placeholder when there are no checklists', () => {
    render(<CardDetailChecklists checklists={[]} canEdit {...handlers()} />);
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });

  it('renders a checklist with its progress and items', () => {
    render(<CardDetailChecklists checklists={checklists} canEdit={false} {...handlers()} />);
    expect(screen.getByText('Hazırlık')).toBeInTheDocument();
    expect(screen.getByText(`1/2 ${copy.progress} ${copy.progressDone}`)).toBeInTheDocument();
    expect(screen.getByText('Birinci')).toBeInTheDocument();
    expect(screen.getByText('İkinci')).toBeInTheDocument();
  });

  it('member: toggling an item checkbox calls onToggleItem with the new state', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<CardDetailChecklists checklists={checklists} canEdit {...h} />);
    const [firstBox] = screen.getAllByLabelText(copy.itemToggleLabel);
    if (!firstBox) throw new Error('expected at least one checklist item checkbox');
    await user.click(firstBox); // 'Birinci' is unchecked → becomes true
    expect(h.onToggleItem).toHaveBeenCalledWith({
      checklistId: 'c1',
      itemId: 'i1',
      completed: true,
    });
  });

  it('member: "add item" form submits the trimmed content', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<CardDetailChecklists checklists={checklists} canEdit {...h} />);
    await user.click(screen.getByRole('button', { name: copy.itemAddAction }));
    await user.type(screen.getByLabelText(copy.itemPlaceholder), '  Üçüncü  ');
    await user.click(screen.getByRole('button', { name: copy.itemAddSubmit }));
    expect(h.onAddItem).toHaveBeenCalledWith({ checklistId: 'c1', content: 'Üçüncü' });
  });

  it('viewer (canEdit=false): checkboxes disabled, no add/edit affordances', () => {
    render(<CardDetailChecklists checklists={checklists} canEdit={false} {...handlers()} />);
    for (const box of screen.getAllByLabelText(copy.itemToggleLabel)) {
      expect(box).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: copy.itemAddAction })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.addAction })).not.toBeInTheDocument();
  });
});
