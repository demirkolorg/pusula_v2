import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CssSpinner } from './css-spinner';

// `CssSpinner` — `lottie-react` içermeyen hafif yükleme göstergesi. Board kart
// kapağı gibi sıcak yollarda ve `AppSpinner`'ın `next/dynamic` fallback'inde
// kullanılır (DEM-229 #5).
describe('<CssSpinner>', () => {
  it('renders an accessible loading status with a visually hidden label by default', () => {
    render(<CssSpinner label="Pano yükleniyor..." />);

    const status = screen.getByRole('status', { name: 'Pano yükleniyor...' });
    expect(status).toBeInTheDocument();
    expect(screen.getByText('Pano yükleniyor...')).toHaveClass('sr-only');
  });

  it('can show the loading label and applies the requested size class', () => {
    render(<CssSpinner label="Aranıyor..." showLabel size="sm" />);

    expect(screen.getByText('Aranıyor...')).not.toHaveClass('sr-only');
    // `sm` boyutu `size-5` çemberi üretir.
    const status = screen.getByRole('status', { name: 'Aranıyor...' });
    expect(status.querySelector('span[aria-hidden="true"]')).toHaveClass('size-5');
  });
});
