/**
 * Faz 13I (DEM-265) — report-render job unit tests. Mock-heavy: gerçek
 * Puppeteer + S3 + DB yok. Browser singleton, PDF render lifecycle,
 * processReportRenderJob status transitions ve fail yolları test edilir.
 *
 * Strateji:
 *   - `puppeteer-core` import edilmez (dinamik import sadece runtime; test
 *     `defaultPuppeteerLauncher`'ı mock'lar veya kendi `PuppeteerLauncher`
 *     implementation'ını ver).
 *   - `Database` fake'i Drizzle chain'ini taklit etmez; `processReportRender
 *     Job`'a in-memory bir tx callback'i + update/insert/select kanaları
 *     verilir. Bu, integration test (notification-publish.test.ts) yerine
 *     unit yaklaşımı — DB davranışı ayrı integration suite'inde doğrulanır.
 *   - `defaultPrintTokenResolver` fetch mock'ı ile ayrı test edilir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@pusula/db';
import {
  __resetBrowserSingletonForTest,
  closeBrowser,
  defaultPrintTokenResolver,
  getOrLaunchBrowser,
  processReportRenderJob,
  REPORT_RENDER_CHANNEL,
  s3PutObjectAdapter,
  type PuppeteerLauncher,
  type ReportObjectStorage,
  type ReportRenderJobDeps,
  type ReportRenderMessage,
} from './report-render';

// ─── Fake Browser / Page (puppeteer-core surface) ───────────────────────────

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  waitForFunction: ReturnType<typeof vi.fn>;
  pdf: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
}

function createFakePage(overrides: Partial<FakePage> = {}): FakePage {
  const pdfBytes = Buffer.from('%PDF-fake-' + Math.random().toString(36).slice(2));
  return {
    goto: vi.fn(async () => null),
    waitForFunction: vi.fn(async () => null),
    pdf: vi.fn(async () => pdfBytes),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createFakeBrowser(page: FakePage): FakeBrowser {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    }),
    emit(event, ...args) {
      const list = listeners.get(event);
      list?.forEach((fn) => fn(...args));
    },
    _listeners: listeners,
  };
}

function createFakeLauncher(browser: FakeBrowser): PuppeteerLauncher {
  return {
    launchBrowser: vi.fn(async () => browser as never),
  };
}

// ─── Fake Database (Drizzle chain'i taklit) ─────────────────────────────────

interface InMemoryRender {
  id: string;
  workspaceId: string;
  format: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  // 13L (DEM-268) — PNG/SVG için microReportId hedef; pdf/xlsx için null.
  assetTarget?: { microReportId: string } | null;
}

interface InMemoryAsset {
  renderId: string;
  format: string;
  s3Bucket: string;
  s3Key: string;
  byteSize: number;
  checksum: string | null;
  expiresAt: Date | null;
}

/**
 * Drizzle'ın `for('update', {skipLocked})` + `transaction(cb)` + chainable
 * `select/where/limit` + `update/set/where` + `insert/values` API'sini
 * MINIMAL şekilde taklit eder. Sadece processReportRenderJob'ın çağırdığı
 * yolları handle eder.
 */
