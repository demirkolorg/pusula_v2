/**
 * Faz 13L (DEM-268) — chart-level widget print sayfası. Worker'ın
 * `renderWidget` adımında Puppeteer açılışı için:
 *
 *   /reports/print/[id]/widget/[microReportId]?token=<jwt>&format=<png|svg>
 *
 * `(internal)` route grubu altında public route (auth middleware yok);
 * `report.print.verifyToken` server-side fetch ile dataset envelope alır.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/env';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { WidgetPrintClient } from './_components/widget-print-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Pusula Widget — PNG/SVG Önizleme',
  robots: { index: false, follow: false },
};

function encodeTrpcInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify({ json: input }));
}

const TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RENDER_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;
const MICRO_REPORT_ID_REGEX = /^[a-z][a-z0-9-]*$/;
const FORMAT_REGEX = /^(png|svg)$/;

interface WidgetPayload {
  envelope: ReportEnvelope;
  i18n: Record<string, string>;
  workspaceName: string;
  locale: string;
}

async function fetchWidgetPayload(
  renderId: string,
  token: string,
): Promise<WidgetPayload | null> {
  if (!RENDER_ID_REGEX.test(renderId)) return null;
  if (!TOKEN_REGEX.test(token)) return null;
  // Server-side fetch — `INTERNAL_API_URL` öncelikli (Docker network içi);
  // yoksa `NEXT_PUBLIC_API_URL`'a düş. Tam akış için
  // `apps/web/src/app/(internal)/reports/print/[id]/page.tsx`'teki uzun
  // yorum bloğuna bakın (DEM-276 root cause + fix).
  const apiBase = process.env.INTERNAL_API_URL ?? env.NEXT_PUBLIC_API_URL;
  const url = new URL(
    `${apiBase.replace(/\/$/, '')}/trpc/report.print.verifyToken`,
  );
  url.searchParams.set('input', encodeTrpcInput({ renderId, token }));
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    result?: { data?: { json?: WidgetPayload } };
  } | null;
  return body?.result?.data?.json ?? null;
}

interface WidgetPrintPageProps {
  params: Promise<{ id: string; microReportId: string }>;
  searchParams: Promise<{ token?: string; format?: string }>;
}

export default async function WidgetPrintPage({
  params,
  searchParams,
}: WidgetPrintPageProps) {
  const { id, microReportId } = await params;
  const { token, format } = await searchParams;
  if (!token) notFound();
  if (!MICRO_REPORT_ID_REGEX.test(microReportId)) notFound();
  const effectiveFormat = (format ?? 'png').toLowerCase();
  if (!FORMAT_REGEX.test(effectiveFormat)) notFound();

  const payload = await fetchWidgetPayload(id, token);
  if (!payload) notFound();

  const microReport = payload.envelope.microReports.find((m) => m.id === microReportId);
  if (!microReport || microReport.error) notFound();

  return (
    <WidgetPrintClient
      microReportId={microReportId}
      microReportData={microReport.data}
      comparisonData={microReport.comparisonData ?? null}
      envelope={payload.envelope}
      i18n={payload.i18n}
      locale={payload.locale}
      format={effectiveFormat as 'png' | 'svg'}
      renderId={id}
    />
  );
}
