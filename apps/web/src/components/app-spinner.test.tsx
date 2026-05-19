import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LottieSpinner } from './lottie-spinner';

// `AppSpinner` artık `LottieSpinner`'ı `next/dynamic` (`ssr: false`) ile lazy
// yükler — `lottie-react`'i board route ilk JS bundle'ından çıkarmak için
// (DEM-229 #5). Lottie tabanlı görsel davranış doğrudan `LottieSpinner` üzerinde
// test edilir; `app-spinner.tsx` artık yalnız ince bir `next/dynamic` sarmalayıcı.
describe('<LottieSpinner>', () => {
  it('uses the compass Lottie animation as an accessible loading status', () => {
    render(<LottieSpinner label="Pano yükleniyor..." />);

    expect(screen.getByRole('status', { name: 'Pano yükleniyor...' })).toBeInTheDocument();
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-animation-name', 'newScene');
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-loop', 'true');
    expect(screen.getByTestId('lottie-player')).toHaveAttribute('data-autoplay', 'true');
  });

  it('can show the loading label next to the animation', () => {
    render(<LottieSpinner label="Aranıyor..." showLabel size="sm" />);

    expect(screen.getByText('Aranıyor...')).not.toHaveClass('sr-only');
    expect(screen.getByTestId('lottie-player')).toHaveClass('size-5');
  });
});
