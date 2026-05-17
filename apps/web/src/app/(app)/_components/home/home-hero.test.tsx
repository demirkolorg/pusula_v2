import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { HomeHero } from './home-hero';

describe('<HomeHero>', () => {
  it('renders the landing title as the page heading and its description', () => {
    render(<HomeHero />);
    expect(
      screen.getByRole('heading', { level: 1, name: strings.workspace.listTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(strings.board.listSectionDescription)).toBeInTheDocument();
  });
});
