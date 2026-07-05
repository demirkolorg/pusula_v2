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
  onArchiveChecklist: vi.fn(),
  onAddItem: vi.fn(),
  onToggleItem: vi.fn(),
  onEditItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onReorderItem: vi.fn(),
});

const checklists: ChecklistView[] = [
  {
    id: 'c1',
    cardId: 'card1',
    title: 'Hazırlık',
    position: 'a0',
    archivedAt: null,
    items: [
      {
        id: 'i1',
        checklistId: 'c1',
        content: 'Birinci',
        position: 'a0',
        completed: false,
        completedBy: null,
        commentCount: 0,
      },
      {
        id: 'i2',
        checklistId: 'c1',
        content: 'İkinci',
        position: 'a1',
        completed: true,
        completedBy: null,
        commentCount: 0,
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

  it('collapses and re-expands the checklist body when the header is clicked', async () => {
    const user = userEvent.setup();
    render(<CardDetailChecklists checklists={checklists} canEdit {...handlers()} />);
    const header = screen.getByRole('button', { name: /Hazırlık/ });
    // Açık başlar: gövde + maddeler görünür.
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Birinci')).toBeInTheDocument();
    // Başlığa tıkla → kapanır, maddeler DOM'dan kalkar.
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Birinci')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.itemAddAction })).not.toBeInTheDocument();
    // Tekrar tıkla → geri açılır.
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Birinci')).toBeInTheDocument();
  });

  it('viewer (canEdit=false): can still collapse via the header', async () => {
    const user = userEvent.setup();
    render(<CardDetailChecklists checklists={checklists} canEdit={false} {...handlers()} />);
    const header = screen.getByRole('button', { name: /Hazırlık/ });
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Birinci')).not.toBeInTheDocument();
  });

  it('viewer (canEdit=false): checkboxes disabled, no add/edit affordances', () => {
    render(<CardDetailChecklists checklists={checklists} canEdit={false} {...handlers()} />);
    for (const box of screen.getAllByLabelText(copy.itemToggleLabel)) {
      expect(box).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: copy.itemAddAction })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.addAction })).not.toBeInTheDocument();
  });

  it('archived checklist: kept out of the active list + top progress, shown in a collapsed archive section', async () => {
    const user = userEvent.setup();
    const withArchived: ChecklistView[] = [
      ...checklists,
      {
        id: 'c2',
        cardId: 'card1',
        title: 'Eski liste',
        position: 'a1',
        archivedAt: new Date('2026-01-01'),
        items: [
          {
            id: 'i9',
            checklistId: 'c2',
            content: 'Arşiv maddesi',
            position: 'a0',
            completed: false,
            completedBy: null,
            commentCount: 0,
          },
        ],
      },
    ];
    render(<CardDetailChecklists checklists={withArchived} canEdit {...handlers()} />);

    // Aktif liste görünür; arşivli listenin başlığı/maddesi başta gizli (bölüm kapalı).
    expect(screen.getByText('Hazırlık')).toBeInTheDocument();
    expect(screen.queryByText('Eski liste')).not.toBeInTheDocument();
    expect(screen.queryByText('Arşiv maddesi')).not.toBeInTheDocument();

    // Arşiv bölümü başlığı var, sayaç 1, varsayılan kapalı.
    const archiveToggle = screen.getByRole('button', { name: copy.archivedSectionLabel });
    expect(archiveToggle).toHaveAttribute('aria-expanded', 'false');

    // Aç → arşivli liste başlığı görünür (blok kendi içinde salt-görünüm, default kapalı).
    await user.click(archiveToggle);
    expect(archiveToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Eski liste')).toBeInTheDocument();
  });
});
