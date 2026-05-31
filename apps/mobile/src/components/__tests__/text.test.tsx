import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from './render-helper';
import { Text } from '../text';

/**
 * Faz 7N — `Text` (Poppins ağırlık eşleyici) bileşen birim testleri.
 * Faz 15E (DEM-305) — `tabletScale` tablet auto-scale + opt-out senaryoları.
 */

// `useIsTablet` mock'u — react-native `useWindowDimensions` testte deterministik
// değil; hook'un kendisini mock'layıp döndürdüğü değeri her senaryoda kontrol
// ederiz. Spread (`...actual`) yok — modülde başka export yok ve Text yalnız
// `useIsTablet`'i tüketiyor.
const useIsTabletMock = vi.fn<() => boolean>();
vi.mock('@/lib/use-device-class', () => ({
  useIsTablet: () => useIsTabletMock(),
}));

beforeEach(() => {
  useIsTabletMock.mockReset();
  useIsTabletMock.mockReturnValue(false);
});

describe('Text — temel davranış', () => {
  it('çocuk metni render eder', () => {
    render(<Text>Merhaba</Text>);
    expect(screen.getByText('Merhaba')).toBeTruthy();
  });

  it('weight verilmezse Poppins_400Regular ailesi uygulanır', () => {
    render(<Text>Varsayılan</Text>);
    expect(screen.getByText('Varsayılan').getAttribute('style')).toContain('Poppins_400Regular');
  });

  it('weight=semibold ile Poppins_600SemiBold ailesi uygulanır', () => {
    render(<Text weight="semibold">Kalınca</Text>);
    expect(screen.getByText('Kalınca').getAttribute('style')).toContain('Poppins_600SemiBold');
  });

  it('weight=bold ile Poppins_700Bold ailesi uygulanır', () => {
    render(<Text weight="bold">Kalın</Text>);
    expect(screen.getByText('Kalın').getAttribute('style')).toContain('Poppins_700Bold');
  });
});

describe('Text — Faz 15E tablet typography scale', () => {
  it('phone (isTablet=false) → fontSize değişmez', () => {
    useIsTabletMock.mockReturnValue(false);
    render(<Text style={{ fontSize: 16 }}>Telefon</Text>);
    const styleAttr = screen.getByText('Telefon').getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/font-size:\s*16px/);
    expect(styleAttr).not.toMatch(/font-size:\s*18px/);
  });

  it('tablet (isTablet=true) + fontSize=16 → 18 (1.125× auto-apply)', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<Text style={{ fontSize: 16 }}>Tablet</Text>);
    const styleAttr = screen.getByText('Tablet').getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/font-size:\s*18px/);
  });

  it('tablet + tabletScale={1.0} → opt-out, fontSize değişmez', () => {
    useIsTabletMock.mockReturnValue(true);
    render(
      <Text style={{ fontSize: 14 }} tabletScale={1.0}>
        MetaChip
      </Text>,
    );
    const styleAttr = screen.getByText('MetaChip').getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/font-size:\s*14px/);
    expect(styleAttr).not.toMatch(/font-size:\s*15\.75px/);
  });

  it('tablet + sayısal fontSize YOK → scale uygulanmaz (RN default korunur)', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<Text>NoSize</Text>);
    const styleAttr = screen.getByText('NoSize').getAttribute('style') ?? '';
    // fontFamily uygulanır, fontSize kuralı satıra hiç girmez
    expect(styleAttr).toContain('Poppins_400Regular');
    expect(styleAttr).not.toMatch(/font-size:/);
  });

  it('tablet + custom tabletScale=1.25 + fontSize=20 → 25', () => {
    useIsTabletMock.mockReturnValue(true);
    render(
      <Text style={{ fontSize: 20 }} tabletScale={1.25}>
        Custom
      </Text>,
    );
    const styleAttr = screen.getByText('Custom').getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/font-size:\s*25px/);
  });

  it('tablet + style dizisi (nested) → flatten içindeki fontSize bulunup ölçeklenir', () => {
    useIsTabletMock.mockReturnValue(true);
    render(
      <Text style={[{ color: 'red' }, { fontSize: 16 }]}>Array</Text>,
    );
    const styleAttr = screen.getByText('Array').getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/font-size:\s*18px/);
  });
});
