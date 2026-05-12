import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailCoverColor } from './card-detail-cover-color';

const m = strings.card.detail.modal;

function setup(overrides: Partial<Parameters<typeof CardDetailCoverColor>[0]> = {}) {
  const props = {
    coverColor: null,
    canEdit: true,
    onSelect: vi.fn(),
    pending: false,
    error: null as string | null,
    ...overrides,
  };
  render(<CardDetailCoverColor {...props} />);
  return props;
}

describe('<CardDetailCoverColor>', () => {
  it('renders the 12-swatch palette', () => {
    setup();
    expect(screen.getAllByRole('button', { name: new RegExp(m.coverColorOf) })).toHaveLength(12);
  });

  it('clicking a swatch calls onSelect with its palette name', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: `${m.coverColorOf} mavi` }));
    expect(props.onSelect).toHaveBeenCalledWith('mavi');
  });

  it('does not re-fire onSelect when the already-selected swatch is clicked', async () => {
    const user = userEvent.setup();
    const props = setup({ coverColor: 'mavi' });
    await user.click(screen.getByRole('button', { name: `${m.coverColorOf} mavi` }));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('the "remove" button (shown only when a colour is set) clears the cover colour', async () => {
    const user = userEvent.setup();
    const props = setup({ coverColor: 'kirmizi' });
    await user.click(screen.getByRole('button', { name: m.coverColorClear }));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('does not render the "remove" button when no cover colour is set', () => {
    setup({ coverColor: null });
    expect(screen.queryByRole('button', { name: m.coverColorClear })).not.toBeInTheDocument();
  });

  it('marks the active swatch with aria-pressed', () => {
    setup({ coverColor: 'yesil' });
    expect(screen.getByRole('button', { name: `${m.coverColorOf} yesil` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('read-only viewer: swatches disabled, no "remove" button', () => {
    setup({ canEdit: false, coverColor: 'mor' });
    for (const swatch of screen.getAllByRole('button', { name: new RegExp(m.coverColorOf) })) {
      expect(swatch).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: m.coverColorClear })).not.toBeInTheDocument();
  });

  it('surfaces an inline error', () => {
    setup({ error: 'Geçersiz renk.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Geçersiz renk.');
  });
});