function createFakeDatabase(initial: {
  renders?: InMemoryRender[];
}) {
  const renders = new Map<string, InMemoryRender>();
  const assets: InMemoryAsset[] = [];
  for (const r of initial.renders ?? []) {
    renders.set(r.id, r);
  }

  const buildSelectChain = () => {
    let predicate: ((row: InMemoryRender) => boolean) | null = null;
    const chain = {
      from(_table: unknown) {
        return chain;
      },
      where(p: unknown) {
        // Fake `where(eq(reportRenders.id, X))` — burada p doğrudan id
        // string'i veya predicate olmayacak; processReportRenderJob
        // tek bir `eq` filtresi kullanıyor (id). Test setup'ı bu kontekstte
        // basitleştirilmiş — predicate'i id eşleşmesine indir.
        const filter = p as { _id?: string } | (() => boolean);
        if (typeof filter === 'function') {
          predicate = (row) => (filter as () => boolean).call(row);
        } else if (filter && typeof filter === 'object' && filter._id) {
          const id = filter._id;
          predicate = (row) => row.id === id;
        }
        return chain;
      },
      limit(_n: number) {
        return chain;
      },
      for(_lock: 'update', _opts: { skipLocked: boolean }) {
        // Cast `for` chain → thenable array; processReportRenderJob await
        // ile chain'i resolve eder ve `[row]` destructure yapar.
        const filtered = Array.from(renders.values()).filter((r) =>
          predicate ? predicate(r) : true,
        );
        return Promise.resolve(filtered);
      },
    };
    return chain;
  };

  const buildUpdateChain = () => {
    let setValues: Partial<InMemoryRender> = {};
    let predicate: string | null = null;
    return {
      set(values: Partial<InMemoryRender>) {
        setValues = values;
        return this;
      },
      where(p: { _id?: string } | unknown) {
        predicate = (p as { _id?: string })?._id ?? null;
        return this;
      },
      // PromiseLike — await chain
      then(onFulfilled?: (v: unknown) => unknown) {
        if (predicate) {
          const row = renders.get(predicate);
          if (row) Object.assign(row, setValues);
        }
        return Promise.resolve(undefined).then(onFulfilled);
      },
    };
  };

  const buildInsertChain = () => ({
    values(v: InMemoryAsset) {
      assets.push(v);
      return Promise.resolve(undefined);
    },
  });

  // `transaction(cb)` callback'i typeof db'ye refer ediyor → self-referential
  // type için interface tanımı şart (TS recursion).
  interface FakeDb {
    select(columns?: unknown): ReturnType<typeof buildSelectChain>;
    update(table: unknown): ReturnType<typeof buildUpdateChain>;
    insert(table: unknown): ReturnType<typeof buildInsertChain>;
    transaction<T>(cb: (tx: FakeDb) => Promise<T>): Promise<T>;
    _renders: Map<string, InMemoryRender>;
    _assets: InMemoryAsset[];
  }
  const db: FakeDb = {
    select(_columns) {
      return buildSelectChain();
    },
    update(_table) {
      return buildUpdateChain();
    },
    insert(_table) {
      return buildInsertChain();
    },
    async transaction(cb) {
      return cb(db);
    },
    _renders: renders,
    _assets: assets,
  };
  return db;
}

// `eq(reportRenders.id, value)` çağrısının ürettiği nesneyi taklit etmek
// için Drizzle import'unu mock'la — testlerin process işleyişine etki
// etsin diye `_id` alanı taşıyan plain object döndürür.
vi.mock('@pusula/db', async () => {
  const actual = await vi.importActual<typeof DbModule>('@pusula/db');
  return {
    ...actual,
    eq: (col: unknown, value: unknown) => ({ _id: value as string }),
    and: (...args: unknown[]) => args[0],
    sql: actual.sql,
  };
});

// ─── Fake storage / publisher ───────────────────────────────────────────────

function createFakeStorage(): ReportObjectStorage & {
  calls: Array<{ bucket: string; key: string; size: number; contentType: string }>;
} {
  const calls: Array<{ bucket: string; key: string; size: number; contentType: string }> = [];
  return {
    calls,
    async putObject({ bucket, key, body, contentType }) {
      calls.push({ bucket, key, size: body.byteLength, contentType });
    },
  };
}

function createFakePublisher() {
  const calls: Array<{ channel: string; message: ReportRenderMessage }> = [];
  return {
    calls,
    publish: vi.fn(async (channel: string, raw: string): Promise<number> => {
      calls.push({ channel, message: JSON.parse(raw) as ReportRenderMessage });
      return 1;
    }),
  };
}

const FIXED_NOW = new Date('2026-05-24T12:00:00.000Z');

function makeDeps(args: {
  db: ReturnType<typeof createFakeDatabase>;
  launcher: PuppeteerLauncher;
  storage?: ReturnType<typeof createFakeStorage>;
  publisher?: ReturnType<typeof createFakePublisher>;
  resolveTokenOverride?: ReportRenderJobDeps['resolvePrintToken'];
}): ReportRenderJobDeps {
  return {
    db: args.db as unknown as ReportRenderJobDeps['db'],
    storage: args.storage ?? createFakeStorage(),
    publisher: args.publisher ?? createFakePublisher(),
    resolvePrintToken:
      args.resolveTokenOverride ??
      vi.fn(async () => ({
        token: 'fake-token.fake-sig',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })),
    launcher: args.launcher,
    appUrl: 'http://web:3000',
    internalApiUrl: 'http://api:3001',
    workerSharedSecret: 'x'.repeat(32),
    bucket: 'pusula-reports',
    executablePath: '/usr/bin/chromium-browser',
    now: () => FIXED_NOW,
    pageReadyTimeoutMs: 1, // Fake page anında resolve eder.
  };
}

