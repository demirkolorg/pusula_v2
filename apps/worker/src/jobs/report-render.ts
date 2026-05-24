/**
 * Faz 13I ([DEM-265](https://linear.app/demirkol/issue/DEM-265)) — rapor PDF
 * render worker. Consumer of `pusula-report-render` BullMQ queue. Spec:
 * `docs/architecture/16-raporlama-mimarisi.md` §16.8.
 *
 * Akış:
 *   1. Job pickup → `report_renders.status='rendering'` + startedAt stamp.
 *   2. Worker shared secret ile `apps/api` `/api/trpc/report.print.requestToken`
 *      çağrılır; HMAC imzalı 5 dakikalık token alınır.
 *   3. Puppeteer (system Chromium, executable path env'den) launch — singleton
 *      browser instance (module-level), her job için yeni `page`.
 *   4. `page.goto(${APP_URL}/reports/print/${renderId}?token=${jwt})` —
 *      print sayfası tRPC `print.verifyToken` çağırır, dataset alır, render
 *      eder, `window.__reportReady = true` yazar.
 *   5. `page.waitForFunction('window.__reportReady === true', { timeout: 30s })`.
 *   6. `page.pdf({...A4...})` → Buffer.
 *   7. MinIO/S3 upload — `S3_REPORTS_BUCKET` bucket'ı, key
 *      `workspace/<workspaceId>/<renderId>.pdf`.
 *   8. `report_renders` UPDATE (status='completed', completedAt) +
 *      `report_render_assets` INSERT (atomik transaction).
 *   9. Pub/sub: `pusula:report:render` channel'a `report.render.completed`
 *      event (apps/api bridge dinler → user/workspace room'a emit).
 *
 * Hata yolu (her adımda):
 *   - DB transaction'ı dışında olan operasyonlar (Puppeteer, S3) try/catch
 *     ile sarılır. Yakalanan hata → `report_renders.status='failed'` +
 *     errorMessage (PII leak yok — sadece error code/kategori). BullMQ
 *     retry hâlâ devrededir (3 attempt + exp backoff); ama her başarısız
 *     attempt DB'ye 'failed' stamp eder, son attempt sonrası retry
 *     stop'ta DB durumu kalıcı 'failed' olur (BullMQ son denemede de
 *     'failed' stamp'lı bırakır, idempotent).
 *
 * Browser singleton:
 *   - Worker process boyunca 1 browser instance. `launch()` kez bir kez
 *     yapılır; her job yeni page açar (browser context paylaşımı kart
 *     verileri arası izolasyon için risk değil — print sayfası her
 *     çağrıda yeni token ile fresh tRPC dataset çeker).
 *   - Worker SIGTERM/SIGINT'te `closeBrowser()` çağrılır (`index.ts`
 *     shutdown listener).
 */
import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { eq } from '@pusula/db';
import {
  reportRenderAssets,
  reportRenders,
  type Database,
  type ReportRender,
} from '@pusula/db';
import type { Browser, Page } from 'puppeteer-core';

/** Wire-format channel pub/sub'a bağlanacak event (Faz 5B realtime pattern). */
export const REPORT_RENDER_CHANNEL = 'pusula:report:render';
export const REPORT_RENDER_JOB_NAME = 'report-render';

/** BullMQ job payload. */
export interface ReportRenderJobData {
  renderId: string;
}

/** Pub/sub message — `apps/api` bridge bunu dinler ve socket'e geçer. */
export interface ReportRenderMessage {
  event: {
    type: 'report.render.completed' | 'report.render.failed';
    renderId: string;
    workspaceId: string;
    /** `triggeredBy` user — null ise tetikleyici yok (worker direct render). */
    userId: string | null;
    /** Asset key — completed'da set (download için signed URL host tarafında). */
    s3Key: string | null;
    /** Hata mesajı — failed'da set. Public-safe (PII içermez). */
    errorMessage: string | null;
    /** ISO timestamp. */
    at: string;
  };
}

