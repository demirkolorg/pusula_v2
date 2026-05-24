/**
 * Raporlama E2E fixture (Faz 13R — DEM-274).
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §15, `e2e/reports.spec.ts`.
 *
 * Üç farklı kullanıcı bağlamı + composer + /reports sayfası için Page
 * Object'ler + render polling helper'ı. Faz 5D `realtime.fixture.ts` örüntüsü
 * (per-fixture browser context + per-context HTTP sign-in) reuse edilir.
 *
 * `userPage` / `viewerPage` / `alicePage` / `bobPage` her test başında temiz
 * cookie jar ile yeniden açılır — fixture'lar birbirlerinin oturumlarını
 * etkilemez, tabula rasa.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E } from './e2e-data';
import { signIn } from './auth.fixture';

export interface ReportPeer {
  context: BrowserContext;
  page: Page;
}

interface ReportFixtures {
  /** Workspace owner (`E2E.user`) — board admin tüm panolarda. */
  userPeer: ReportPeer;
  /** Workspace guest + board:viewer (`E2E.viewer`) — yalnız `e2e-board`'a salt-okunur erişim. */
  viewerPeer: ReportPeer;
  /** Workspace member + board:member (yalnız 3 panoda) — restricted-scope senaryosu. */
  alicePeer: ReportPeer;
  /** İkinci workspace member — stale rozeti senaryosunda ikinci peer. */
  bobPeer: ReportPeer;
}

export const test = base.extend<ReportFixtures>({
  userPeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.user);
    await use({ context, page });
    await context.close();
  },
  viewerPeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.viewer);
    await use({ context, page });
    await context.close();
  },
  alicePeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.alice);
    await use({ context, page });
    await context.close();
  },
  bobPeer: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, E2E.bob);
    await use({ context, page });
    await context.close();
  },
});

export { expect };

/** Workspace `/reports` merkez sayfası Page Object. */
export class ReportsPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(`/workspaces/${E2E.workspaceId}/reports`);
    // Page header'ı render olana kadar bekle (i18n + workspace query).
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  }

  async gotoTab(tab: 'saved' | 'scheduled' | 'renders'): Promise<void> {
    const suffix = tab === 'saved' ? '' : `?tab=${tab}`;
    await this.page.goto(`/workspaces/${E2E.workspaceId}/reports${suffix}`);
    await expect(
      this.page.getByTestId(`reports-tab-content-${tab}`),
    ).toBeVisible({ timeout: 15_000 });
  }

  newReportButton() {
    return this.page.getByTestId('reports-new-button');
  }

  /** "Yeni Rapor" CTA'ya bas + composer modal'ın açıldığını doğrula. */
  async openComposer(): Promise<ReportComposerPage> {
    await this.newReportButton().click();
    await expect(this.page.getByTestId('report-composer-dialog')).toBeVisible({
      timeout: 5000,
    });
    return new ReportComposerPage(this.page);
  }

  savedList() {
    return this.page.getByTestId('saved-reports-list');
  }

  scheduledList() {
    return this.page.getByTestId('scheduled-reports-list');
  }

  rendersList() {
    return this.page.getByTestId('renders-list');
  }
}

/**
 * Composer modal Page Object. Modal açıldıktan sonra kullanım için.
 * `embedded` mode için `data-testid="report-composer-embedded"` selector
 * kullan — bu PO modal-mode'a uyarlı.
 */
export class ReportComposerPage {
  constructor(public readonly page: Page) {}

  root() {
    return this.page.getByTestId('report-composer-dialog');
  }

  /**
   * Preset picker'da bir preset'e bas. Pusula preset-picker her preset için
   * `data-testid="report-preset-${preset.id}"` yayar; değer
   * @pusula/domain/reports preset registry'sinden gelir
   * (workspace.executive-summary, board.health, vb.).
   */
  async selectPreset(presetId: string): Promise<void> {
    const button = this.root().getByTestId(`report-preset-${presetId}`);
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();
  }

  /** Preset seçildikten sonra preview yüklenince ReportPanel görünür. */
  async waitForPreview(): Promise<void> {
    await expect(this.root().getByTestId('report-panel-header')).toBeVisible({
      timeout: 15_000,
    });
  }

  saveButton() {
    return this.root().getByTestId('report-action-save');
  }

  exportPdfButton() {
    return this.root().getByTestId('report-action-export-pdf');
  }

  exportXlsxButton() {
    return this.root().getByTestId('report-action-export-xlsx');
  }

  scheduleButton() {
    return this.root().getByTestId('report-action-schedule');
  }