// ─── Browser singleton ─────────────────────────────────────────────────────

describe('getOrLaunchBrowser / closeBrowser (singleton)', () => {
  beforeEach(() => {
    __resetBrowserSingletonForTest();
  });
  afterEach(() => {
    __resetBrowserSingletonForTest();
  });

  it('launches once across multiple calls — singleton reuse', async () => {
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    const b1 = await getOrLaunchBrowser(launcher);
    const b2 = await getOrLaunchBrowser(launcher);
    expect(b1).toBe(browser);
    expect(b2).toBe(browser);
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(1);
  });

  it('parallel concurrent calls share the same launch promise', async () => {
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    const [b1, b2] = await Promise.all([
      getOrLaunchBrowser(launcher),
      getOrLaunchBrowser(launcher),
    ]);
    expect(b1).toBe(browser);
    expect(b2).toBe(browser);
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(1);
  });

  it('disconnect event invalidates cache so a new launch is performed', async () => {
    const browserA = createFakeBrowser(createFakePage());
    const browserB = createFakeBrowser(createFakePage());
    let calls = 0;
    const launcher: PuppeteerLauncher = {
      launchBrowser: vi.fn(async () => {
        calls += 1;
        return (calls === 1 ? browserA : browserB) as never;
      }),
    };
    await getOrLaunchBrowser(launcher);
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(1);
    // Simulate disconnect.
    browserA.emit('disconnected');
    const b2 = await getOrLaunchBrowser(launcher);
    expect(b2).toBe(browserB);
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(2);
  });

  it('closeBrowser tears down the singleton and the next call re-launches', async () => {
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    await getOrLaunchBrowser(launcher);
    await closeBrowser();
    expect(browser.close).toHaveBeenCalledTimes(1);
    const b2 = await getOrLaunchBrowser(launcher);
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(2);
    expect(b2).toBe(browser);
  });

  it('a failed launch does not poison the singleton — next call retries', async () => {
    let attempts = 0;
    const launcher: PuppeteerLauncher = {
      launchBrowser: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('chromium boot failed');
        return createFakeBrowser(createFakePage()) as never;
      }),
    };
    await expect(getOrLaunchBrowser(launcher)).rejects.toThrow('chromium boot failed');
    // Sonraki çağrı yeniden launch dener.
    const b2 = await getOrLaunchBrowser(launcher);
    expect(b2).toBeDefined();
    expect(launcher.launchBrowser).toHaveBeenCalledTimes(2);
  });
});

// ─── processReportRenderJob — happy + idempotency + fail paths ─────────────

