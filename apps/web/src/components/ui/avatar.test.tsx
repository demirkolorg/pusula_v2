import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from '@pusula/ui/avatar';

describe('Avatar', () => {
  it('renders deterministic initials from a multi-word name', () => {
    render(<Avatar name="Aria Chen" />);
    const el = screen.getByText('AC');
    expect(el).toBeInTheDocument();
  });

  it('uses a name-derived palette background class', () => {
    const { container } = render(<Avatar name="Aria Chen" />);
    const root = container.querySelector('[data-slot="avatar"]');
    expect(root?.className).toMatch(/bg-palet-/);
  });

  it('falls back to a muted background when no name is given', () => {
    const { container } = render(<Avatar />);
    const root = container.querySelector('[data-slot="avatar"]');
    expect(root?.className).toContain('bg-muted');
  });

  it('renders an <img> when an image URL is provided', () => {
    render(<Avatar name="Aria Chen" image="https://example.com/a.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/a.png');
  });

  it('applies the requested size class', () => {
    const { container } = render(<Avatar name="A" size="lg" />);
    const root = container.querySelector('[data-slot="avatar"]');
    expect(root?.className).toContain('size-10');
  });
});
