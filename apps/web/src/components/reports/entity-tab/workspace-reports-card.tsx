/**
 * Faz 13G (DEM-263) — workspace settings sayfasına "Raporlar" kartı.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.4.
 * Kullanıcı kararı (2026-05-24): workspace settings sayfasında sidebar
 * nav yok; mevcut card-based section listesine (`page.tsx`) yeni
 * `<Card>` ekleniyor. Click → `/workspaces/[id]/reports` (13H route)
 * — 13H henüz Done değilse 404; bu fazda sadece UI affordance hazır.
 *
 * Permission gating: workspace üyesi (member+) — guest gizli.
 */
'use client';

import Link from 'next/link';
import { BarChart3Icon, ArrowRightIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { useReportI18n } from '../hooks/use-report-i18n';

export interface WorkspaceReportsCardProps {
  workspaceId: string;
  /**
   * Workspace üyelik rolü (page.tsx'ten gelir). `null`/`'guest'` ise
   * card gizlenir — guest workspace raporlarına erişemez (§9.5).
   */
  workspaceRole: string | null;
}

export function WorkspaceReportsCard({ workspaceId, workspaceRole }: WorkspaceReportsCardProps) {
  const { t } = useReportI18n();

  // Guest veya üye değil → kart gizli (UI affordance kuralına uygun).
  if (!workspaceRole || workspaceRole === 'guest') return null;

  return (
    <Card data-testid="workspace-reports-card">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
          <BarChart3Icon className="size-4" />
          {t('reports.entity.workspace.cardTitle')}
        </CardTitle>
        <CardDescription>{t('reports.entity.workspace.cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={`/workspaces/${workspaceId}/reports`}
          className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('reports.entity.workspace.openCta')}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