describe('processReportRenderJob (mocked DB + browser)', () => {
  beforeEach(() => {
    __resetBrowserSingletonForTest();
  });
  afterEach(() => {
    __resetBrowserSingletonForTest();
  });

  function seed(overrides: Partial<InMemoryRender> = {}): InMemoryRender {
    return {
      id: 'r-1',
      workspaceId: 'w-1',
      format: 'pdf',
      status: 'queued',
      triggeredBy: 'u-1',
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      ...overrides,
    };
  }

  it('happy path — queued → rendering → completed; pdf uploaded; socket event', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const publisher = createFakePublisher();

    const deps = makeDeps({ db, launcher, storage, publisher });
    const result = await processReportRenderJob({ renderId: 'r-1' }, deps);

    expect(result.outcome).toBe('completed');
    expect(result.renderId).toBe('r-1');
    expect(result.s3Key).toBe('workspace/w-1/r-1.pdf');

    // Page lifecycle
    expect(page.goto).toHaveBeenCalledTimes(1);
    const gotoArgs = (page.goto as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(gotoArgs).toContain('/reports/print/r-1');
    expect(gotoArgs).toContain('token=fake-token.fake-sig');
    expect(page.waitForFunction).toHaveBeenCalledTimes(1);
    expect(page.pdf).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);

    // S3 upload
    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0]).toMatchObject({
      bucket: 'pusula-reports',
      key: 'workspace/w-1/r-1.pdf',
      contentType: 'application/pdf',
    });
    expect(storage.calls[0]!.size).toBeGreaterThan(0);

    // DB final state
    const render = db._renders.get('r-1')!;
    expect(render.status).toBe('completed');
    expect(render.completedAt).toEqual(FIXED_NOW);
    expect(render.errorMessage).toBeNull();

    // Asset row
    expect(db._assets).toHaveLength(1);
    expect(db._assets[0]).toMatchObject({
      renderId: 'r-1',
      format: 'pdf',
      s3Bucket: 'pusula-reports',
      s3Key: 'workspace/w-1/r-1.pdf',
    });
    expect(db._assets[0]!.checksum).toMatch(/^[a-f0-9]{64}$/);

    // Socket completed event
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0]).toMatchObject({
      channel: REPORT_RENDER_CHANNEL,
    });
    expect(publisher.calls[0]!.message.event).toMatchObject({
      type: 'report.render.completed',
      renderId: 'r-1',
      workspaceId: 'w-1',
      userId: 'u-1',
      s3Key: 'workspace/w-1/r-1.pdf',
      errorMessage: null,
    });
  });

  it('idempotent — already completed row returns "skipped" without re-rendering', async () => {
    const db = createFakeDatabase({
      renders: [seed({ status: 'completed', completedAt: new Date('2026-01-01') })],
    });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const publisher = createFakePublisher();

    const deps = makeDeps({ db, launcher, storage, publisher });
    const result = await processReportRenderJob({ renderId: 'r-1' }, deps);

    expect(result.outcome).toBe('skipped');
    expect(page.goto).not.toHaveBeenCalled();
    expect(storage.calls).toHaveLength(0);
    expect(publisher.calls).toHaveLength(0);
  });

  it('row missing — outcome "skipped" (deleted between enqueue and pickup)', async () => {
    const db = createFakeDatabase({ renders: [] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const deps = makeDeps({ db, launcher });
    const result = await processReportRenderJob({ renderId: 'r-missing' }, deps);
    expect(result.outcome).toBe('skipped');
  });

  it('unsupported format → stamps failed (i18n key), does NOT re-throw (kalıcı user error)', async () => {
    // 13L (DEM-268) sonrası pdf/xlsx/png/svg destekleniyor; ne olur ne olmaz
    // bir format ('csv') ile defensive recheck branch'i tetiklenir.
    const db = createFakeDatabase({ renders: [seed({ format: 'csv' })] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const publisher = createFakePublisher();
    const deps = makeDeps({ db, launcher, publisher });

    const result = await processReportRenderJob({ renderId: 'r-1' }, deps);
    expect(result.outcome).toBe('failed');
    expect(result.errorCategory).toBe('unsupported_format');
    const render = db._renders.get('r-1')!;
    expect(render.status).toBe('failed');
    // code-review M3: errorMessage artık i18n key (Türkçe string değil).
    expect(render.errorMessage).toBe('reports.errors.unsupported_format');
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0]!.message.event.type).toBe('report.render.failed');
    expect(publisher.calls[0]!.message.event.errorMessage).toBe(
      'reports.errors.unsupported_format',
    );
  });

  it('print token failure (final attempt) → stamps failed + throws', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const publisher = createFakePublisher();
    const deps = makeDeps({
      db,
      launcher,
      publisher,
      resolveTokenOverride: vi.fn(async () => {
        throw new Error('api down');
      }),
    });

    await expect(processReportRenderJob({ renderId: 'r-1' }, deps)).rejects.toThrow(
      /print_token_failed/,
    );
    const render = db._renders.get('r-1')!;
    expect(render.status).toBe('failed');
    expect(render.errorMessage).toBe('reports.errors.print_token_failed');
    expect(publisher.calls.find((c) => c.message.event.type === 'report.render.failed')).toBeDefined();
  });

  it('code-review M1+M2: intermediate attempt transient fail → row STAYS in rendering (BullMQ retry)', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const publisher = createFakePublisher();
    const deps: ReportRenderJobDeps = {
      ...makeDeps({
        db,
        launcher,
        publisher,
        resolveTokenOverride: vi.fn(async () => {
          throw new Error('api blip');
        }),
      }),
      attemptsMade: 0, // İlk attempt
      maxAttempts: 3, // BullMQ default 3 attempt
    };

    await expect(processReportRenderJob({ renderId: 'r-1' }, deps)).rejects.toThrow(
      /print_token_failed/,
    );
    // Status 'rendering' kalmalı — sonraki BullMQ attempt pickup edebilsin.
    expect(db._renders.get('r-1')!.status).toBe('rendering');
    expect(db._renders.get('r-1')!.errorMessage).toBeNull();
    // Failed-event publish'i de yok (sadece final attempt'ta).
    expect(publisher.calls.find((c) => c.message.event.type === 'report.render.failed')).toBeUndefined();
  });

  it('code-review M1+M2: final attempt transient fail → DB stamped failed', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const publisher = createFakePublisher();
    const deps: ReportRenderJobDeps = {
      ...makeDeps({
        db,
        launcher,
        publisher,
        resolveTokenOverride: vi.fn(async () => {
          throw new Error('api blip');
        }),
      }),
      attemptsMade: 2, // Son attempt (3. attempt — 0-indexed; max=3)
      maxAttempts: 3,
    };

    await expect(processReportRenderJob({ renderId: 'r-1' }, deps)).rejects.toThrow(
      /print_token_failed/,
    );
    expect(db._renders.get('r-1')!.status).toBe('failed');
    expect(db._renders.get('r-1')!.errorMessage).toBe('reports.errors.print_token_failed');
  });

  it('puppeteer launch failure (final attempt) → stamps failed + re-throws', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const launcher: PuppeteerLauncher = {
      launchBrowser: vi.fn(async () => {
        throw new Error('chromium not found');
      }),
    };
    const publisher = createFakePublisher();
    const deps = makeDeps({ db, launcher, publisher });

    await expect(processReportRenderJob({ renderId: 'r-1' }, deps)).rejects.toThrow(
      /pdf_render_failed/,
    );
    expect(db._renders.get('r-1')!.status).toBe('failed');
    expect(db._renders.get('r-1')!.errorMessage).toBe('reports.errors.pdf_render_failed');
  });

  it('S3 upload failure (final attempt) → stamps failed + re-throws', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const storage: ReportObjectStorage = {
      async putObject() {
        throw new Error('minio 503');
      },
    };
    const publisher = createFakePublisher();
    const deps = makeDeps({
      db,
      launcher,
      storage: storage as ReturnType<typeof createFakeStorage>,
      publisher,
    });

    await expect(processReportRenderJob({ renderId: 'r-1' }, deps)).rejects.toThrow(
      /storage_upload_failed/,
    );
    expect(db._renders.get('r-1')!.status).toBe('failed');
    expect(db._renders.get('r-1')!.errorMessage).toBe('reports.errors.storage_upload_failed');
  });

  it('socket publish failure does NOT fail the completed render (best-effort)', async () => {
    const db = createFakeDatabase({ renders: [seed()] });
    const page = createFakePage();
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const failingPublisher = {
      publish: vi.fn(async () => {
        throw new Error('redis blip');
      }),
    };
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const deps = makeDeps({
      db,
      launcher,
      publisher: failingPublisher as unknown as ReturnType<typeof createFakePublisher>,
    });

    const result = await processReportRenderJob({ renderId: 'r-1' }, deps);
    expect(result.outcome).toBe('completed');
    expect(db._renders.get('r-1')!.status).toBe('completed');
    consoleWarnSpy.mockRestore();
  });
});

