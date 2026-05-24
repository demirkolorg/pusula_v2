/**
 * Faz 13H (DEM-264) — RenderRow testleri.
 *
 * Status rozetleri (5 durum) + saved link + ad-hoc fallback. Download
 * butonu yalnız completed durumda görünür.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/trpc/client', () => {
  const procWithFilter = (key: string) => ({
    queryOptions: () => ({ queryKey: [key], queryFn: async () => null }),
    queryFilter: () => ({ queryKey: [key] }),
    mutationOptions: (o: unknown) => o,
  });
  return {
    useTRPC: () => ({
      report: {
        getRender: procWithFilter('report.getRender'),
        listRenders: procWithFilter('report.listRenders'),
      },
    }),
  };
});

import { RenderRow, type RenderRowData } from '../list/render-row';

function makeRender(overrides: Partial<RenderRowData> = {}): RenderRowData {
  return {
    id: 'r-1',
    workspaceId: 'ws-1',
    savedReportId: 's-1',
    presetId: 'board.health',
    status: 'completed',
    format: 'pdf',
    triggerKind: 'manual',
    triggeredBy: 'u-1',
    errorMessage: null,
    createdAt: new Date('2026-05-24T10:00:00Z'),
    completedAt: new Date('2026-05-24T10:00:30Z'),
    ...overrides,
  };
}

function renderRow(data: RenderRowData) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ul>
        <RenderRow workspaceId="ws-1" render={data} />
      </ul>
    </QueryClientProvider>,
  );
}

describe('RenderRow', () => {
  it('completed status → indir butonu görünür', () => {
    renderRow(makeRender({ status: 'completed' }));
    expect(screen.getByTestId('render-row-download')).toBeInTheDocument();
  });

  it('queued status → indir butonu yok, status rozetinde "Kuyrukta"', () => {
    renderRow(makeRender({ status: 'queued' }));
    expect(screen.queryByTestId('render-row-download')).toBeNull();
    expect(screen.getByTestId('render-row-status-queued')).toHaveTextContent('Kuyrukta');
  });

  it('rendering status → spinner ikonu + "Render ediliyor"', () => {
    renderRow(makeRender({ status: 'rendering' }));
    expect(screen.getByTestId('render-row-status-rendering')).toHaveTextContent('Render ediliyor');
  });

  it('failed status → kırmızı rozet + failedHint label', () => {
    renderRow(
      makeRender({
        status: 'failed',
        errorMessage: 'reports.errors.pdf_render_failed',
      }),
    );
    expect(screen.getByTestId('render-row-status-failed')).toBeInTheDocument();
    expect(screen.getByTestId('render-row-failed-label')).toBeInTheDocument();
  });

  it('expired status → süresi doldu rozeti', () => {
    renderRow(makeRender({ status: 'expired' }));
    expect(screen.getByTestId('render-row-status-expired')).toHaveTextContent('Süresi doldu');
  });

  it('savedReportId null → "Ad-hoc render" gösterir, link yok', () => {
    renderRow(makeRender({ savedReportId: null }));
    expect(screen.getByText('Ad-hoc render')).toBeInTheDocument();
    expect(screen.queryByTestId('render-row-link')).toBeNull();
  });

  it('savedReportId set → preset başlığı link olarak görünür', () => {
    renderRow(makeRender({ savedReportId: 's-1', presetId: 'board.health' }));
    const link = screen.getByTestId('render-row-link');
    expect(link).toHaveAttribute('href', '/workspaces/ws-1/reports/s-1');
  });
});
