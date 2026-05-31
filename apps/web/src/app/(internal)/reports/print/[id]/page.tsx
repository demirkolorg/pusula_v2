/**
 * Faz 13I (DEM-265) — Puppeteer worker'ın açtığı print sayfası.
 *
 *   /reports/print/[id]?token=<HMAC-imzalı-token>
 *
 * Akış:
 *   1. Puppeteer worker `report.print.requestToken` ile token alır.
 *   2. `page.goto('${APP_URL}/reports/print/${renderId}?token=...')`.
 *   3. Bu Server Component, server-side `fetch /trpc/report.print.verifyToken`
 *      ile dataset envelope'u alır (token expired/missing → 404).
 *   4. `<ReportPrintClient>` envelope'u alır, recharts ile render eder,
 *      `window.__reportReady = true` set eder.
 *   5. Puppeteer `page.waitForFunction('window.__reportReady === true')` ile
 *      bekler ve `page.pdf()` üretir.
 *
 * Public route (auth middleware yok); ancak token doğrulaması olmadan
 * dataset çıkmaz. `robots: noindex` zorunlu.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §16.8.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/env';
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';
import { ReportPrintClient, type ReportPrintPayload } from './_components/report-print-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Pusula Rapor — PDF Önizleme',
  robots: { index: false, follow: false },
};

/**
 * tRPC v11 + superjson GET çağrısı için input encoding helper'ı.
 * URL: `/trpc/<procedure>?input=<urlencoded({"json": <input>})>`.
 * Web tarafı `apps/web/src/trpc/client.tsx` aynı transformer kuralını
 * kullandığı için server-side fetch'te aynı formatı manuel kuruyoruz
 * (worker tarafıyla simetrik — `report-render.ts` `defaultPrintTokenResolver`).
 */
function encodeTrpcInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify({ json: input }));
}

/**
 * Token'in shape'i: `<base64url>.<base64url>` (HMAC-SHA256 imzalı, 5dk
 * expire). Yalnız safe karakterler (b64url + `.`). Trafiği temiz tut:
 * malformed token → erken 404. Yine de tRPC server-side defense-in-depth
 * `verifyPrintToken` ile aynı check'i yapar.
 */
const TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * `renderId` text+nanoid (default helper boyutu); şu an formati `^[A-Za-z0-9_-]{1,64}$`
 * (`@pusula/domain/reports` `report-cache.ts` `SAFE_KEY_SEGMENT` ile uyumlu).
 * Pasivasyon adımı: malformed renderId — 404.
 */
const RENDER_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;

// Faz 13T (DEM-276) — sessiz `notFound()` Puppeteer'a 404 dönmesine yol
// açıyordu; worker `waitForFunction('window.__reportReady')` 30s timeout +
// `pdf_render_failed` stamp. Server-side structured warn → Dokploy container
// log'larında görünür hale getir; PII-safe (token loglanmaz, sadece renderId
// + sebep). Sentry init bu route'ta yok (public print sayfası); konsol log
// container log'a yansır + Pusula log toplama disiplini buradan tarar.
function warnFetchFailure(
  renderId: string,
  reason: 'invalid_render_id' | 'invalid_token' | 'network_error' | 'http_error' | 'empty_payload',
  detail?: { status?: number; statusText?: string; message?: string },
): void {
  console.warn(
    '[reports/print] verifyToken fetch fail',
    JSON.stringify({ renderId, reason, ...(detail ?? {}) }),
  );
}

async function fetchReportPayload(
  renderId: string,
  token: string,
): Promise<ReportPrintPayload | null> {
  if (!RENDER_ID_REGEX.test(renderId)) {
    warnFetchFailure(renderId, 'invalid_render_id');
    return null;
  }
  if (!TOKEN_REGEX.test(token)) {
    warnFetchFailure(renderId, 'invalid_token');
    return null;
  }

  // Server Component server-side fetch yapar — internal Docker network'ü
  // (`http://api:3001`) public domain'e göre hem hızlı hem reverse-proxy
  // bağımsız. `INTERNAL_API_URL` worker tarafıyla simetrik (bkz.
  // `apps/worker/src/jobs/report-render.ts` `deps.internalApiUrl`). Set
  // edilmemişse `NEXT_PUBLIC_API_URL` fallback — dev'de localhost'a düşer,
  // prod'da `INTERNAL_API_URL` runtime env zorunlu (yoksa env.ts default'u
  // `http://localhost:3001` Puppeteer print fetch'ini ECONNREFUSED'a sürer,
  // → notFound() → `window.__reportReady` set olmaz → `pdf_render_failed`).
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
  } catch (error) {
    warnFetchFailure(renderId, 'network_error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!res.ok) {
    warnFetchFailure(renderId, 'http_error', {
      status: res.status,
      statusText: res.statusText,
    });
    return null;
  }
  const body = (await res.json().catch(() => null)) as {
    result?: {
      data?: {
        json?: {
          envelope: ReportEnvelope;
          i18n: Record<string, string>;
          workspaceName: string;
          locale: string;
        };
      };
    };
  } | null;
  const payload = body?.result?.data?.json;
  if (!payload) {
    warnFetchFailure(renderId, 'empty_payload');
    return null;
  }
  return payload;
}

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const { token } = await searchParams;
  if (!token) notFound();

  const payload = await fetchReportPayload(id, token);
  if (!payload) notFound();

  return <ReportPrintClient payload={payload} renderId={id} />;
}