// ─── defaultPrintTokenResolver ─────────────────────────────────────────────

describe('defaultPrintTokenResolver', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends x-worker-secret header and tRPC + superjson body shape', async () => {
    const fetchSpy: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              data: {
                json: { token: 'abc.def', expiresAt: '2026-05-24T12:05:00.000Z' },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    globalThis.fetch = fetchSpy;

    const result = await defaultPrintTokenResolver({
      renderId: 'r-1',
      internalApiUrl: 'http://api:3001',
      workerSharedSecret: 'top-secret-32-char-string-aaa-bbb',
    });
    expect(result).toEqual({ token: 'abc.def', expiresAt: '2026-05-24T12:05:00.000Z' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string | URL, RequestInit | undefined];
    const [url, init] = callArgs;
    expect(String(url)).toBe('http://api:3001/trpc/report.print.requestToken');
    expect(init).toBeDefined();
    const headers = init!.headers as Record<string, string>;
    expect(headers['x-worker-secret']).toBe('top-secret-32-char-string-aaa-bbb');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init!.body as string)).toEqual({
      json: { renderId: 'r-1' },
    });
  });

  it('throws when the API returns non-2xx', async () => {
    globalThis.fetch = (async () =>
      new Response('UNAUTHORIZED', { status: 401 })) as unknown as typeof fetch;
    await expect(
      defaultPrintTokenResolver({
        renderId: 'r-1',
        internalApiUrl: 'http://api:3001',
        workerSharedSecret: 'x'.repeat(32),
      }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('throws when the response is missing token/expiresAt', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: { data: { json: {} } } }), {
        status: 200,
      })) as unknown as typeof fetch;
    await expect(
      defaultPrintTokenResolver({
        renderId: 'r-1',
        internalApiUrl: 'http://api:3001',
        workerSharedSecret: 'x'.repeat(32),
      }),
    ).rejects.toThrow(/missing token\/expiresAt/);
  });
});

