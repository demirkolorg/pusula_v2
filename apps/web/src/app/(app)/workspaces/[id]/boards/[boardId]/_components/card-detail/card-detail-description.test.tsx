import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardDetailDescription } from './card-detail-description';

const copy = strings.card.detail;

describe('<CardDetailDescription>', () => {
  it('shows the empty placeholder when there is no description', () => {
    render(<CardDetailDescription description={null} canEdit onSave={vi.fn()} />);
    expect(screen.getByText(copy.descriptionEmpty)).toBeInTheDocument();
  });

  it('renders the existing description text', () => {
    render(<CardDetailDescription description="Bir açıklama" canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText('Bir açıklama')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.descriptionEdit })).not.toBeInTheDocument();
  });

  it('member: edit → save sends the trimmed text', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDescription description="Eski" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.descriptionEdit }));
    const ta = screen.getByLabelText(copy.descriptionTitle);
    await user.clear(ta);
    await user.type(ta, '  Yeni metin  ');
    await user.click(screen.getByRole('button', { name: copy.descriptionSave }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Yeni metin'));
  });

  it('member: clearing the description sends an empty string', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDescription description="Eski" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.descriptionEdit }));
    await user.clear(screen.getByLabelText(copy.descriptionTitle));
    await user.click(screen.getByRole('button', { name: copy.descriptionSave }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
  });

  it('a no-op save just closes the editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDetailDescription description="Eski" canEdit onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: copy.descriptionEdit }));
    await user.click(screen.getByRole('button', { name: copy.descriptionSave }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Eski')).toBeInTheDocument();
  });
});
