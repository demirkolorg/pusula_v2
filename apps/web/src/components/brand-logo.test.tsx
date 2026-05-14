import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { BRAND_LOGO_SRC, BrandLogo } from './brand-logo';

describe('<BrandLogo>', () => {
  it('renders the compass asset with the app name by default', () => {
    const { container } = render(<BrandLogo />);

    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', BRAND_LOGO_SRC);
    expect(logo).toHaveAttribute('alt', '');
    expect(screen.getByText(strings.common.appName)).toBeInTheDocument();
  });

  it('can render the compass mark without visible text', () => {
    const { container } = render(<BrandLogo showText={false} />);

    expect(container.querySelector('img')).toHaveAttribute('src', BRAND_LOGO_SRC);
    expect(screen.queryByText(strings.common.appName)).not.toBeInTheDocument();
  });

  it('can render the compass directly in the current text color', () => {
    const { container } = render(<BrandLogo variant="plain" />);

    const mark = container.querySelector('[data-slot="brand-logo-mark"]');
    expect(mark).toHaveClass('bg-current');
    expect(mark).not.toHaveClass('bg-primary');
    expect(mark).not.toHaveClass('rounded-md');
    expect(mark).toHaveStyle({
      mask: `url(${BRAND_LOGO_SRC}) center / contain no-repeat`,
    });
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
