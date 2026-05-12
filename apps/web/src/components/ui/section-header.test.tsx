import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from '@pusula/ui/section-header';

describe('SectionHeader', () => {
  it('renders the label with uppercase styling', () => {
    render(<SectionHeader>açıklama</SectionHeader>);
    const label = screen.getByText('açıklama');
    expect(label.className).toContain('uppercase');
  });

  it('renders the action slot when provided', () => {
    render(<SectionHeader action={<button type="button">Düzenle</button>}>Açıklama</SectionHeader>);
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument();
  });

  it('renders the leading icon', () => {
    render(
      <SectionHeader icon={<span data-testid="icon" />}>Kontrol Listesi</SectionHeader>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