/** Minimum S3-shaped surface — `apps/api` `attachment-cleanup` pattern'i. */
export interface ReportObjectStorage {
  putObject: (input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }) => Promise<void>;
}

/** Pub/sub publisher (Redis `publish` shape). */
export interface ReportRenderPublisher {
  publish: (channel: string, message: string) => Promise<number> | number;
}

/**
 * Print token resolver — worker, `apps/api`'nin `report.print.requestToken`
 * procedure'ünü `WORKER_SHARED_SECRET` header'ı ile çağırır. Dış HTTP
 * çağrısı; testlerde mock'lanır.
 */
export interface PrintTokenResolver {
  (input: {
    renderId: string;
    internalApiUrl: string;
    workerSharedSecret: string;
  }): Promise<{ token: string; expiresAt: string }>;
}

/**
 * Puppeteer launcher — sadece runtime'da yüklenir (dependency-free
 * import maliyetini ödememek için). Test mock'u `puppeteer-core`'u hiç
 * yüklemez.
 */
export interface PuppeteerLauncher {
  /** Browser instance açıp döndür. Tek seferlik (singleton). */
  launchBrowser(opts: { executablePath?: string }): Promise<Browser>;
}

/**
 * Üretilen PDF buffer + metadata. `pageRender` aşaması sonrası
 * `uploadToStorage` + `recordAsset` ile birleşir.
 */
export interface PdfRenderResult {
  buffer: Buffer;
  byteSize: number;
  /** SHA-256 checksum — `report_render_assets.checksum`. */
  checksum: string;
}

export interface ReportRenderJobDeps {
  db: Database;
  storage: ReportObjectStorage;
  publisher: ReportRenderPublisher;
  resolvePrintToken: PrintTokenResolver;
  launcher: PuppeteerLauncher;
  /** App-public web URL (`APP_URL`) — print sayfası buraya gider. */
  appUrl: string;
  /** Worker → API call için private URL. */
  internalApiUrl: string;
  /** `apps/api` ile paylaşılan secret — print token isteme yetkisi. */
  workerSharedSecret: string;
  /** MinIO bucket adı — Faz 13I özel bucket'ı (`pusula-reports`). */
  bucket: string;
  /** Puppeteer launch için Chrome/Chromium binary yolu (env'den). */
  executablePath?: string;
  /** Now injection — test deterministic. */
  now?: () => Date;
  /**
   * `page.waitForFunction` timeout — büyük workspace'lerde 30s yetersiz
   * olabilir; testlerde 0 (anlık) kullanılır. Default 30_000.
   */
  pageReadyTimeoutMs?: number;
  /**
   * BullMQ retry koordinasyonu (code-review M1+M2 fix): hangi attempt
   * koşuyoruz + queue config'ten max attempts. Worker callback `index.ts`
   * tarafında `job.attemptsMade` + 1 ve `job.opts.attempts` ile besler.
   *
   * Transient hata (token/render/upload) ise: DB 'rendering' kalır, throw
   * ile BullMQ retry'a düşer. Yalnız `attemptsMade + 1 >= maxAttempts`
   * (son deneme) ise `stampFailed` ile DB'yi kalıcı 'failed' damgala.
   * `unsupported_format` (kalıcı user error) her zaman damgalanır.
   *
   * Default: `attemptsMade=0, maxAttempts=1` — testlerde tek deneme,
   * her hata final → eski davranışla uyumlu.
   */
  attemptsMade?: number;
  maxAttempts?: number;
  /**
   * Faz 13J (DEM-266) — render başarıyla tamamlandıktan sonra çağrılan
   * opsiyonel hook. `index.ts` bu callback'i `triggerKind === 'scheduled'
   * && scheduleId` set ise `sendScheduledReportEmail`'e bağlar. Fire-and-
   * forget: hata atarsa render outcome'u 'completed' kalır (DB değişmez),
   * yalnız log + Sentry breadcrumb (kullanıcı yine `report.getRender` ile
   * indirme alır).
   */
  onCompleted?: (input: {
    renderId: string;
    workspaceId: string;
    scheduleId: string | null;
    triggerKind: string;
    triggeredBy: string | null;
    s3Key: string;
  }) => Promise<unknown> | unknown;
}

