import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { DescriptionChecklistTabs } from '../card-detail/description-checklist-tabs';

/**
 * Faz 15C.9 (2026-05-31 2. tur) — iPad'de `DescriptionChecklistTabs` 3 sekme
 * + default `'both'` (yan-yana açıklama+kontrol) davranış testleri.
 *
 * Phone (mevcut davranış) — 2 sekme + `description` default — değişmedi.
 * Web kart modali paritesi → `docs/architecture/18-ipad-uyarlamasi.md` §4.3.
 *
 * Alt bileşenler (`DescriptionEditor`, `ChecklistSection`) tRPC + state
 * bağımlılığı taşıdığı için bu testte mock'lanır — burada yalnız sekme
 * seçim + tablet/phone branch davranışı doğrulanır.
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
  checklistItemsDone: 0,
  checklistItemsTotal: 0,
};

beforeEach(() => {
  useIsTabletMock.mockReset();
  useIsTabletMock.mockReturnValue(false);
});

describe('DescriptionChecklistTabs — phone (mevcut davranış değişmedi)', () => {
  it('phone\'da yalnız [Açıklama] ve [Yapılacaklar] sekmeleri görünür — `Tümü` yok', () => {
    useIsTabletMock.mockReturnValue(false);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByText('Açıklama')).toBeTruthy();
    expect(screen.getByText('Kontrol listeleri')).toBeTruthy();
    expect(screen.queryByText('Tümü')).toBeNull();
  });

  it('phone default sekmesi `description` → DescriptionEditor render edilir', () => {
    useIsTabletMock.mockReturnValue(false);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.queryByTestId('checklist-section')).toBeNull();
  });

  it('phone\'da Kontrol listeleri sekmesine geçince ChecklistSection görünür', () => {
    useIsTabletMock.mockReturnValue(false);
    render(<DescriptionChecklistTabs {...baseProps} />);
    fireEvent.click(screen.getByText('Kontrol listeleri'));
    expect(screen.getByTestId('checklist-section')).toBeTruthy();
    expect(screen.queryByTestId('description-editor')).toBeNull();
  });
});

describe('DescriptionChecklistTabs — tablet (Faz 15C.9)', () => {
  it('tablet\'te [Tümü] [Açıklama] [Yapılacaklar] üç sekme görünür', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByText('Tümü')).toBeTruthy();
    expect(screen.getByText('Açıklama')).toBeTruthy();
    expect(screen.getByText('Kontrol listeleri')).toBeTruthy();
  });

  it('tablet default sekmesi `both` → DescriptionEditor + ChecklistSection birlikte render edilir', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.getByTestId('checklist-section')).toBeTruthy();
  });

  it('tablet\'te Açıklama sekmesine geçince yalnız DescriptionEditor render edilir', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    fireEvent.click(screen.getByText('Açıklama'));
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.queryByTestId('checklist-section')).toBeNull();
  });

  it('tablet\'te Kontrol listeleri sekmesine geçince yalnız ChecklistSection render edilir', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} />);
    fireEvent.click(screen.getByText('Kontrol listeleri'));
    expect(screen.getByTestId('checklist-section')).toBeTruthy();
    expect(screen.queryByTestId('description-editor')).toBeNull();
  });

  it('tablet\'te checklistsError → `both` modunda sağ kolonda hata mesajı, sol açıklama editör korunur', () => {
    useIsTabletMock.mockReturnValue(true);
    render(<DescriptionChecklistTabs {...baseProps} checklistsError={true} />);
    expect(screen.getByTestId('description-editor')).toBeTruthy();
    expect(screen.getByText('Bu bölüm yüklenemedi.')).toBeTruthy();
    expect(screen.queryByTestId('checklist-section')).toBeNull();
  });
});
