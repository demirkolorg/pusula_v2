import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { fireEvent, render, screen } from './render-helper';
import { strings } from '../../lib/strings';

/**
 * Faz 15D (DEM-304) — `Sheet` bileşen birim testleri.
 *
 * Davranış:
 *  - Phone (`useIsTablet()` false): bottom slide layout (mevcut Faz 7H pattern).
 *  - Tablet (`useIsTablet()` true): center fade popover (`docs/architecture/18-ipad-uyarlamasi.md` §5).
 *  - Her iki modda da backdrop tap-outside-to-close ve close button çalışır.
 *
 * `useIsTablet` mock'lanır — `useWindowDimensions` testte deterministik değil;
 * `use-device-class.test.tsx` kendi sınırlarını test eder.
 */

const isTabletMock = vi.fn<() => boolean>();

vi.mock('@/lib/use-device-class', () => ({
  useIsTablet: () => isTabletMock(),
}));

const { Sheet } = await import('../sheet');

beforeEach(() => {
  isTabletMock.mockReset();
});

const TITLE = 'Liste işlemleri';

describe('Sheet — phone', () => {
  beforeEach(() => {
    isTabletMock.mockReturnValue(false);
  });

  it('visible=true: başlık ve children render eder', () => {
    render(
      <Sheet visible title={TITLE} onClose={vi.fn()}>
        <Text>İÇERİK</Text>
      </Sheet>,
    );
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText('İÇERİK')).toBeTruthy();
  });

  it('visible=false: başlık render edilmez (Modal kapalı)', () => {
    render(
      <Sheet visible={false} title={TITLE} onClose={vi.fn()}>
        <Text>İÇERİK</Text>
      </Sheet>,
    );
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByText('İÇERİK')).toBeNull();
  });

  it('close button tap: onClose çağrılır', () => {
    const onClose = vi.fn();
    render(
      <Sheet visible title={TITLE} onClose={onClose}>
        <Text>İÇERİK</Text>
      </Sheet>,
    );
    fireEvent.click(screen.getByLabelText(strings.common.close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet — tablet', () => {
  beforeEach(() => {
    isTabletMock.mockReturnValue(true);
  });

  it('visible=true: başlık ve children render eder (popover modu)', () => {
    render(
      <Sheet visible title={TITLE} onClose={vi.fn()}>
        <Text>İÇERİK</Text>
      </Sheet>,
    );
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText('İÇERİK')).toBeTruthy();
  });

  it('close button tap: tablet modunda da onClose çağrılır', () => {
    const onClose = vi.fn();
    render(
      <Sheet visible title={TITLE} onClose={onClose}>
        <Text>İÇERİK</Text>
      </Sheet>,
    );
    fireEvent.click(screen.getByLabelText(strings.common.close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
