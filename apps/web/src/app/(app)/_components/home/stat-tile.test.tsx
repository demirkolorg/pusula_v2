import { render, screen } from '@testing-library/react';
import { CircleIcon } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatTile } from './stat-tile';

describe('<StatTile>', () => {
  it('renders the label, value and sub line', () => {
    render(<StatTile icon={CircleIcon} tone="warning" label="Açık görev" value={38} sub="Bu hafta" />);
    expect(screen.getByText('Açık görev')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('Bu hafta')).toBeInTheDocument();
  });

  it('omits the sub line when none is given', () => {
    render(<StatTile icon={CircleIcon} tone="primary" label="Bana atanan" value={0} />);
    expect(screen.getByText('Bana atanan')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
