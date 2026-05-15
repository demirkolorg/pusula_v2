/**
 * Faz 9E (DEM-131) — `ShareErrorView` RTL testleri.
 * 404 + 410 × 4 sebep (revoked / expired / cardArchived / cardDeleted) için
 * doğru Türkçe başlığın render edildiğini doğrular.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { ShareErrorView } from './share-error-view';

describe('<ShareErrorView>', () => {
  it('404 → "Bağlantı bulunamadı" başlığı render eder', () => {
    render(<ShareErrorView status={404} reason={null} />);
    expect(screen.getByText(strings.share.error.titleNotFound)).toBeInTheDocument();
    expect(screen.getByText(strings.share.error.description)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: strings.share.error.backHome }),
    ).toHaveAttribute('href', '/');
  });

  it.each([
    ['revoked', 'titleRevoked'],
    ['expired', 'titleExpired'],
    ['cardArchived', 'titleCardArchived'],
    ['cardDeleted', 'titleCardDeleted'],
  ] as const)('410 reason=%s → ilgili Türkçe başlık', (reason, key) => {
    render(<ShareErrorView status={410} reason={reason} />);
    expect(
      screen.getByText(strings.share.error[key]),
    ).toBeInTheDocument();
  });

  it('410 reason=null → generic başlık', () => {
    render(<ShareErrorView status={410} reason={null} />);
    expect(screen.getByText(strings.share.error.titleGeneric)).toBeInTheDocument();
  });
});