  /**
   * Save flow: Kaydet butonuna bas → Popover açıl → title doldur → Kaydet'e bas.
   * Pusula save-popover Popover içinde render olduğu için modal root'unun
   * dışına çıkabilir (`PopoverContent`); bu nedenle `page` üzerinden
   * `report-save-title` input'unu ara, modal root'una sıkıştırma.
   */
  async saveAs(title: string, description?: string): Promise<void> {
    await this.saveButton().click();
    const titleInput = this.page.locator('#report-save-title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(title);
    if (description) {
      await this.page.locator('#report-save-description').fill(description);
    }
    // Popover içindeki Kaydet butonu (PermissionGatedButton değil, plain
    // Button — testid yok). En kolay seçici: aynı Popover içinde "Kaydet"
    // textli ikinci button (Popover içinde "Vazgeç" + "Kaydet" iki tane).
    await this.page.getByRole('button', { name: /^Kaydet$/ }).last().click();
  }

  /** Comparison toggle'ı aç (Senaryo 5 + 3). */
  async toggleComparison(): Promise<void> {
    // Comparison switch — Pusula ComparisonToggle 13G'de `Switch` kullanır;
    // role="switch" Radix ile yayınlanır. Modal root'unda tek switch.
    const sw = this.root().getByRole('switch').first();
    await sw.click();
  }

  /**
   * Modal'da restricted-scope rozeti görünür mü?
   * `RestrictedScopeBanner` `data-slot="restricted-scope-banner"` yayar.
   */
  restrictedBanner() {
    return this.root().locator('[data-slot="restricted-scope-banner"]');
  }
}

/**
 * Render polling — UI üzerinden. `/reports?tab=renders` sayfasında render
 * satırı (`render-row-${renderId}`) ve içindeki status rozeti
 * (`render-row-status-{queued|rendering|completed|failed}`) izlenir.
 *
 * Worker render ortalama 5-30s (yerel) — CI'da daha yavaş olabilir.
 * Default timeout 60s. Auto-refetch `listRenders` query `staleTime: 15_000`,
 * Playwright `expect.poll` default 100ms interval ile DOM'u zaten okuyor;
 * ek manuel refetch gerekirse `Yenile` butonu yok — sayfayı yenile.
 *
 * `expect.poll` yapısı: status==completed bekleyene kadar tekrar dene,
 * timeout doluyorsa fail. Pusula `realtime-board-sync.spec.ts` ile aynı
 * disiplin (`sleep` yok).
 */
export async function waitForRenderCompletedUi(
  page: Page,
  renderId: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  // `tab=renders` sayfasına git; useReportListRealtime socket event veya
  // listRenders periodic refetch sayesinde status güncellenir. Manuel
  // refetch gerekirse `page.reload()` ek olarak çağırılır (aşağıdaki
  // poll bunu denemiyor — staleTime 15s yeterli pencere açar).
  await page.goto(`/workspaces/${E2E.workspaceId}/reports?tab=renders`);
  // Render satırı ve completed status rozeti birlikte beklenir.
  await expect(
    page.locator(
      `[data-testid="render-row-${renderId}"] [data-testid="render-row-status-completed"]`,
    ),
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * Bir render'ın completed olduğunu DOM'dan teyit edip indirme butonunu
 * tetikle + Playwright download promise'iyle dosyayı yakala.
 * `data-testid="render-row-download"` butonu 2 tıkla çalışır: ilki signed
 * URL'i fetch eder, ikincisi `window.open(...)` yapar. Helper bu iki tıkı
 * sırayla atar.
 */
export async function downloadRenderAsset(
  page: Page,
  renderId: string,
): Promise<{ path: string; suggestedFilename: string }> {
  const row = page.locator(`[data-testid="render-row-${renderId}"]`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  const downloadBtn = row.getByTestId('render-row-download');
  // İlk tık — signed URL fetch (assetQuery.enabled=true).
  await downloadBtn.click();
  // İkinci tıkta `window.open()` çağrısı popup açar; Playwright bunu
  // download veya popup olarak yakalar.
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    downloadBtn.click(),
  ]);
  // Popup signed URL'i açar — content-disposition ile download tetiklenir
  // veya browser inline render eder. Pusula MinIO signed URL'i PDF için
  // `Content-Disposition: attachment` set'ler (Faz 13I).
  // `download` event yerine popup body kullan: signed URL'i ekran al.
  const url = popup.url();
  await popup.close();
  // Direct fetch ile içeriği indir (download event'i bazı response
  // header'larda tetiklenmiyor — pragmatik).
  const res = await page.request.get(url);
  if (!res.ok()) {
    throw new Error(`Asset fetch HTTP ${res.status()} for ${url}`);
  }
  const buffer = await res.body();
  const tmpPath = await writeBufferToTmp(buffer, `render-${renderId}.pdf`);
  return { path: tmpPath, suggestedFilename: `render-${renderId}.pdf` };
}

async function writeBufferToTmp(buffer: Buffer, fileName: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pusula-e2e-'));
  const file = path.join(dir, fileName);
  await fs.writeFile(file, buffer);
  return file;
}
