import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppSpinner } from './app-spinner';

describe('<AppSpinner>', () => {
  it('uses the compass Lottie animation as an accessible loading status', () => {
    render(<AppSpinner label="Pano yükleniyor..." />);

    expect(screen.getByRole('status', { name: 'Pano yükleniyor...' })).toBeInTheDocument();
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-animation-name', 'newScene');
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-loop', 'true');
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-autoplay', 'true');
  });

  it('can show the loading label next to the animation', () => {
    render(<AppSpinner label="Aranıyor..." showLabel size="sm" />);

    expect(screen.getByText('Aranıyor...')).not.toHaveClass('sr-only');
    expect(screen.getByTestId('lottie-player')).toHaveClass('size-5');
  });
});