/**
 * Browser singleton holder — worker process boyunca paylaşılır.
 * `getOrLaunchBrowser` ilk çağrıda launch eder; sonraki job'lar reuse.
 * `closeBrowser` graceful shutdown'da çağrılır.
 */
let cachedBrowser: Browser | null = null;
let cachedBrowserPromise: Promise<Browser> | null = null;

export async function getOrLaunchBrowser(
  launcher: PuppeteerLauncher,
  executablePath?: string,
): Promise<Browser> {
  if (cachedBrowser) return cachedBrowser;
  if (cachedBrowserPromise) return cachedBrowserPromise;
  cachedBrowserPromise = launcher
    .launchBrowser({ executablePath })
    .then((browser) => {
      cachedBrowser = browser;
      // Browser kapanırsa cache invalidate — sonraki job yeniden launch eder.
      browser.on('disconnected', () => {
        cachedBrowser = null;
        cachedBrowserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      cachedBrowserPromise = null;
      throw err;
    });
  return cachedBrowserPromise;
}

export async function closeBrowser(): Promise<void> {
  const browser = cachedBrowser;
  cachedBrowser = null;
  cachedBrowserPromise = null;
  if (browser) {
    await browser.close().catch(() => {});
  }
}

/** Test-only — singleton state reset. */
export function __resetBrowserSingletonForTest(): void {
  cachedBrowser = null;
  cachedBrowserPromise = null;
}

export interface ProcessReportRenderResult {
  outcome: 'completed' | 'failed' | 'skipped';
  renderId: string;
  s3Key?: string;
  errorCategory?: string;
}

/**
 * Job processor — `index.ts` Worker callback'i bunu çağırır. Tek render
 * için tüm pipeline'i koşar; hata durumunda DB'yi 'failed' stamp eder ve
 * pub/sub'a publish eder, sonra hatayı yeniden fırlatır (BullMQ retry).
 */
export async function processReportRenderJob(
  data: ReportRenderJobData,
  deps: ReportRenderJobDeps,
): Promise<ProcessReportRenderResult> {
  const now = deps.now ?? (() => new Date());

  // 1. Row pickup + idempotent guard: `FOR UPDATE SKIP LOCKED` ile lock,
  //    sadece status='queued' veya 'rendering' (retry) rows üzerinde çalış.
  //    'completed' / 'failed' → idempotent no-op (BullMQ duplicate veya
  //    sweeper edge case).
  const rendering = await deps.db.transaction(async (tx) => {
    const [row] = (await tx
      .select()
      .from(reportRenders)
      .where(eq(reportRenders.id, data.renderId))
      .limit(1)
      .for('update', { skipLocked: true })) as ReportRender[];
    if (!row) return null;
    if (row.status === 'completed' || row.status === 'failed') {
      return { row, skip: true as const };
    }
    await tx
      .update(reportRenders)
      .set({ status: 'rendering', startedAt: now() })
      .where(eq(reportRenders.id, data.renderId));
    return { row, skip: false as const };
  });

  if (!rendering) {
    // Row deleted between enqueue and pickup — idempotent skip.
    return { outcome: 'skipped', renderId: data.renderId };
  }
  if (rendering.skip) {
    return { outcome: 'skipped', renderId: data.renderId };
  }

  const row = rendering.row;
  // code-review M1+M2: yalnız son denemede DB'yi 'failed' damgala —
  // intermediate transient hatalarda 'rendering' kalsın ki BullMQ retry
  // sıradaki attempt'ta row'u tekrar pickup edebilsin.
  const attemptsMade = deps.attemptsMade ?? 0;
  const maxAttempts = deps.maxAttempts ?? 1;
  const isFinalAttempt = attemptsMade + 1 >= maxAttempts;

  // 2. Format check — V1: sadece pdf. xlsx/png 13L/13M'de. Kalıcı user
  // error → her zaman damgala, BullMQ retry yararsız.
  if (row.format !== 'pdf') {
    await stampFailed(deps, row, 'unsupported_format', now());
    return {
      outcome: 'failed',
      renderId: data.renderId,
      errorCategory: 'unsupported_format',
    };
  }

  // 3. Print token al — apps/api `report.print.requestToken` (worker secret).
  // Transient: token failure (API down/network blip). Final attempt'ta
  // damgala; intermediate'da row 'rendering' kalsın → BullMQ retry pickup.
  let token: string;
  try {
    const result = await deps.resolvePrintToken({
      renderId: data.renderId,
      internalApiUrl: deps.internalApiUrl,
      workerSharedSecret: deps.workerSharedSecret,
    });
    token = result.token;
  } catch (err) {
    if (isFinalAttempt) {
      await stampFailed(deps, row, 'print_token_failed', now());
    }
    throw wrapError(err, 'print_token_failed');
  }

  // 4. Puppeteer launch + page lifecycle.
  let pdfResult: PdfRenderResult;
  try {
    pdfResult = await renderPdfWithBrowser({
      launcher: deps.launcher,
      executablePath: deps.executablePath,
      appUrl: deps.appUrl,
      renderId: data.renderId,
      token,
      pageReadyTimeoutMs: deps.pageReadyTimeoutMs ?? 30_000,
    });
  } catch (err) {
    if (isFinalAttempt) {
      await stampFailed(deps, row, 'pdf_render_failed', now());
    }
    throw wrapError(err, 'pdf_render_failed');
  }

  // 5. MinIO/S3 upload.
  const s3Key = `workspace/${row.workspaceId}/${row.id}.pdf`;
  try {
    await deps.storage.putObject({
      bucket: deps.bucket,
      key: s3Key,
      body: pdfResult.buffer,
      contentType: 'application/pdf',
    });
  } catch (err) {
    if (isFinalAttempt) {
      await stampFailed(deps, row, 'storage_upload_failed', now());
    }
    throw wrapError(err, 'storage_upload_failed');
  }

  // 6. DB transaction: render UPDATE + asset INSERT atomik.
  try {
    await deps.db.transaction(async (tx) => {
      await tx
        .update(reportRenders)
        .set({
          status: 'completed',
          completedAt: now(),
          errorMessage: null,
        })
        .where(eq(reportRenders.id, row.id));
      await tx.insert(reportRenderAssets).values({
        renderId: row.id,
        format: 'pdf',
        s3Bucket: deps.bucket,
        s3Key,
        byteSize: pdfResult.byteSize,
        checksum: pdfResult.checksum,
        // 90g retention — Faz 13P (DEM-272) cleanup worker bunu kullanır.
        // V1'de TTL set ediyoruz; cleanup worker gelene kadar manuel /
        // MinIO lifecycle ile temizlenebilir.
        expiresAt: new Date(now().getTime() + 90 * 24 * 60 * 60 * 1000),
      });
    });
  } catch (err) {
    // DB hatası — S3'te artık dosya var. Cleanup için 13P retention
    // worker'a güveniyoruz (orphan asset'leri expires_at sonrası siler).
    // Burada 'failed' damgalamak risk: status 'completed' set edilemediği
    // için tekrar enqueue olabilir → BullMQ retry zaten devrede, throw'la
    // bırakıyoruz.
    throw wrapError(err, 'db_commit_failed');
  }

  // 7. Pub/sub completed event.
  const message: ReportRenderMessage = {
    event: {
      type: 'report.render.completed',
      renderId: row.id,
      workspaceId: row.workspaceId,
      userId: row.triggeredBy ?? null,
      s3Key,
      errorMessage: null,
      at: now().toISOString(),
    },
  };
  try {
    await deps.publisher.publish(REPORT_RENDER_CHANNEL, JSON.stringify(message));
  } catch (err) {
    // Best-effort — DB durumu 'completed' kaldı, kullanıcı refetch'le
    // görür. Sentry için console.warn yeterli.
    console.warn(
      '[worker:report-render] socket publish failed:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // 8. Faz 13J (DEM-266) — onCompleted hook. `index.ts` scheduled trigger
  // branch'inde email gönderim job'una bağlar; manual/save trigger'lar
  // için undefined kalır (no-op). Fire-and-forget — email fail render'ı
  // bozmaz.
  if (deps.onCompleted) {
    try {
      await deps.onCompleted({
        renderId: row.id,
        workspaceId: row.workspaceId,
        scheduleId: row.scheduleId ?? null,
        triggerKind: row.triggerKind,
        triggeredBy: row.triggeredBy ?? null,
        s3Key,
      });
    } catch (err) {
      console.warn(
        '[worker:report-render] onCompleted hook failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { outcome: 'completed', renderId: row.id, s3Key };
}

/**
 * Puppeteer page lifecycle — browser singleton'tan page aç, goto + wait +
 * pdf üret + page kapa. Browser kapanmaz (singleton).
 */
async function renderPdfWithBrowser(args: {
  launcher: PuppeteerLauncher;
  executablePath?: string;
  appUrl: string;
  renderId: string;
  token: string;
  pageReadyTimeoutMs: number;
}): Promise<PdfRenderResult> {
  const browser = await getOrLaunchBrowser(args.launcher, args.executablePath);
  const page = await browser.newPage();
  try {
    // Token query string'de — print sayfası bunu okur (cookie/header yok,
    // public route). HTTPS production'da TLS encrypts; HTTP dev için
    // localhost loopback ok.
    const url = new URL(`/reports/print/${args.renderId}`, args.appUrl);
    url.searchParams.set('token', args.token);
    await page.goto(url.toString(), { waitUntil: 'networkidle0', timeout: 60_000 });
    // Print sayfası tRPC `print.verifyToken` çağırır, dataset alır,
    // <ReportDocument/> render eder, son chart commit'inde
    // `window.__reportReady = true` yazar.
    await page.waitForFunction('window.__reportReady === true', {
      timeout: args.pageReadyTimeoutMs,
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    });
    // puppeteer-core `page.pdf()` Uint8Array döner; Buffer'a çevir.
    const buffer = Buffer.from(pdfBuffer);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    return {
      buffer,
      byteSize: buffer.byteLength,
      checksum,
    };
  } finally {
    // Page'i her zaman kapa — memory leak yok. Browser singleton kalır.
    await page.close().catch(() => {});
  }
}

/**
 * `report_renders.status='failed'` + errorMessage stamp + pub/sub failed
 * event. `errorCode` PII-safe i18n key (`reports.errors.*`). UI tarafı bunu
 * çözümler (`payload.i18n[errorCode] ?? errorCode`); locale-bağımsız.
 *
 * code-review M3 fix: hardcoded Türkçe string yerine kategori kodu — UI
 * bileşenleri hardcode metin içermez kuralı (CLAUDE.md §2.8) + multi-locale
 * gelecek için drift-proof.
 */
async function stampFailed(
  deps: ReportRenderJobDeps,
  row: ReportRender,
  errorCode:
    | 'unsupported_format'
    | 'print_token_failed'
    | 'pdf_render_failed'
    | 'storage_upload_failed',
  at: Date,
): Promise<void> {
  const i18nKey = `reports.errors.${errorCode}`;
  await deps.db
    .update(reportRenders)
    .set({
      status: 'failed',
      completedAt: at,
      errorMessage: i18nKey,
    })
    .where(eq(reportRenders.id, row.id));
  const message: ReportRenderMessage = {
    event: {
      type: 'report.render.failed',
      renderId: row.id,
      workspaceId: row.workspaceId,
      userId: row.triggeredBy ?? null,
      s3Key: null,
      errorMessage: i18nKey,
      at: at.toISOString(),
    },
  };
  try {
    await deps.publisher.publish(REPORT_RENDER_CHANNEL, JSON.stringify(message));
  } catch (err) {
    console.warn(
      '[worker:report-render] failed-event publish failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

function wrapError(err: unknown, category: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const wrapped = new Error(`[${category}] ${message}`);
  if (err instanceof Error && err.stack) {
    wrapped.stack = err.stack;
  }
  return wrapped;
}

/**
 * Default print token resolver — `apps/api` tRPC `report.print.requestToken`
 * procedure'ünü `x-worker-secret` header'ı ile çağırır. tRPC fetch adapter
 * üzerinden gider; minimum dependency (sadece global `fetch`, Node 22+
 * native).
 *
 * Output shape: `{ result: { data: { token, expiresAt } } }` (tRPC v11).
 */
export const defaultPrintTokenResolver: PrintTokenResolver = async ({
  renderId,
  internalApiUrl,
  workerSharedSecret,
}) => {
  // tRPC mutation endpoint: POST `/trpc/report.print.requestToken`. apps/api
  // mount path `${TRPC_ENDPOINT}/*` = `/trpc/<procedure>` (NOT `/api/trpc`).
  // tRPC v11 + superjson body shape (web client tarafıyla simetrik):
  //   `{ "json": <input> }` (superjson "json"-only encoding — primitive
  //   string'ler için "meta" gerekmez; renderId düz string olduğu için
  //   manuel JSON encode yeterli, `@trpc/client` runtime'a indirmiyoruz).
  const url = new URL('/trpc/report.print.requestToken', internalApiUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // `apps/api` `buildTrpcContext` `x-worker-secret` header'ını okur
      // ve `timingSafeEqual` ile env'le karşılaştırır; eşleşmezse ctx
      // `workerSharedSecret` undefined → procedure UNAUTHORIZED.
      'x-worker-secret': workerSharedSecret,
    },
    body: JSON.stringify({ json: { renderId } }),
  });
  if (!response.ok) {
    // Security M2: response body'yi mesaja katma — error path'inde tRPC
    // adapter stack/header/raw error mesajı dönebilir (özellikle dev'de).
    // Bu Error BullMQ stack + Sentry'ye iletilir; PII/secret sızabilir.
    // Sadece HTTP status leak'i kabul ediyoruz (tracking için yeterli).
    throw new Error(`print.requestToken HTTP ${response.status}`);
  }
  // tRPC v11 + superjson response:
  //   `{ "result": { "data": { "json": { token, expiresAt } } } }`.
  const json = (await response.json()) as {
    result?: { data?: { json?: { token?: string; expiresAt?: string } } };
  };
  const token = json.result?.data?.json?.token;
  const expiresAt = json.result?.data?.json?.expiresAt;
  if (!token || !expiresAt) {
    throw new Error('print.requestToken response missing token/expiresAt');
  }
  return { token, expiresAt };
};

/**
 * Default Puppeteer launcher — `puppeteer-core` dinamik import (test
 * mock'u bu import'u atlatır). Module-level değil — ilk launch çağrısında
 * yüklenir.
 */
export const defaultPuppeteerLauncher: PuppeteerLauncher = {
  async launchBrowser({ executablePath }) {
    // Dinamik import: puppeteer-core'u yalnız launch çağrıldığında yükle
    // (testler module-level yüklenmesin diye).
    const mod = await import('puppeteer-core');
    return mod.default.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  },
};

/**
 * Object storage adapter — `apps/api` `attachment-cleanup` pattern'iyle
 * simetrik. `@aws-sdk/client-s3` `S3Client` sarması.
 */
export function s3PutObjectAdapter(client: S3Client): ReportObjectStorage {
  return {
    async putObject({ bucket, key, body, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  };
}

/** S3 client factory — `attachment-cleanup.ts` pattern (MinIO path-style). */
export function createReportS3Client(config: S3ClientConfig): S3Client {
  return new S3Client({
    forcePathStyle: true,
    ...config,
  });
}

// Re-export'lar — test ergonomics + type referansları.
export type { Browser, Page };
