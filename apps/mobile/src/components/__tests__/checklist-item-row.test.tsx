import { describe, expect, it, vi } from 'vitest';
import type { RouterOutputs } from '@pusula/api';
import { fireEvent, render, screen } from './render-helper';
import { ChecklistItemRow } from '../card-detail/checklist-item-row';

/** DEM-221 — `ChecklistItemRow` (kontrol listesi maddesi satırı) birim testleri. */

type ChecklistItem = RouterOutputs['checklist']['list'][number]['items'][number];

const baseItem: ChecklistItem = {
  id: 'item-1',
  checklistId: 'cl-1',
  content: 'Kira sözleşmesi fotokopisi',
  position: 'a0',
  completed: false,
  completedAt: null,
  completedBy: null,
  createdAt: new Date('2026-05-19T00:00:00Z'),
  updatedAt: new Date('2026-05-19T00:00:00Z'),
};

const noop = () => {};

describe('ChecklistItemRow', () => {
  it('madde içeriğini render eder', () => {
    render(
      <ChecklistItemRow
        item={baseItem}
        optimistic={false}
        canEdit
        onToggle={noop}
        onRename={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText('Kira sözleşmesi fotokopisi')).toBeTruthy();
  });

  it('checkbox dokununca onToggle ters tamamlanma durumuyla çağrılır', () => {
    const onToggle = vi.fn();
    render(
      <ChecklistItemRow
        item={baseItem}
        optimistic={false}
        canEdit
        onToggle={onToggle}
        onRename={noop}
        onDelete={noop}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('salt-okunur (canEdit=false) satırda kaydırarak sil aksiyonu render edilmez', () => {
    render(
      <ChecklistItemRow
        item={baseItem}
        optimistic={false}
        canEdit={false}
        onToggle={noop}
        onRename={noop}
        onDelete={noop}
      />,
    );
    expect(screen.queryByLabelText('Maddeyi sil')).toBeNull();
    expect(screen.getByText('Kira sözleşmesi fotokopisi')).toBeTruthy();
  });

  it('optimistic satırda kaydırarak sil aksiyonu render edilmez', () => {
    render(
      <ChecklistItemRow
        item={baseItem}
        optimistic
        canEdit
        onToggle={noop}
        onRename={noop}
        onDelete={noop}
      />,
    );
    expect(screen.queryByLabelText('Maddeyi sil')).toBeNull();
  });
});
