import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { CardActionsSheet } from '../card-detail/card-actions-sheet';
import { strings } from '../../lib/strings';

/**
 * Kart işlemleri sheet'i (DEM-196 + 2026-07-14 "başka panoya taşı") birim testi.
 * "Başka panoya taşı" ve "Arşivle" aksiyonlarının doğru callback'lere bağlı
 * olduğunu doğrular.
 */
function renderSheet(overrides: Partial<Parameters<typeof CardActionsSheet>[0]> = {}) {
  const props = {
    visible: true,
    onArchive: vi.fn(),
    onMoveToBoard: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<CardActionsSheet {...props} />);
  return props;
}

describe('CardActionsSheet', () => {
  it('taşı ve arşivle aksiyonlarını gösterir', () => {
    renderSheet();
    expect(screen.getByText(strings.cardDetail.moveToBoardAction)).toBeTruthy();
    expect(screen.getByText(strings.cardDetail.archiveAction)).toBeTruthy();
  });

  it('"Başka panoya taşı" basışı onMoveToBoard çağırır, arşivi tetiklemez', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(strings.cardDetail.moveToBoardAction));
    expect(props.onMoveToBoard).toHaveBeenCalledTimes(1);
    expect(props.onArchive).not.toHaveBeenCalled();
  });

  it('"Kartı arşivle" basışı onArchive çağırır', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(strings.cardDetail.archiveAction));
    expect(props.onArchive).toHaveBeenCalledTimes(1);
  });
});
