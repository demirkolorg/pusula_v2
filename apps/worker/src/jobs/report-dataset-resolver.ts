/**
 * Faz 13L (DEM-268) — worker, `apps/api`'nin `report.print.verifyToken`
 * procedure'ünü çağırır ve PDF render etmeden dataset envelope + i18n
 * stub + workspace adını alır. PDF pipeline'ı bu adımı Puppeteer içinde
 * print sayfası üzerinden yapıyor; xlsx pipeline'ı doğrudan worker'dan
 * yapar (Puppeteer atlanır).
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9.
 */
import type { ReportEnvelope } from '@pusula/api/lib/report-envelope';

/** `report.print.verifyToken` cevap shape'i. */
export interface ReportPrintDatasetPayload {
  envelope: ReportEnvelope;
  /** Server-side resolve edilmiş i18n stub map (13Q'a kadar). */
  i18n: Record<string, string>;
  /** Render workspace adı (header için). */
  workspaceName: string;
  /** Locale (`tr-TR` V1). */
  locale: string;
}

/**
 * Dataset resolver — worker tarafında inject edilir (testlerde mock).
 * Production'da `apps/api` `/trpc/report.print.verifyToken` GET çağrısı
 * yapar. PDF pipeline'ındaki `defaultPrintTokenResolver` ile simetrik;
 * sadece endpoint farklı (print token alma → token doğrulama).
 */
export interface ReportDatasetResolver {
  (input: {
    renderId: string;
    token: string;
    internalApiUrl: string;
  }): Promise<ReportPrintDatasetPayload>;
}

/**
 * Default resolver — tRPC v11 + superjson GET çağrısı.
 *
 * Output shape: `{ result: { data: { json: { envelope, i18n, workspaceName, locale } } } }`.
 *
 * `print.verifyToken` token-bound (HMAC-SHA256 5dk TTL). Worker zaten
 * `defaultPrintTokenResolver` ile fresh token aldı; aynı token bu çağrıda
 * kullanılır.
 */
export const defaultReportDatasetResolver: ReportDatasetResolver = async ({
  renderId,
  token,
  internalApiUrl,
}) => {
  const url = new URL('/trpc/report.print.verifyToken', internalApiUrl);
  // `URLSearchParams.set()` URL encoding yapar; manuel encodeURIComponent
  // çağrılırsa `%` karakterleri tekrar encode edilir → `%7B` → `%257B`,
  // API parse fail → 400 Bad Request → `xlsx_render_failed`.
  // (Web tarafında simetrik düzeltme — DEM-276 post-mortem 2026-06-01.)
  url.searchParams.set(
    'input',
    JSON.stringify({ json: { renderId, token } }),
  );
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    // PDF pipeline'ı ile aynı disiplin: response body'yi mesaja katma
    // (PII/secret leak riski). Sadece HTTP status'u taşı.
    throw new Error(`print.verifyToken HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    result?: { data?: { json?: ReportPrintDatasetPayload } };
  };
  const payload = body.result?.data?.json;
  if (!payload || !payload.envelope) {
    throw new Error('print.verifyToken response missing envelope');
  }
  return payload;
};
