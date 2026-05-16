import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RadioGroup, RadioGroupItem } from '@pusula/ui/radio-group';

function MuteLevelFixture({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <RadioGroup defaultValue="none" aria-label="Susturma seviyesi" onValueChange={onValueChange}>
      <label>
        <RadioGroupItem value="none" /> Tüm bildirimler
      </label>
      <label>
        <RadioGroupItem value="mention" /> Sadece sözedilme
      </label>
      <label>
        <RadioGroupItem value="all" /> Tamamen sustur
      </label>
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('renders a radiogroup with the initial item checked', () => {
    render(<MuteLevelFixture />);
    expect(screen.getByRole('radiogroup', { name: 'Susturma seviyesi' })).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    const [none, mention, all] = radios as [HTMLElement, HTMLElement, HTMLElement];
    expect(none).toHaveAttribute('data-state', 'checked');
    expect(none).toHaveAttribute('aria-checked', 'true');
    expect(mention).toHaveAttribute('aria-checked', 'false');
    expect(all).toHaveAttribute('aria-checked', 'false');
  });

  it('changes selection and fires onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MuteLevelFixture onValueChange={onValueChange} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);
    const mention = radios[1] as HTMLElement;
    await user.click(mention);

    expect(onValueChange).toHaveBeenCalledWith('mention');
    expect(mention).toHaveAttribute('data-state', 'checked');
  });
});
