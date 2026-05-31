import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { render, screen } from './render-helper';

/**
 * Faz 15C (DEM-303) — `MasterDetailLayout` primitive birim testleri.
 *
 * Davranış:
 *  - Tablet (>=768): hem `master` hem `detail` yan yana render; sidebar sabit
 *    genişlik (`sidebarWidth`, default 320), main `flex-1`. `selectedDetail`
 *    yok sayılır.
 *  - Phone (<768): tek view. `selectedDetail` truthy ise `detail`, aksi halde
 *    `fallback` (default `'master'`) tarafı render edilir.
 *
 * `useIsTablet` mock'lanır — `useWindowDimensions`'a gerçek bağımlılık testte
 * deterministik değil; primitive'in karar mantığını izole etmek için tek
 * bir flag'e indirgenir (use-device-class.test.tsx kendi sınırlarını test eder).
 */

const isTabletMock = vi.fn<() => boolean>();

vi.mock('@/lib/use-device-class', () => ({
  useIsTablet: () => isTabletMock(),
}));

const { MasterDetailLayout } = await import('../master-detail-layout');

const Master = () => <Text>MASTER</Text>;
const Detail = () => <Text>DETAIL</Text>;

beforeEach(() => {
  isTabletMock.mockReset();
});

describe('MasterDetailLayout — phone', () => {
  beforeEach(() => {
    isTabletMock.mockReturnValue(false);
  });

  it('default `fallback="master"` + selectedDetail yok: master render, detail render edilmez', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} />);
    expect(screen.queryByText('MASTER')).toBeTruthy();
    expect(screen.queryByText('DETAIL')).toBeNull();
  });

  it('selectedDetail=true: detail render, master render edilmez', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} selectedDetail />);
    expect(screen.queryByText('DETAIL')).toBeTruthy();
    expect(screen.queryByText('MASTER')).toBeNull();
  });

  it('fallback="detail" + selectedDetail yok: detail render (master gizli)', () => {
    render(
      <MasterDetailLayout master={<Master />} detail={<Detail />} fallback="detail" />,
    );
    expect(screen.queryByText('DETAIL')).toBeTruthy();
    expect(screen.queryByText('MASTER')).toBeNull();
  });

  it('phone branch sidebar slot çizmez (testID alt slot mevcut değil)', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} testID="layout" />);
    expect(screen.queryByTestId('layout-master')).toBeNull();
    expect(screen.queryByTestId('layout-detail')).toBeNull();
    expect(screen.getByTestId('layout')).toBeTruthy();
  });
});

describe('MasterDetailLayout — tablet', () => {
  beforeEach(() => {
    isTabletMock.mockReturnValue(true);
  });

  it('hem master hem detail render eder (yan yana)', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} />);
    expect(screen.queryByText('MASTER')).toBeTruthy();
    expect(screen.queryByText('DETAIL')).toBeTruthy();
  });

  it('selectedDetail tablet davranışını değiştirmez (ikisi de görünür)', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} selectedDetail />);
    expect(screen.queryByText('MASTER')).toBeTruthy();
    expect(screen.queryByText('DETAIL')).toBeTruthy();
  });

  it('sidebarWidth varsayılan 320 — master slot stilinde width 320', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} testID="layout" />);
    const masterSlot = screen.getByTestId('layout-master') as HTMLElement;
    expect(masterSlot.style.width).toBe('320px');
  });

  it('sidebarWidth=384 — master slot stilinde width 384 (landscape geniş aralık)', () => {
    render(
      <MasterDetailLayout
        master={<Master />}
        detail={<Detail />}
        sidebarWidth={384}
        testID="layout"
      />,
    );
    const masterSlot = screen.getByTestId('layout-master') as HTMLElement;
    expect(masterSlot.style.width).toBe('384px');
  });

  it('detail slot testID alt eki ile erişilebilir (main pane render edilir)', () => {
    render(<MasterDetailLayout master={<Master />} detail={<Detail />} testID="layout" />);
    expect(screen.getByTestId('layout-detail')).toBeTruthy();
  });
});
