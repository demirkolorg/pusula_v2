/**
 * Faz 13H (DEM-264) — workspace `/reports` merkez sayfası.
 *
 * 3 sekme: Kaydedilmiş / Zamanlanmış / Son Render'lar.
 * URL: `/workspaces/[id]/reports?tab=saved|scheduled|renders` — tab değişimi
 * shallow router push (server-fetch tekrar yok). Default `saved`.
 *
 * "Yeni Rapor" CTA workspace scope ile 13G composer'ı açar (kullanıcı kararı
 * 2026-05-24: V1 Seçenek A — diğer scope için kullanıcı ilgili entity'ye
 * gider; composer'a scope picker eklenmedi).
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.3.
 */
'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon, BarChart3Icon, PlusIcon } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger } from '@pusula/ui';
import { useQuery } from '@tanstack/react-query';
import { ReportComposerDialog } from '@/components/reports/composer/report-composer-dialog';
import { useReportI18n } from '@/components/reports/hooks/use-report-i18n';
import { RecentRendersTab } from '@/components/reports/list/recent-renders-tab';
import { SavedReportsTab } from '@/components/reports/list/saved-reports-tab';
import { ScheduledReportsTab } from '@/components/reports/list/scheduled-reports-tab';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type TabKey = 'saved' | 'scheduled' | 'renders';
const TAB_KEYS: ReadonlyArray<TabKey> = ['saved', 'scheduled', 'renders'];

function parseTab(raw: string | null): TabKey {
  if (raw && (TAB_KEYS as ReadonlyArray<string>).includes(raw)) return raw as TabKey;
  return 'saved';
}

export default function WorkspaceReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workspaceId } = use(params);
  const { t } = useReportI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));
  const [composerOpen, setComposerOpen] = useState(false);

  const trpc = useTRPC();
  const workspaceQuery = useQuery({
    ...trpc.workspace.get.queryOptions({ workspaceId }),
    staleTime: 60_000,
  });
  const workspaceRole = workspaceQuery.data?.role ?? null;

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'saved') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(`/workspaces/${workspaceId}/reports${query ? `?${query}` : ''}`, {
      scroll: false,
    });
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}`}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ArrowLeftIcon className="size-3.5" />
        {strings.workspace.manage.backToList}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BarChart3Icon className="mt-0.5 size-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('reports.list.pageTitle')}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              {t('reports.list.pageDescription')}
            </p>
          </div>
        </div>
        {workspaceRole && workspaceRole !== 'guest' && (
          <Button onClick={() => setComposerOpen(true)} data-testid="reports-new-button">
            <PlusIcon className="size-4" />
            {t('reports.list.newReport')}
          </Button>
        )}
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* A11y M3 (review): TabsList için aria-label — sayfada birden
            fazla bölge var, SR'a "Rapor sekmeleri" duyurusu disambiguate. */}
        <TabsList aria-label={t('reports.list.tabsAriaLabel')}>
          <TabsTrigger value="saved" data-testid="reports-tab-saved">
            {t('reports.list.tabs.saved')}
          </TabsTrigger>
          <TabsTrigger value="scheduled" data-testid="reports-tab-scheduled">
            {t('reports.list.tabs.scheduled')}
          </TabsTrigger>
          <TabsTrigger value="renders" data-testid="reports-tab-renders">
            {t('reports.list.tabs.renders')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0" data-testid={`reports-tab-content-${activeTab}`}>
        {activeTab === 'saved' && (
          <SavedReportsTab workspaceId={workspaceId} onNewReport={() => setComposerOpen(true)} />
        )}
        {activeTab === 'scheduled' && (
          <ScheduledReportsTab workspaceId={workspaceId} onNewReport={() => setComposerOpen(true)} />
        )}
        {activeTab === 'renders' && (
          <RecentRendersTab workspaceId={workspaceId} onNewReport={() => setComposerOpen(true)} />
        )}
      </div>

      {composerOpen && (
        <ReportComposerDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          scope={{ kind: 'workspace', workspaceId }}
        />
      )}
    </div>
  );
}
