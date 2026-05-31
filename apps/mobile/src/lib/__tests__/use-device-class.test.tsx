import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { TABLET_BREAKPOINT_PX, useDeviceClass, useIsTablet } from '@/lib/use-device-class';

/**
 * Faz 15A (DEM-301) — `useDeviceClass`/`useIsTablet` birim testleri.
 *
 * Eşik kararı `13-ui-tasarim-dili.md` §13.12.1: tek breakpoint = 768px
 * (NativeWind `md:` standart Tailwind). iPad mini 8.3" (768×1024) dahil
 * tablet branch'i alır. `useWindowDimensions` mock'lanır — gerçek RN
 * pencere ölçümü test ortamında deterministik değil. Hook yalnızca
 * `useWindowDimensions`'a bağımlı, mock'ta diğer RN export'larını
 * yeniden ihraç etmeye gerek yok.
 */

const useWindowDimensionsMock = vi.fn<() => { width: number; height: number }>();

vi.mock('react-native', () => ({
  useWindowDimensions: () => useWindowDimensionsMock(),
}));

beforeEach(() => {
  useWindowDimensionsMock.mockReset();
});

describe('useDeviceClass', () => {
  it('eşik altı (767px) phone döndürür', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 767, height: 1024 });
    const { result } = renderHook(() => useDeviceClass());
    expect(result.current).toBe('phone');
  });

  it('tam eşik (768px) tablet döndürür (iPad mini portrait sınırı)', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 768, height: 1024 });
    const { result } = renderHook(() => useDeviceClass());
    expect(result.current).toBe('tablet');
  });

  it('iPad standart (1024px) tablet döndürür', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useDeviceClass());
    expect(result.current).toBe('tablet');
  });

  it('iPad Pro 12.9" landscape (2048px) tablet döndürür', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 2048, height: 2732 });
    const { result } = renderHook(() => useDeviceClass());
    expect(result.current).toBe('tablet');
  });

  it('breakpoint sabiti 768 olarak export edilir', () => {
    expect(TABLET_BREAKPOINT_PX).toBe(768);
  });
});

describe('useIsTablet', () => {
  it('phone width (375px iPhone) için false döndürür', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 375, height: 667 });
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);
  });

  it('tablet width (1024px iPad) için true döndürür', () => {
    useWindowDimensionsMock.mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });
});
