/**
 * Faz 13G (DEM-263) — useReportI18n hook'u testleri.
 *
 * `strings.reports.*` lookup + `{placeholder}` interpolation + missing key
 * fallback davranışını doğrular.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReportI18n } from '../hooks/use-report-i18n';

describe('useReportI18n', () => {
  it('dot-notation key strings.reports.* yolu çözer', () => {
    const { result } = renderHook(() => useReportI18n());
    expect(result.current.t('reports.composer.title.create')).toBe('Yeni Rapor Oluştur');
  });

  it('eksik key → key kendi adıyla döner (debug görünür kalsın)', () => {
    const { result } = renderHook(() => useReportI18n());
    expect(result.current.t('reports.nope.does.not.exist')).toBe(
      'reports.nope.does.not.exist',
    );
  });

  it('{placeholder} params ile interpolation yapar', () => {
    const { result } = renderHook(() => useReportI18n());
    expect(
      result.current.t('reports.composer.preset.includesCount', { count: 5 }),
    ).toBe('5 micro-report');
  });

  it('params eksikse template raw döner (placeholder hâlâ string olarak görünür)', () => {
    const { result } = renderHook(() => useReportI18n());
    // Template `{count} micro-report`; params undefined → interpolate
    // atlanır, template raw kalır (debug için kullanışlı).
    expect(
      result.current.t('reports.composer.preset.includesCount'),
    ).toBe('{count} micro-report');
  });

  it('locale tr-TR sabit (13Q öncesi)', () => {
    const { result } = renderHook(() => useReportI18n());
    expect(result.current.locale).toBe('tr-TR');
  });

  it('null/undefined placeholder değerleri boş string olarak basar (PII guard)', () => {
    const { result } = renderHook(() => useReportI18n());
    // `{from}` ve `{to}` undefined → boş string'le yer alır.
    expect(
      result.current.t('reports.composer.range.customSummary', { from: '01/01', to: undefined }),
    ).toBe('01/01 → ');
  });
});
