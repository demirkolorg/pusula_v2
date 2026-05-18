import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { AppSpinner } from '../app-spinner';

/** Faz 7 — `AppSpinner` (compass Lottie yükleniyor göstergesi) bileşen testleri. */

describe('AppSpinner', () => {
  it('erişilebilir bir progressbar olarak render edilir', () => {
    render(<AppSpinner label="Pano yükleniyor…" />);
    expect(screen.getByRole('progressbar', { name: 'Pano yükleniyor…' })).toBeTruthy();
  });

  it('varsayılan olarak yalnız ikon — etiket metni gizli', () => {
    render(<AppSpinner label="Yükleniyor…" />);
    expect(screen.queryByText('Yükleniyor…')).toBeNull();
  });

  it('showLabel ile etiketi görünür metin olarak gösterir', () => {
    render(<AppSpinner label="Aranıyor…" showLabel />);
    expect(screen.getByText('Aranıyor…')).toBeTruthy();
  });
});
