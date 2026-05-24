/**
 * Faz 13L (DEM-268) — render-png/svg unit tests. Mock Puppeteer (browser
 * singleton testleri report-render.test.ts'te); burada `renderWidget`'in
 * URL kurma, viewport setleme, format-specific çıkış (PNG buffer vs SVG
 * outerHTML) davranışı test edilir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBrowserSingletonForTest, type PuppeteerLauncher } from './report-render';
import { renderWidget } from './render-png';

interface FakePage {
  setViewport: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  waitForFunction: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
  newPage: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makePage(opts: {
  pngBytes?: Buffer;
  svg?: string | null;
}): FakePage {
  const png = opts.pngBytes ?? Buffer.from('PNG-fake');
  return {
    setViewport: vi.fn(async () => undefined),
    goto: vi.fn(async () => null),
    waitForFunction: vi.fn(async () => null),
    screenshot: vi.fn(async () => png),
    evaluate: vi.fn(async () => opts.svg ?? null),
    close: vi.fn(async () => undefined),
  };
}

function makeBrowser(page: FakePage): FakeBrowser {
  return {
    newPage: vi.fn(async () => page),
    on: vi.fn(() => undefined),
    close: vi.fn(async () => undefined),
  };
}

function makeLauncher(browser: FakeBrowser): PuppeteerLauncher {
  return {
    launchBrowser: vi.fn(async () => browser as never),
  };
}

describe('renderWidget', () => {
  beforeEach(() => {
    __resetBrowserSingletonForTest();
  });
  afterEach(() => {
    __resetBrowserSingletonForTest();
  });

  it('rejects malformed microReportId', async () => {
    const page = makePage({});
    const browser = makeBrowser(page);
    await expect(
      renderWidget({
        renderId: 'r1',
        microReportId: 'Bad ID',
        token: 'tok.sig',
        appUrl: 'http://web:3000',
        format: 'png',
        launcher: makeLauncher(browser),
        pageReadyTimeoutMs: 1,
      }),
    ).rejects.toThrow(/invalid microReportId/);
  });

  it('PNG: visits widget URL with token + format, returns buffer', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    const page = makePage({ pngBytes: png });
    const browser = makeBrowser(page);
    const result = await renderWidget({
      renderId: 'r123',
      microReportId: 'activity-timeline',
      token: 'tok.sig',
      appUrl: 'http://web:3000',
      format: 'png',
      launcher: makeLauncher(browser),
      pageReadyTimeoutMs: 1,
    });
    expect(result.contentType).toBe('image/png');
    expect(result.buffer.equals(png)).toBe(true);
    expect(result.byteSize).toBe(png.byteLength);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    // URL doğrulama: goto args
    const gotoCall = page.goto.mock.calls[0]?.[0] as string;
    expect(gotoCall).toContain('/reports/print/r123/widget/activity-timeline');
    expect(gotoCall).toContain('token=tok.sig');
    expect(gotoCall).toContain('format=png');
    // Viewport ayarı 1200×800 @2x
    expect(page.setViewport).toHaveBeenCalledWith({
      width: 1200,
      height: 800,
      deviceScaleFactor: 2,
    });
    // Screenshot clip
    const shotArgs = page.screenshot.mock.calls[0]?.[0] as { clip: { width: number; height: number } };
    expect(shotArgs.clip.width).toBe(1200);
    expect(shotArgs.clip.height).toBe(800);
    // Page close finally
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('SVG: extracts outerHTML from DOM', async () => {
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const page = makePage({ svg: svgText });
    const browser = makeBrowser(page);
    const result = await renderWidget({
      renderId: 'r123',
      microReportId: 'activity-timeline',
      token: 'tok.sig',
      appUrl: 'http://web:3000',
      format: 'svg',
      launcher: makeLauncher(browser),
      pageReadyTimeoutMs: 1,
    });
    expect(result.contentType).toBe('image/svg+xml');
    expect(result.buffer.toString('utf-8')).toBe(svgText);
    // SVG için screenshot çağrılmaz
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('SVG: throws if widget DOM missing svg', async () => {
    const page = makePage({ svg: null });
    const browser = makeBrowser(page);
    await expect(
      renderWidget({
        renderId: 'r1',
        microReportId: 'activity-timeline',
        token: 'tok.sig',
        appUrl: 'http://web:3000',
        format: 'svg',
        launcher: makeLauncher(browser),
        pageReadyTimeoutMs: 1,
      }),
    ).rejects.toThrow(/SVG export unsupported/);
    // Page yine kapatılmalı (finally)
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('waits for window.__widgetReady before screenshot', async () => {
    const page = makePage({});
    const browser = makeBrowser(page);
    await renderWidget({
      renderId: 'r1',
      microReportId: 'activity-timeline',
      token: 'tok.sig',
      appUrl: 'http://web:3000',
      format: 'png',
      launcher: makeLauncher(browser),
      pageReadyTimeoutMs: 1,
    });
    expect(page.waitForFunction).toHaveBeenCalledWith(
      'window.__widgetReady === true',
      { timeout: 1 },
    );
  });
});