// ─── s3PutObjectAdapter ────────────────────────────────────────────────────

describe('s3PutObjectAdapter', () => {
  it('forwards bucket/key/body/contentType to PutObjectCommand', async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = s3PutObjectAdapter({ send } as unknown as Parameters<typeof s3PutObjectAdapter>[0]);
    await adapter.putObject({
      bucket: 'pusula-reports',
      key: 'workspace/w-1/r-1.pdf',
      body: Buffer.from('%PDF'),
      contentType: 'application/pdf',
    });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0]![0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: Buffer };
    };
    expect(cmd.input.Bucket).toBe('pusula-reports');
    expect(cmd.input.Key).toBe('workspace/w-1/r-1.pdf');
    expect(cmd.input.ContentType).toBe('application/pdf');
    expect(cmd.input.Body).toBeInstanceOf(Buffer);
  });

  it('propagates 5xx upload failures so BullMQ can retry', async () => {
    const fault = Object.assign(new Error('boom'), {
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 },
    });
    const send = vi.fn().mockRejectedValue(fault);
    const adapter = s3PutObjectAdapter({ send } as unknown as Parameters<typeof s3PutObjectAdapter>[0]);
    await expect(
      adapter.putObject({
        bucket: 'b',
        key: 'k',
        body: Buffer.alloc(0),
        contentType: 'application/pdf',
      }),
    ).rejects.toBe(fault);
  });
});

// ─── 13L (DEM-268) format branches ──────────────────────────────────────────

