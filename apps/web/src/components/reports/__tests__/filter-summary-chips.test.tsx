/**
 * Faz 13G (DEM-263) — FilterSummaryChips testleri.
 *
 * Filter shape'ten görsel pill listesinin doğru üretilmesi:
 * range (her zaman), members (varsa), labels (varsa + mode), card status
 * (varsa), comparison (etkinse).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReportFilters } from '@pusula/domain';
import { FilterSummaryChips } from '../shared/filter-summary-chips';

const BASE: ReportFilters = {
  range: { kind: 'preset', preset: 'last30d' },
};

describe('FilterSummaryChips', () => {
  it('range pill her zaman var (preset Son 30 gün)', () => {
    render(<FilterSummaryChips filters={BASE} />);
    expect(screen.getByText('Son 30 gün')).toBeInTheDocument();
  });

  it('members varsa "{count} üye" pill\'i', () => {
    render(
      <FilterSummaryChips
        filters={{
          ...BASE,
          members: { userIds: ['u1', 'u2', 'u3'], relations: ['assignee'] },
        }}
      />,
    );
    expect(screen.getByText('3 üye')).toBeInTheDocument();
  });

  it('labels varsa "{count} etiket ({mode})" pill\'i', () => {
    render(
      <FilterSummaryChips
        filters={{
          ...BASE,
          labels: { labelIds: ['l1', 'l2'], mode: 'and' },
        }}
      />,
    );
    expect(screen.getByText('2 etiket (Tümü)')).toBeInTheDocument();
  });

  it('card status varsa status etiketleri pill\'de', () => {
    render(
      <FilterSummaryChips
        filters={{
          ...BASE,
          scopeFilter: { cardStatus: ['open', 'completed'], includeArchivedLists: false },
        }}
      />,
    );
    expect(screen.getByText(/Açık \+ Tamamlanan/)).toBeInTheDocument();
  });

  it('comparison.enabled=true → "Karşılaştırma açık" pill\'i', () => {
    render(
      <FilterSummaryChips
        filters={BASE}
        comparison={{ enabled: true, mode: 'previousPeriod' }}
      />,
    );
    expect(screen.getByText('Karşılaştırma açık')).toBeInTheDocument();
  });

  it('comparison kapalı → "Karşılaştırma açık" pill\'i yok', () => {
    render(
      <FilterSummaryChips
        filters={BASE}
        comparison={{ enabled: false, mode: 'previousPeriod' }}
      />,
    );
    expect(screen.queryByText('Karşılaştırma açık')).toBeNull();
  });
});
