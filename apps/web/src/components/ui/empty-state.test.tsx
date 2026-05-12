import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@pusula/ui/empty-state';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="Henüz yorum yok." />);
    expect(screen.getByText('Henüz yorum yok.')).toBeInTheDocument();
  });

  it('renders the optional icon and action', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon" />}
        message="Henüz aktivite yok."
        action={<button type="button">Yenile</button>}
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yenile' })).toBeInTheDocument();
  });
});
