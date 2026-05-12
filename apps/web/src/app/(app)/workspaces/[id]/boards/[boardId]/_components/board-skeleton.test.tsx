import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardSkeleton } from './board-skeleton';

describe('<BoardSkeleton>', () => {
  it('renders a busy status region with an accessible loading label', () => {
    render(<BoardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(strings.board.skeleton.loading)).toBeInTheDocument();
  });
});
