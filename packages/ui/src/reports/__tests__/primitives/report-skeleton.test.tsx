import { describe, expect, it } from 'vitest';
import { ReportSkeleton } from '../../primitives/report-skeleton';
import { renderUi } from '../test-utils';

describe('ReportSkeleton', () => {
  it.each(['kpi', 'chart', 'table', 'timeline', 'banner'] as const)(
    'renders variant=%s',
    (variant) => {
      const { container } = renderUi(<ReportSkeleton variant={variant} />);
      expect(
        container.querySelector(`[data-slot="report-skeleton"][data-variant="${variant}"]`),
      ).not.toBeNull();
    },
  );

  it('table variant respects rows prop', () => {
    const { container } = renderUi(<ReportSkeleton variant="table" rows={3} />);
    const root = container.querySelector('[data-slot="report-skeleton"]');
    // 3 row + 1 header skeleton = 4 child skeletons (header + 3 rows)
    expect(root?.querySelectorAll('[data-slot="skeleton"]').length).toBe(4);
  });

  it('timeline variant respects rows prop', () => {
    const { container } = renderUi(<ReportSkeleton variant="timeline" rows={2} />);
    // Her satır 3 skeleton (avatar + 2 satır) = 6
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6);
  });
});