describe('processReportRenderJob — 13L format branches', () => {
  beforeEach(() => {
    __resetBrowserSingletonForTest();
  });
  afterEach(() => {
    __resetBrowserSingletonForTest();
  });

  function baseRender(overrides: Partial<InMemoryRender> = {}): InMemoryRender {
    return {
      id: 'r-1',
      workspaceId: 'ws-1',
      format: 'pdf',
      status: 'queued',
      triggeredBy: 'u-1',
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      assetTarget: null,
      ...overrides,
    };
  }

  it('xlsx: dataset resolver + worksheet exporter çağrılır, asset insert edilir', async () => {
    const db = createFakeDatabase({ renders: [baseRender({ format: 'xlsx' })] });
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const publisher = createFakePublisher();
    const resolveReportDataset = vi.fn(async () => ({
      envelope: {
        generatedAt: '2026-05-24T12:00:00.000Z',
        scope: { kind: 'board', workspaceId: 'ws-1', boardId: 'b-1' },
        presetId: 'board.health',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [
          { id: 'activity-timeline', data: { events: [] }, comparisonData: null, error: null },
        ],
        restrictedScope: null,
        comparison: null,
        comparisonRange: null,
      },
      i18n: { 'reports.microReports.activityTimeline.title': 'Aktivite' },
      workspaceName: 'Acme',
      locale: 'tr-TR',
    } as unknown as Awaited<ReturnType<NonNullable<ReportRenderJobDeps['resolveReportDataset']>>>));
    const getWorksheetExporter = vi.fn(() => (_data: unknown) => ({
      columns: [{ header: 'X', key: 'x' }],
      rows: [{ x: 1 }],
    }));

    const result = await processReportRenderJob(
      { renderId: 'r-1' },
      {
        ...makeDeps({ db, launcher, storage, publisher }),
        resolveReportDataset,
        getWorksheetExporter,
      },
    );

    expect(result.outcome).toBe('completed');
    expect(resolveReportDataset).toHaveBeenCalledTimes(1);
    expect(getWorksheetExporter).toHaveBeenCalled();
    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0]!.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(storage.calls[0]!.key).toBe('workspace/ws-1/r-1.xlsx');
    expect(db._assets).toHaveLength(1);
    expect(db._assets[0]!.format).toBe('xlsx');
    // Puppeteer açılmamalı (xlsx pure exceljs)
    expect(launcher.launchBrowser).not.toHaveBeenCalled();
  });

  it('png: assetTarget zorunlu — yoksa unsupported_format', async () => {
    const db = createFakeDatabase({
      renders: [baseRender({ format: 'png', assetTarget: null })],
    });
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    const result = await processReportRenderJob(
      { renderId: 'r-1' },
      makeDeps({ db, launcher }),
    );
    expect(result.outcome).toBe('failed');
    expect(result.errorCategory).toBe('unsupported_format');
    expect(db._renders.get('r-1')?.errorMessage).toBe(
      'reports.errors.unsupported_format',
    );
    // Puppeteer launch edilmemeli
    expect(launcher.launchBrowser).not.toHaveBeenCalled();
  });

  it('png: assetTarget set ile widget URL ziyaret edilir, image/png upload', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const page = createFakePage({
      pdf: vi.fn(async () => Buffer.alloc(0)),
    });
    // page.screenshot field'ı testlerde mock'lı değil — render-png.ts kullanır.
    // Burada fake page'i augment ediyoruz.
    (page as unknown as { screenshot: ReturnType<typeof vi.fn> }).screenshot = vi.fn(
      async () => pngBytes,
    );
    (page as unknown as { setViewport: ReturnType<typeof vi.fn> }).setViewport = vi.fn(
      async () => undefined,
    );
    (page as unknown as { evaluate: ReturnType<typeof vi.fn> }).evaluate = vi.fn(
      async () => null,
    );
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const db = createFakeDatabase({
      renders: [
        baseRender({
          format: 'png',
          assetTarget: { microReportId: 'activity-timeline' },
        }),
      ],
    });
    const result = await processReportRenderJob(
      { renderId: 'r-1' },
      makeDeps({ db, launcher, storage }),
    );
    expect(result.outcome).toBe('completed');
    expect(storage.calls[0]!.contentType).toBe('image/png');
    expect(storage.calls[0]!.key).toBe(
      'workspace/ws-1/r-1-activity-timeline.png',
    );
    expect(db._assets[0]!.format).toBe('png');
    // Widget URL'i goto'da geçti
    const gotoUrl = page.goto.mock.calls[0]?.[0] as string;
    expect(gotoUrl).toContain('/reports/print/r-1/widget/activity-timeline');
    expect(gotoUrl).toContain('format=png');
  });

  it('svg: assetTarget set + DOM svg → image/svg+xml upload', async () => {
    const svgText = '<svg><circle/></svg>';
    const page = createFakePage({
      pdf: vi.fn(async () => Buffer.alloc(0)),
    });
    (page as unknown as { screenshot: ReturnType<typeof vi.fn> }).screenshot = vi.fn(
      async () => Buffer.alloc(0),
    );
    (page as unknown as { setViewport: ReturnType<typeof vi.fn> }).setViewport = vi.fn(
      async () => undefined,
    );
    (page as unknown as { evaluate: ReturnType<typeof vi.fn> }).evaluate = vi.fn(
      async () => svgText,
    );
    const browser = createFakeBrowser(page);
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const db = createFakeDatabase({
      renders: [
        baseRender({
          format: 'svg',
          assetTarget: { microReportId: 'activity-timeline' },
        }),
      ],
    });
    const result = await processReportRenderJob(
      { renderId: 'r-1' },
      makeDeps({ db, launcher, storage }),
    );
    expect(result.outcome).toBe('completed');
    expect(storage.calls[0]!.contentType).toBe('image/svg+xml');
    expect(storage.calls[0]!.key).toBe(
      'workspace/ws-1/r-1-activity-timeline.svg',
    );
    expect(db._assets[0]!.format).toBe('svg');
  });

  it('pdf branch (regression): mevcut PDF pipeline değişmedi', async () => {
    const db = createFakeDatabase({ renders: [baseRender({ format: 'pdf' })] });
    const browser = createFakeBrowser(createFakePage());
    const launcher = createFakeLauncher(browser);
    const storage = createFakeStorage();
    const result = await processReportRenderJob(
      { renderId: 'r-1' },
      makeDeps({ db, launcher, storage }),
    );
    expect(result.outcome).toBe('completed');
    expect(storage.calls[0]!.contentType).toBe('application/pdf');
    expect(storage.calls[0]!.key).toBe('workspace/ws-1/r-1.pdf');
    expect(db._assets[0]!.format).toBe('pdf');
  });
});
