/**
 * Faz 13H (DEM-264) — ScheduleRow + cadence label testleri.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// Mock'ların hoisted olması için import'tan ÖNCE. tRPC client + permission
// hook mock'lanır (useQuery'ye gerçek workspace.get çağrılmasını engelle).
vi.mock('@/trpc/client', () => {
  const procWithFilter = (key: string) => ({
    queryOptions: () => ({ queryKey: [key], queryFn: async () => null }),
    queryFilter: () => ({ queryKey: [key] }),
    mutationOptions: (o: unknown) => o,
  });
  return {
    useTRPC: () => ({
      workspace: { get: procWithFilter('workspace.get') },
      board: { get: procWithFilter('board.get') },
      report: {
        listSaved: procWithFilter('report.listSaved'),
        listRenders: procWithFilter('report.listRenders'),
        schedule: {
          update: procWithFilter('schedule.update'),
          delete: procWithFilter('schedule.delete'),
          runNow: procWithFilter('schedule.runNow'),
          listByWorkspace: procWithFilter('schedule.listByWorkspace'),
        },
      },
    }),
  };
});

vi.mock('@pusula/ui', async (importOriginal) => {
  const mod: Record<string, unknown> = await importOriginal();
  return {
    ...mod,
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

import { ScheduleRow, type ScheduleRowData } from '../list/schedule-row';

function makeRow(overrides: {
  cadence?: 'daily' | 'weekly' | 'monthly';
  isActive?: boolean;
  recipientUserIds?: string[];
  recipientEmails?: string[];
} = {}): ScheduleRowData {
  const cadence = overrides.cadence ?? 'weekly';
  return {
    schedule: {
      id: 'sch-1',
      savedReportId: 's-1',
      cadence,
      cadenceConfig:
        cadence === 'daily'
          ? { cadence: 'daily', hour: 9, minute: 0 }
          : cadence === 'weekly'
            ? { cadence: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 }
            : { cadence: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
      recipientUserIds: overrides.recipientUserIds ?? ['u-1', 'u-2'],
      recipientEmails: overrides.recipientEmails ?? ['ext@example.com'],
      isActive: overrides.isActive ?? true,
      lastRunAt: new Date('2026-05-22T09:00:00Z'),
      nextRunAt: new Date('2026-05-29T09:00:00Z'),
    },
    savedReport: {
      id: 's-1',
      workspaceId: 'ws-1',
      scopeKind: 'board',
      title: 'Sprint Sağlık',
    },
  };
}

function renderRow(data: ScheduleRowData) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ul>
        <ScheduleRow workspaceId="ws-1" data={data} />
      </ul>
    </QueryClientProvider>,
  );
}

describe('ScheduleRow', () => {
  it('weekly cadence → "Haftalık · Pazartesi 09:00" label', () => {
    renderRow(makeRow({ cadence: 'weekly' }));
    expect(screen.getByText(/Haftalık · Pazartesi 09:00/)).toBeInTheDocument();
  });

  it('daily cadence → "Günlük · 09:00" label', () => {
    renderRow(makeRow({ cadence: 'daily' }));
    expect(screen.getByText(/Günlük · 09:00/)).toBeInTheDocument();
  });

  it('monthly cadence → "Aylık · 15. gün 09:00" label', () => {
    renderRow(makeRow({ cadence: 'monthly' }));
    expect(screen.getByText(/Aylık · 15\. gün 09:00/)).toBeInTheDocument();
  });

  it('alıcı sayımı: 2 user + 1 email = 3 alıcı', () => {
    renderRow(makeRow());
    expect(screen.getByText('3 alıcı')).toBeInTheDocument();
  });

  it('saved başlığı link olarak görünür', () => {
    renderRow(makeRow());
    const link = screen.getByTestId('schedule-row-link');
    expect(link).toHaveAttribute('href', '/workspaces/ws-1/reports/s-1');
  });
});
