import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { AuthBrandPanel } from './auth-brand-panel';

describe('<AuthBrandPanel>', () => {
  it('renders the brand panel copy from centralized auth strings', () => {
    const copy = strings.auth.brandPanel;

    expect(copy).toBeDefined();

    const { container } = render(<AuthBrandPanel />);

    const expectedHeadline = `${copy.headline.prefix} ${copy.headline.emphasis} ${copy.headline.suffix}`;
    const headline = container.querySelector('h2');

    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(headline).toHaveTextContent(expectedHeadline);
    expect(screen.getByText(copy.headline.emphasis)).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();

    for (const advantage of copy.advantages) {
      expect(screen.getByText(advantage)).toBeInTheDocument();
    }

    expect(screen.getByText(copy.summary.label)).toBeInTheDocument();
    expect(screen.getByText(copy.summary.title)).toBeInTheDocument();
    expect(screen.getByText(copy.summary.status)).toBeInTheDocument();
    expect(screen.getByText(copy.footer)).toBeInTheDocument();

    for (const metric of copy.summary.metrics) {
      expect(screen.getByText(metric.title)).toBeInTheDocument();
      expect(screen.getByText(metric.value)).toBeInTheDocument();
    }
  });
});
