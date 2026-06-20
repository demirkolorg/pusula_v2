import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from './render-helper';
import { DescriptionChecklistTabs } from '../card-detail/description-checklist-tabs';

/**
 * 2026-06-20 — `DescriptionChecklistTabs` sekme yapısı KALDIRILDI. Önceki
 * segmented control ([Tümü] [Açıklama] [Yapılacaklar]) çıkarıldı; her iki içerik
 * (Açıklama + Yapılacaklar) artık her zaman birlikte görünür — tablet'te yan-yana,
 * phone'da alt-alta. Alt bileşenler (`DescriptionEditor`, `ChecklistSection`)
 * tRPC + state bağımlılığı taşıdığından bu testte mock'lanır.
 */

const useIsTabletMock = vi.fn<() => boolean>();
vi.mock('@/lib/use-device-class', () => ({
  useIsTablet: () => useIsTabletMock(),
}));

vi.mock('@/components/card-detail/description-editor', () => ({
  DescriptionEditor: () => <div data-testid="description-editor">DESCRIPTION</div>,
}));

vi.mock('@/components/card-detail/checklist-section', () => ({
  ChecklistSection: () => <div data-testid="checklist-section">CHECKLIST</div>,
}));

const baseProps = {
  cardId: 'card-1',
  description: null,
  canEdit: true,
  checklists: [],
  checklistsError: false,
};

beforeEach(() => {
  useIsTabletMock.mockReset();
  useIsTabletMock.mockReturnValue(false);
});

describe('DescriptionChecklistTabs — sekmesiz (2026-06-20)', () => {
  it('sekme butonları yok — Tümü/Açıklama/Kontrol listeleri etiketleri görünmez', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.queryByText('Tümü')).toBeNull();
    expect(screen.queryByText('Açıklama')).toBeNull();
    expect(screen.queryByText('Kontrol listeleri')).toBeNull();
  });

  it("phone'da her iki içerik birlikte (alt-alta) render edilir", () => {
    useIsTabletMock.mockReturnValue(false);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.getByTestId('checklist-section')).toBeTruthy();
  });

  it("tablet'te her iki içerik birlikte (yan-yana) render edilir", () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.getByTestId('checklist-section')).toBeTruthy();
  });

  it('checklistsError → ChecklistSection yerine hata mesajı, DescriptionEditor korunur', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} checklistsError={true} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.getByText('Bu bölüm yüklenemedi.')).toBeTruthy();
    expect(screen.queryByTestId('checklist-section')).toBeNull();
  });
});
