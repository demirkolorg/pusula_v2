import { describe, expect, it } from 'vitest';
import { Text } from '@/components/text';
import { render, screen } from './render-helper';
import { RemoteImage } from '../remote-image';

/** DEM-217 — `RemoteImage` (tembel görsel + spinner/placeholder) birim testleri. */

describe('RemoteImage', () => {
  it('uri yokken (URL beklenirken) spinner gösterir, görsel basılmaz', () => {
    render(<RemoteImage uri={undefined} accessibilityLabel="kapak" />);
    // AppSpinner `progressbar` rolüyle render edilir.
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByLabelText('kapak')).toBeNull();
  });

  it('uri verilince görseli erişilebilirlik etiketiyle render eder', () => {
    render(<RemoteImage uri="https://example.com/a.png" accessibilityLabel="kapak" />);
    // RNW `Image` `accessibilityLabel`'i `aria-label` olarak yansıtır.
    expect(screen.getByLabelText('kapak')).toBeTruthy();
  });

  it('placeholder verilince spinner yerine onu gösterir', () => {
    render(
      <RemoteImage uri={undefined} placeholder={<Text>YEDEK</Text>} accessibilityLabel="kapak" />,
    );
    expect(screen.getByText('YEDEK')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
