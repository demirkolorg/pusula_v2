import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailDescription } from './card-detail-description';

const copy = strings.card.detail;

describe('<CardDetailDescription>', () => {
  it('shows the "add description" prompt for an editor when there is no description', () => {
    render(<CardDetailDescription description={null} canEdit onSave={vi.fn()} />);
    expect(screen.getByText(copy.descriptionEmptyPrompt)).toBeInTheDocument();
  });

  it('read-only viewer with no description sees the empty placeholder, no edit affordance', () => {
    render(<CardDetailDescription description={null} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText(copy.descriptionEmpty)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.descriptionAdd })).not.toBeInTheDocument();
  });

  it('renders the existing (legacy plain-text) description', () => {
    render(<CardDetailDescription description="Bir açıklama" canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText('Bir açıklama')).toBeInTheDocument();
  });

  it('editor: clicking edit opens the rich-text editor; cancel closes it', async () => {
    const user = userEvent.setup();
    render(<CardDetailDescription description="Eski" canEdit onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: copy.descriptionEditAction }));
    expect(screen.getByLabelText(copy.descriptionTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.descriptionCancelAction }));
    expect(screen.queryByLabelText(copy.descriptionTitle)).not.toBeInTheDocument();
    expect(screen.getByText('Eski')).toBeInTheDocument();
  });

  it('editor: a no-op save closes the editor without calling onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDescription description="Eski" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.descriptionEditAction }));
    await user.click(screen.getByRole('button', { name: copy.descriptionSave }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Eski')).toBeInTheDocument();
  });
});
