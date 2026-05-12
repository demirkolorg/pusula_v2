import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailLabels, type BoardLabel, type CardLabel } from './card-detail-labels';

const copy = strings.card.labels;

const boardLabels: BoardLabel[] = [
  { id: 'l1', name: 'Acil', color: 'red' },
  { id: 'l2', name: '', color: 'blue' },
];

describe('<CardDetailLabels>', () => {
  it('shows the empty placeholder when the card has no labels', () => {
    render(
      <CardDetailLabels
        cardLabels={[]}
        boardLabels={boardLabels}
        canEdit
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.empty)).toBeInTheDocument();
  });

  it('renders the card labels as chips (unnamed shows the placeholder name)', () => {
    const cardLabels: CardLabel[] = [
      { labelId: 'l1', name: 'Acil', color: 'red' },
      { labelId: 'l2', name: '', color: 'blue' },
    ];
    render(
      <CardDetailLabels
        cardLabels={cardLabels}
        boardLabels={boardLabels}
        canEdit={false}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByText('Acil')).toBeInTheDocument();
    expect(screen.getAllByText(copy.unnamed).length).toBeGreaterThan(0);
  });

  it('member: opening the editor lists board labels; clicking "Ekle" on an unattached one calls onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <CardDetailLabels
        cardLabels={[]}
        boardLabels={boardLabels}
        canEdit
        onAdd={onAdd}
        onRemove={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.addAction }));
    const [firstAddButton] = screen.getAllByRole('button', { name: copy.add });
    if (!firstAddButton) throw new Error('expected at least one "add label" button');
    await user.click(firstAddButton);
    expect(onAdd).toHaveBeenCalledWith('l1');
  });

  it('member: the "new label" form submits the chosen colour (+ optional name)', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <CardDetailLabels
        cardLabels={[]}
        boardLabels={[]}
        canEdit
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.click(screen.getByRole('button', { name: copy.addAction }));
    await user.type(screen.getByLabelText(copy.createNameLabel), 'Bekliyor');
    await user.click(screen.getByRole('button', { name: copy.createSubmit }));
    expect(onCreate).toHaveBeenCalledWith({ color: 'green', name: 'Bekliyor' });
  });

  it('surfaces an inline error (e.g. colour+name conflict)', () => {
    render(
      <CardDetailLabels
        cardLabels={[]}
        boardLabels={boardLabels}
        canEdit
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCreate={vi.fn()}
        error="Bu renk + ad ile etiket zaten var."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bu renk + ad ile etiket zaten var.');
  });
});
