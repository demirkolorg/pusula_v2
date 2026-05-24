/**
 * Faz 13L (DEM-268) — chart-level PNG/SVG render pipeline'ı. Tek
 * micro-report widget'ını Puppeteer ile özel print route'una yönlendirip
 * `page.screenshot()` (PNG) veya DOM `svg.outerHTML` (SVG) çıktısı üretir.
 *
 *   /reports/print/[id]/widget/[microReportId]?token=<jwt>&format=<png|svg>
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §9.
 *
 * Puppeteer browser singleton 13I'dan reuse (`getOrLaunchBrowser`); concurrency
 * limiti ortak (worker config'inden). PDF render ile aynı disiplinde: page
 * close finally, `__widgetReady` flag bekle, timeout 30s.
 */
import { createHash } from 'node:crypto';
import { getOrLaunchBrowser, type PuppeteerLauncher } from './report-render';

/** PNG/SVG için input. */
export interface RenderWidgetInput {
  renderId: string;
  microReportId: string;
  token: string;
  appUrl: string;
  format: 'png' | 'svg';
  launcher: PuppeteerLauncher;
  executablePath?: string;
  /** `page.waitForFunction` timeout — default 30s; test 1ms. */
  pageReadyTimeoutMs?: number;
}

export interface RenderWidgetResult {
  buffer: Buffer;
  byteSize: number;
  checksum: string;
  contentType: 'image/png' | 'image/svg+xml';
}

/** Default widget viewport — chart aspect için sabit. */
const WIDGET_VIEWPORT = { width: 1200, height: 800 } as const;
/** Retina için 2x device scale (PNG sharp). */
const DEVICE_SCALE_FACTOR = 2;
/** Widget route'unda micro-report id format'ı `^[a-z][a-z0-9-]*$` (kebab). */
const MICRO_REPORT_ID_REGEX = /^[a-z][a-z0-9-]*$/;

export async function renderWidget(input: RenderWidgetInput): Promise<RenderWidgetResult> {
  if (!MICRO_REPORT_ID_REGEX.test(input.microReportId)) {
    throw new Error(`invalid microReportId: ${input.microReportId}`);
  }
  const browser = await getOrLaunchBrowser(input.launcher, input.executablePath);
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: WIDGET_VIEWPORT.width,
      height: WIDGET_VIEWPORT.height,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    const url = new URL(
      `/reports/print/${input.renderId}/widget/${input.microReportId}`,
      input.appUrl,
    );
    url.searchParams.set('token', input.token);
    url.searchParams.set('format', input.format);
    await page.goto(url.toString(), { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.waitForFunction('window.__widgetReady === true', {
      timeout: input.pageReadyTimeoutMs ?? 30_000,
    });

    if (input.format === 'png') {
      const raw = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: WIDGET_VIEWPORT.width,
          height: WIDGET_VIEWPORT.height,
        },
        omitBackground: false,
      });
      const buffer = Buffer.from(raw);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      return {
        buffer,
        byteSize: buffer.byteLength,
        checksum,
        contentType: 'image/png',
      };
    }
    // SVG: widget DOM'unda recharts <svg>'i bul ve outerHTML'i çıkar.
    const svg = await page.evaluate(() => {
      const root = document.getElementById('widget-root');
      const svgEl = root?.querySelector('svg');
      return svgEl ? svgEl.outerHTML : null;
    });
    if (!svg) {
      throw new Error('widget DOM missing <svg> — SVG export unsupported for this micro-report');
    }
    const buffer = Buffer.from(svg, 'utf-8');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    return {
      buffer,
      byteSize: buffer.byteLength,
      checksum,
      contentType: 'image/svg+xml',
    };
  } finally {
    await page.close().catch(() => {});
  }
}
