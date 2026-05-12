import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelChip, LabelSwatch } from '@pusula/ui/label-chip';

describe('LabelChip', () => {
  it('renders a solid chip with the palette token classes', () => {
    render(<LabelChip color="mavi" name="Acil" />);
    const chip = screen.getByText('Acil');
    expect(chip.className).toContain('bg-palet-mavi');
    expect(chip.className).toContain('text-palet-mavi-foreground');
  });

  it('renders a soft chip variant', () => {
    render(<LabelChip color="yesil" name="Hazır" variant="soft" />);
    const chip = screen.getByText('Hazır');
    expect(chip.className).toContain('bg-palet-yesil/15');
    expect(chip.className).toContain('text-palet-yesil');
  });

  it('renders a short colour bar when no name is given', () => {
    const { container } = render(<LabelChip color="kirmizi" />);
    const chip = container.querySelector('[data-slot="label-chip"]');
    expect(chip?.textContent).toBe('');
    expect(chip?.className).toContain('bg-palet-kirmizi');
    expect(chip?.className).toContain('h-2');
  });
});

describe('LabelSwatch', () => {
  it('renders a round colour dot', () => {
    const { container } = render(<LabelSwatch color="mor" />);
    const dot = container.querySelector('[data-slot="label-swatch"]');
    expect(dot?.className).toContain('rounded-full');
    expect(dot?.className).toContain('bg-palet-mor');
  });
});
