import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./board-labels-section', () => ({
  BoardLabelsSection: ({ canEdit }: { canEdit: boolean }) => (
    <div>board labels section · canEdit={String(canEdit)}</div>
  ),
}));

import { BoardLabelsDropdown } from './board-labels-dropdown';

/**
 * Etiket paleti, "Ayarlar" dropdown'undan ayrılıp kendi ikon-butonuna taşındı.
 * Buton herkese görünür; düzenleme yetkisi `canEdit` ile aktarılır.
 */
describe('<BoardLabelsDropdown>', () => {
  it('renders an icon-only trigger button labelled "Etiketler"', () => {
    render(<BoardLabelsDropdown boardId="b1" canEdit />);
    expect(screen.getByRole('button', { name: 'Etiketler' })).toBeInTheDocument();
  });

  it('reveals the labels section in its panel and forwards canEdit', async () => {
    const user = userEvent.setup();
    render(<BoardLabelsDropdown boardId="b1" canEdit />);

    await user.click(screen.getByRole('button', { name: 'Etiketler' }));
    expect(
      await screen.findByText('board labels section · canEdit=true'),
    ).toBeInTheDocument();
  });

  it('forwards canEdit=false for read-only viewers', async () => {
    const user = userEvent.setup();
    render(<BoardLabelsDropdown boardId="b1" canEdit={false} />);

    await user.click(screen.getByRole('button', { name: 'Etiketler' }));
    expect(
      await screen.findByText('board labels section · canEdit=false'),
    ).toBeInTheDocument();
  });
});
