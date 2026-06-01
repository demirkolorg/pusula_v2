---
title: '16 — Raporlama Mimarisi'
description: 'Faz 13 raporlama sistemi: preset şablon registry + universal micro-report + scope adapter + on-demand SQL + Redis cache + Puppeteer PDF + Excel/PNG export + scheduled email.'
aliases:
  - 'Raporlama Mimarisi'
  - 'Reporting Architecture'
  - 'Faz 13 Mimari'
tags:
  - 'pusula'
  - 'architecture/reports'
  - 'architecture/puppeteer'
  - 'architecture/cache'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/domain/09-raporlama-kurallari|Raporlama Kuralları (domain)]]'
  - '[[docs/process/07-faz-13-raporlama-plani|Faz 13 Raporlama Planı (süreç)]]'
  - '[[docs/architecture/05-board-mekanigi|Board Mekaniği]]'
  - '[[docs/architecture/06-bildirim-altyapisi|Bildirim Altyapısı]]'
updated: 2026-05-25
---

# 16 — Raporlama Mimarisi

> Eksen: **tasarım / teknik**. Faz 13 (post-MVP epic, [DEM-256](https://linear.app/demirkol/issue/DEM-256))
> ana raporlama sistemi; Faz 14 (post-MVP epic, [DEM-290](https://linear.app/demirkol/issue/DEM-290))
> bağımsız ikinci PDF subsystem'i — §16.18.
> Domain kuralları → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md).
> Faz planı → [`../process/07-faz-13-raporlama-plani.md`](../process/07-faz-13-raporlama-plani.md) (Faz 13) ·
> [`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md) (Faz 14).

## 16.0 Karar Özeti (20 nokta)

| # | Karar | Sonuç |
|---|-------|-------|
| 1 | Kompozisyon | Sadece hazır preset şablonlar (composer UI yok) |
| 2 | Scope davranışı | Universal micro-report + scope adapter (kart→workspace auto-aggregation) |
| 3 | Hesaplama | On-demand SQL + Redis short-TTL cache + outbox-driven invalidation |
| 4 | Persistence | Ad-hoc + Saved + Scheduled (3 katman) |
| 5 | Katalog | 4 kategori (Aktivite & Üye / Durum & İlerleme / Zaman & Vade / Yapı & İçerik & Pano sağlığı), 30 micro-report |
| 6 | PDF pipeline | Worker + Puppeteer + `/reports/print/[id]` (web React render) |
| 7 | Saved erişim | Scope sahipliği + entity yetkisi senkron |
| 8 | Mobil | View + PDF indir (oluşturma web'de) |
| 9 | Filtre seti | Tarih + Üye + Etiket + Durum/kapsam |
| 10 | Scheduled cadence | Preset (günlük/haftalık/aylık + saat) |
| 11 | Yetki | viewer generate / admin save+schedule |
| 12 | PDF saklama | MinIO kalıcı + in-app indir + Resend link, 90g retention, son 5 sürüm |
| 13 | Preset yoğunluğu | Standart 4-6/seviye (toplam 19) |
| 14 | i18n | Key + TR locale dosyası (EN boş şablon) |
| 15 | Ek export | Excel (xlsx multi-sheet) + PNG/SVG (chart-level) |
| 16 | Rich text | EntitySummary tam Tiptap, diğer raporda plain özet |
| 17 | UI giriş | Hibrit (entity tab + workspace `/reports` merkez) |
| 18 | Aggregation izni | Erişmediği entity'leri filtrele + 'kısıtlı görünüm' rozeti |
| 19 | Comparison | Period-over-period delta (toggle, default kapalı) |
| 20 | Live update | Stale rozeti + manuel 'Yenile' |

Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) 2026-05-23 satırı.

## 16.1 Sistem Mimarisi (üst seviye)

```txt
┌──────────────────────────────────────────────────────────────────────────┐
│                               apps/web                                   │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐   │
│  │  Entity panel tabs      │  │  /workspace/[slug]/reports merkez    │   │
│  │  - Card.Raporlar        │  │  - Saved listesi                     │   │
│  │  - Board.Raporlar       │  │  - Scheduled listesi                 │   │
│  │  - List (board içi)     │  │  - Son render geçmişi                │   │
│  └─────────┬───────────────┘  └─────────┬────────────────────────────┘   │
│            │                            │                                │
│            ▼                            ▼                                │
│        ┌───────────────────────────────────────────┐                     │
│        │  <ReportComposer/> (preset + filtre UI)   │                     │
│        │  <ReportPanel/> (canlı görüntüleme)       │                     │
│        │  <MicroReport.*/> (universal contract)    │                     │
│        └───────────────┬───────────────────────────┘                     │
│                        │ tRPC                                            │
└────────────────────────┼─────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              packages/api (@pusula/api) — report router                  │
│   report.preview / report.save / report.delete / report.list             │
│   report.schedule.* / report.export / report.print.* (signed)            │
└──────────────┬──────────────────────────────────────────┬────────────────┘
               │                                          │
               ▼                                          ▼
┌──────────────────────────┐               ┌──────────────────────────────┐
│ packages/domain          │               │ packages/db (Drizzle)        │
│ - reports/types          │               │ - saved_reports              │
│ - reports/registry       │               │ - report_schedules           │
│ - reports/scope-adapter  │               │ - report_renders             │
│ - reports/permissions    │               │ - report_render_assets       │
│ - reports/comparison     │               │ - (read) activity_events,    │
│ - reports/presets        │               │   cards, lists, boards, …    │
└──────────────────────────┘               └──────────┬───────────────────┘
                                                      │
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            apps/worker                                   │
│   - report-render.queue    (Puppeteer → PDF → MinIO)                     │
│   - report-schedule.queue  (cron tick → enqueue render + Resend email)   │
│   - report-cache-invalidator (outbox event → Redis key purge)            │
│   - report-retention.queue (90g rotation, son 5 sürüm policy)            │
└──────────────────────────────────────────────────────────────────────────┘

                ┌────────────┐     ┌────────────┐     ┌────────────┐
                │  Postgres  │     │   Redis    │     │   MinIO    │
                └────────────┘     └────────────┘     └────────────┘
```

## 16.2 Paket / Katman Yerleşimi

| Paket | Sorumluluk |
|-------|------------|
| `@pusula/domain/reports` | Tip sözleşmeleri, `MicroReportManifest`, `PresetManifest`, scope adapter şeması, comparison delta hesabı, permission helper, i18n key sabitleri. **Saf TypeScript**, framework-bağımsız. |
| `@pusula/db/schema` | 4 yeni tablo (`saved_reports`, `report_schedules`, `report_renders`, `report_render_assets`) + migration |
| `@pusula/api/routers/report` | tRPC router: 12+ procedure. DB sorguları, cache layer, permission enforcement |
| `@pusula/api/services/report-data` | Her micro-report için DB query servisleri (`activity-timeline.ts`, `member-contribution.ts`, ...) |
| `@pusula/api/services/report-cache` | Redis cache (key format, TTL, invalidate) — outbox event handler aynı yerden çağrılır |
| `@pusula/ui/reports` | Micro-report React component'leri (`<ActivityTimeline/>`, `<MemberContribution/>`, …) — panel ve print sayfası AYNI component'i kullanır. shadcn-chart üstüne kurulu |
| `@pusula/ui/reports/primitives` | Ortak yapı taşları: `<KpiCard/>`, `<DeltaBadge/>`, `<EmptyState/>`, `<RestrictedScopeBanner/>`, `<ChartFrame/>`, `<DataTable/>`, `<MicroReportShell/>` |
| `apps/web/src/app/(app)/workspace/[slug]/reports` | Workspace merkez sayfası (saved/scheduled liste) + composer + panel route'ları |
| `apps/web/src/app/(internal)/reports/print/[id]/page.tsx` | Puppeteer'ın açtığı print sayfası (signed token ile) — print stylesheet'i, sayfa break'leri, no-chrome |
| `apps/web/src/components/reports/composer/*` | Preset seçim + filtre formu (shadcn Form + Zod) |
| `apps/web/src/components/reports/entity-tab/*` | Card/Board/List panel tab içeriği (kapsam-aware) |
| `apps/worker/src/jobs/report-render.ts` | Puppeteer headless render + MinIO upload + render kaydı |
| `apps/worker/src/jobs/report-schedule-tick.ts` | BullMQ cron job (every minute tick) → due schedules enqueue |
| `apps/worker/src/jobs/report-cache-invalidator.ts` | Notification outbox / realtime event consumer → ilgili cache key purge |
| `apps/worker/src/jobs/report-retention.ts` + `@pusula/api/lib/report-retention-policy.ts` | Daily cron (03:00 UTC) → saved son 5 sürüm hep tut + diğerleri (saved + ad-hoc) 90g sonrası MinIO + DB sil. Dry-run modu var. |
| `apps/mobile/app/(app)/(boards)/workspace-reports/[id].tsx` | Saved + scheduled liste (workspaceId param — Faz 13S) |
| `apps/mobile/app/(app)/(boards)/saved-reports/[id].tsx` | Detay (WebView → web `?embed=mobile` + PDF share — Faz 13S) |

## 16.3 Veritabanı Şeması (Drizzle, `casing: 'snake_case'`)

> **PK/FK konvansiyonu (2026-05-23 kararı):** Pusula'nın diğer tüm tabloları `primaryId()` (text + nanoid) PK + text FK kullanır. Reports tabloları bu konvansiyona uyar — `uuid` kullanılmaz. Karar: bütün şemaya yayılmış text/nanoid disiplinini bozmamak; FK tutarlılığı (workspaces.id text → workspaceId text) için tek doğru tip text. `@pusula/db/_common` helper'ları (`primaryId()`, `timestamps`, `archivedAt()`) reports tablolarında da kullanılır.

```ts
// packages/db/src/schema/reports.ts

export const reportScopeKindEnum = pgEnum('report_scope_kind',
  ['card', 'list', 'board', 'workspace']);

export const reportScheduleCadenceEnum = pgEnum('report_schedule_cadence',
  ['daily', 'weekly', 'monthly']);

export const reportRenderStatusEnum = pgEnum('report_render_status',
  ['queued', 'rendering', 'completed', 'failed', 'expired']);

export const reportRenderFormatEnum = pgEnum('report_render_format',
  ['pdf', 'xlsx', 'png']);

// Kaydedilmiş rapor (ad-hoc DEĞIL, kullanıcının "Kaydet" dediği)
export const savedReports = pgTable('saved_reports', {
  id: primaryId(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // scope sahipliği — entity yetkisi senkron
  scopeKind: reportScopeKindEnum().notNull(),
  // Polymorphic: card_id / list_id / board_id / workspace_id — FK yok (Pusula
  // FK kolonları gibi tüm ilgili tablolar text/nanoid id kullandığından tip
  // ortaktır, ama scope_id farklı tablolara işaret edebileceği için FK tutulmaz).
  scopeId: text().notNull(),

  presetId: text().notNull(),  // domain registry id (örn. 'board.health')
  title: text().notNull(),     // kullanıcı verdiği isim
  description: text(),

  // filtre snapshot'ı (Zod schema'lı, domain'de validate)
  filters: jsonb().$type<ReportFilters>().notNull(),

  // hangi micro-report'ları içerir (preset default'u + kullanıcı toggle'ları)
  microReports: jsonb().$type<MicroReportSelection[]>().notNull(),

  // comparison ayarı
  comparison: jsonb().$type<ComparisonConfig | null>(),

  // notNull → kullanıcı silmek için önce kayıtlı raporları arşivlemeli (orphan saved_report olmaz).
  createdBy: text().notNull().references(() => users.id, { onDelete: 'restrict' }),
  archivedAt: archivedAt(),
  ...timestamps,
}, (t) => [
  index('saved_reports_workspace_idx').on(t.workspaceId),
  index('saved_reports_scope_idx').on(t.scopeKind, t.scopeId),
]);

export const reportSchedules = pgTable('report_schedules', {
  id: primaryId(),
  savedReportId: text().notNull().references(() => savedReports.id, { onDelete: 'cascade' }),

  cadence: reportScheduleCadenceEnum().notNull(),
  // daily: { hour, minute }
  // weekly: { dayOfWeek (0-6), hour, minute }
  // monthly: { dayOfMonth (1-31 veya 'last'), hour, minute }
  cadenceConfig: jsonb().notNull(),

  timezone: text().notNull(),  // IANA (workspace default'undan)

  // alıcılar — Pusula user id'leri text/nanoid olduğundan dizi de text[]
  recipientUserIds: text().array().notNull().default(sql`ARRAY[]::text[]`),
  recipientEmails: text().array().notNull().default(sql`ARRAY[]::text[]`),

  isActive: boolean().notNull().default(true),
  lastRunAt: timestamp({ withTimezone: true }),
  nextRunAt: timestamp({ withTimezone: true }).notNull(),  // worker tick için indexli

  // saved_reports.createdBy ile aynı disiplin (notNull → restrict).
  createdBy: text().notNull().references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps,
}, (t) => [
  index('report_schedules_next_run_idx').on(t.nextRunAt).where(sql`${t.isActive} = true`),
]);

// Her render geçmişi (saved + scheduled + ad-hoc save sonrası)
export const reportRenders = pgTable('report_renders', {
  id: primaryId(),
  workspaceId: text().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  savedReportId: text().references(() => savedReports.id, { onDelete: 'cascade' }),
  scheduleId: text().references(() => reportSchedules.id, { onDelete: 'set null' }),

  // ad-hoc render için snapshot (savedReportId null olabilir)
  scopeKind: reportScopeKindEnum().notNull(),
  scopeId: text().notNull(),
  presetId: text().notNull(),
  filters: jsonb().$type<ReportFilters>().notNull(),
  comparison: jsonb().$type<ComparisonConfig | null>(),

  status: reportRenderStatusEnum().notNull().default('queued'),
  format: reportRenderFormatEnum().notNull(),

  // izole görünüm bilgisi: aggregation sırasında kaç entity dışlandı?
  restrictedScope: jsonb().$type<{
    excludedKind: string;
    excludedCount: number;
  } | null>(),

  // versiyon — saved report her render'da +1
  version: integer().notNull().default(1),

  // teslim — nullable + set null (history korunur, user silinince render kaydı kalır).
  triggeredBy: text().references(() => users.id, { onDelete: 'set null' }),
  triggerKind: text().notNull(),  // 'manual' | 'scheduled' | 'save' — DB-level CHECK ile sınırlanır

  startedAt: timestamp({ withTimezone: true }),
  completedAt: timestamp({ withTimezone: true }),
  errorMessage: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('report_renders_workspace_idx').on(t.workspaceId, t.createdAt),
  index('report_renders_saved_idx').on(t.savedReportId, t.version),
]);

// Render çıktı dosyaları (MinIO key'leri)
export const reportRenderAssets = pgTable('report_render_assets', {
  id: primaryId(),
  renderId: text().notNull().references(() => reportRenders.id, { onDelete: 'cascade' }),

  format: reportRenderFormatEnum().notNull(),
  s3Bucket: text().notNull(),
  s3Key: text().notNull(),
  byteSize: bigint({ mode: 'number' }).notNull(),
  checksum: text(),

  expiresAt: timestamp({ withTimezone: true }),  // retention worker bunu kullanır
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
```

Schema kuralları:

- 4 tablo, hepsi snake_case (`casing: 'snake_case'`).
- PK: `primaryId()` (text + nanoid, `_common.ts` helper'ı). FK kolonları `text()` — Pusula konvansiyonu (workspaces, boards, lists, cards, activity, notifications hep aynı).
- `timestamps` helper'ı `createdAt` + `updatedAt` (`$onUpdate`) sağlar; `archivedAt()` helper'ı nullable timestamptz.
- `restrictedScope` alanı — kullanıcı erişmediği panolar dışlanırsa raporda ve PDF'te rozet için.
- `version` — saved report'un her yeni render'ında artar; "son 5 versiyon hep tut" policy için.
- `nextRunAt` partial index sadece aktif schedule'lar — worker tick'i hızlı tarama.
- Array kolon default'u `sql\`ARRAY[]::text[]\`` (search.ts ile uyumlu).
- `filters` / `microReports` / `comparison` JSONB tipi domain registry'sinde tanımlı; 13C öncesi reports.ts'te `unknown` placeholder + TODO yorumu kullanılır, 13C inince gerçek tiplere bağlanır.
- Migration `pnpm db:generate` ile üretilir, `pnpm db:migrate` ile uygulanır.

## 16.4 Micro-Report Contract (sözleşmenin kalbi)

Her micro-report tek bir TypeScript interface'i uyar; UI, API, PDF, Excel hepsi bu sözleşmeyi kullanır.

```ts
// packages/domain/src/reports/types.ts

export type ReportScopeKind = 'card' | 'list' | 'board' | 'workspace';

export type ReportScope =
  | { kind: 'card'; cardId: string; boardId: string; workspaceId: string }
  | { kind: 'list'; listId: string; boardId: string; workspaceId: string }
  | { kind: 'board'; boardId: string; workspaceId: string }
  | { kind: 'workspace'; workspaceId: string };

// idSchema = `z.string().min(1).max(64)` — Pusula `@pusula/domain/schemas/common`
// nanoid-style entity id'leri için ortak. 13B ADR (2026-05-23) gereği reports
// alanı da bu konvansiyona uyar; `z.string().uuid()` Pusula'da yalnız
// `clientMutationId` (gerçek UUID v4) için kullanılır.
export const reportFiltersSchema = z.object({
  range: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('preset'), preset: z.enum([
      'today', 'yesterday', 'last7d', 'last30d', 'last90d',
      'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear',
    ]) }),
    z.object({ kind: z.literal('custom'), from: z.string().datetime(), to: z.string().datetime() }),
  ]),

  members: z.object({
    userIds: z.array(idSchema),
    relations: z.array(z.enum(['assignee', 'actor', 'watcher'])),
  }).optional(),

  labels: z.object({
    labelIds: z.array(idSchema),
    mode: z.enum(['and', 'or']),
  }).optional(),

  scopeFilter: z.object({
    cardStatus: z.array(z.enum(['open', 'completed', 'archived'])).optional(),
    includeArchivedLists: z.boolean().default(false),
    listIds: z.array(idSchema).optional(),
    boardIds: z.array(idSchema).optional(),
    checklistStatus: z.enum(['all', 'completed', 'incomplete']).optional(),
  }).optional(),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const comparisonConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['previousPeriod', 'sameLastYear']),  // V1: sadece previousPeriod
});

export type ComparisonConfig = z.infer<typeof comparisonConfigSchema>;

// `MicroReportManifest<TData>` 13C kararı ile ikiye bölündü (split data/ui):
//   - `MicroReportDataManifest<TData>` → `@pusula/domain/reports/registry` (saf TS,
//     React/Drizzle bağımlılığı yok)
//   - `MicroReportUiManifest<TData>` → `@pusula/ui/reports` (Component +
//     PrintComponent + worksheetExport)
//   - `query` (ScopeAdapter<TData>) tipi domain'de, implementasyonu
//     `@pusula/api/services/report-data/*` (13D, Drizzle context ister)
//
// Gerekçe: framework-bağımsız domain disiplini ([CLAUDE.md §3] —
// `@pusula/domain` UI/DB bağımlılığı tutmaz). Match için her iki manifest aynı
// `id` ile registry'de birleştirilir.
export interface MicroReportDataManifest {
  id: string;
  i18nKey: string;
  category: MicroReportCategory;
  supports: ReadonlyArray<ReportScopeKind>;
  defaultLayout: { colSpan: 1 | 2 | 3 | 4; minHeight: number };
  supportsComparison: boolean;
  supportsCsv: boolean;
  supportsPngExport: boolean;
  emptyStateKey: string;
}

// `@pusula/ui/reports` (Faz 13F)
// interface MicroReportUiManifest<TData> {
//   id: string;
//   Component: React.ComponentType<MicroReportProps<TData>>;
//   PrintComponent?: React.ComponentType<MicroReportProps<TData>>;
//   worksheetExport?(data: TData): { columns: ExcelColumn[]; rows: unknown[][] };
// }

export interface ScopeAdapter<TData> {
  card?(ctx: QueryCtx, scope: Extract<ReportScope, { kind: 'card' }>, f: ReportFilters): Promise<TData>;
  list?(ctx: QueryCtx, scope: Extract<ReportScope, { kind: 'list' }>, f: ReportFilters): Promise<TData>;
  board?(ctx: QueryCtx, scope: Extract<ReportScope, { kind: 'board' }>, f: ReportFilters): Promise<TData>;
  workspace?(ctx: QueryCtx, scope: Extract<ReportScope, { kind: 'workspace' }>, f: ReportFilters): Promise<TData>;
}

export interface MicroReportProps<TData> {
  data: TData;
  comparisonData?: TData | null;
  scope: ReportScope;
  filters: ReportFilters;
  restricted?: { excludedKind: string; excludedCount: number };
  mode: 'panel' | 'print';
}
```

Tasarım vaatleri:

- `query` ile `Component` aynı `TData` tipini paylaşır → server-client şekil garantisi.
- `mode='print'` propu component'lere PDF kipinde olduğunu söyler (animasyon kapat, tooltip yok, sayfa break-inside avoid).
- `supports` ile katalog seviye-spesifik filtrelenir (örn. `burndown` sadece board+workspace).
- `comparisonData` null değilse component'in delta'yı kendisi sunması beklenir.

## 16.5 Scope Adapter — Auto-Aggregation

```ts
export const activityTimelineQuery: ScopeAdapter<ActivityTimelineData> = {
  async card(ctx, scope, f) {
    return ctx.db.query.activityEvents.findMany({
      where: and(
        eq(activityEvents.cardId, scope.cardId),
        between(activityEvents.createdAt, ...resolveRange(f.range)),
        ...buildMemberFilter(f.members, 'actor'),
      ),
      orderBy: desc(activityEvents.createdAt),
    });
  },

  async list(ctx, scope, f) {
    return ctx.db.query.activityEvents.findMany({
      where: and(
        inArray(activityEvents.cardId,
          ctx.db.select({ id: cards.id }).from(cards).where(eq(cards.listId, scope.listId))
        ),
        between(activityEvents.createdAt, ...resolveRange(f.range)),
        ...buildMemberFilter(f.members, 'actor'),
      ),
    });
  },

  async board(ctx, scope, f) {
    // permission ile kısıtlı liste id'leri
    const accessibleListIds = await ctx.permissions.accessibleListsInBoard(scope.boardId);
    return ctx.db.query.activityEvents.findMany({
      where: and(
        inArray(activityEvents.cardId,
          ctx.db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, accessibleListIds))
        ),
        between(activityEvents.createdAt, ...resolveRange(f.range)),
        ...buildLabelFilter(f.labels),
      ),
    });
  },

  async workspace(ctx, scope, f) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(scope.workspaceId);
    return ctx.db.query.activityEvents.findMany({
      where: and(
        eq(activityEvents.workspaceId, scope.workspaceId),
        inArray(activityEvents.boardId, accessibleBoardIds),
      ),
    });
  },
};
```

Aggregation kuralları:

1. `ctx.permissions.accessibleBoards/Lists` her zaman session user'a göre filtreleme yapar.
2. Toplam alt entity sayısı vs erişilebilir alt entity sayısı `restrictedScope` bilgisi olarak rapor envelope'una eklenir → UI/PDF rozeti gösterir.
3. Workspace admin için bu fark sıfır olur (rozet görünmez).
4. Filtreler (üye/etiket/durum) hep alt seviyede uygulanır; üst seviye query'leri composition'la kurulur (`inArray` subquery).

## 16.6 tRPC API Sözleşmesi

```ts
// packages/api/src/routers/report.ts

export const reportRouter = createTRPCRouter({
  catalog: protectedProcedure
    .input(z.object({ scopeKind: reportScopeKindSchema }))
    .query(({ input }) => listAvailablePresetsAndMicroReports(input.scopeKind)),

  preview: protectedProcedure
    .input(z.object({
      scope: reportScopeSchema,
      presetId: z.string(),
      filters: reportFiltersSchema,
      comparison: comparisonConfigSchema.optional(),
      microReportOverrides: z.array(microReportSelectionSchema).optional(),
    }))
    .query(async ({ ctx, input }) => renderReportDataset(ctx, input)),

  save: adminProcedure.input(savedReportCreateSchema).mutation(/* */),
  listSaved: protectedProcedure.input(savedReportListSchema).query(/* */),
  getSaved: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(/* */),
  update: adminProcedure.input(savedReportPatchSchema).mutation(/* */),
  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* */),
  archive: adminProcedure.input(z.object({ id: z.string().uuid(), archived: z.boolean() })).mutation(/* */),

  export: protectedProcedure
    .input(reportExportSchema)
    .mutation(/* BullMQ job + render kaydı, renderId döner */),

  getRender: protectedProcedure.input(z.object({ renderId: z.string().uuid() })).query(/* */),
  listRenders: protectedProcedure.input(reportRenderListSchema).query(/* */),

  schedule: createTRPCRouter({
    create: adminProcedure.input(scheduleCreateSchema).mutation(/* */),
    update: adminProcedure.input(scheduleUpdateSchema).mutation(/* */),
    delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* */),
    list: protectedProcedure.input(z.object({ savedReportId: z.string().uuid() })).query(/* */),
    runNow: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* */),
  }),

  print: createTRPCRouter({
    requestToken: workerOnlyProcedure
      .input(z.object({ renderId: z.string().uuid() }))
      .mutation(/* JWT 5dk exp */),
    verifyToken: publicProcedure
      .input(z.object({ renderId: z.string().uuid(), token: z.string() }))
      .query(/* dataset döner (cache'ten) */),
  }),
});
```

Procedure tipleri:

- `protectedProcedure` — session var, viewer+.
- `adminProcedure` — yeni helper, scope'a göre board:admin / workspace:admin garantiler.
- `workerOnlyProcedure` — worker'ın `WORKER_SHARED_SECRET` header'ı.
- Her mutation `clientMutationId` taşır ([`05-board-mekanigi.md`](05-board-mekanigi.md) §5.2 disiplini).

## 16.7 Cache Stratejisi

**Redis key formatı:**

```
report:dataset:v1:{scopeKind}:{scopeId}:{presetId}:{hash(filters+comparison+userId)}
```

- `hash` = SHA-1 stable JSON serialization (Faz 13E DEM-261; 13D ilk turunda FNV-1a 32-bit kullanılmıştı, security review L1 doğrultusunda 16-hex (~64-bit) SHA-1'e taşındı).
- `userId` cache key'inde çünkü permission-filtered (her kullanıcının görünen veri farklı).
- Workspace admin için ayrı bir key (suffix `:admin`) → tüm üyeler aynı veriye düşer.
- **Segment whitelist:** scopeId + presetId `^[A-Za-z0-9._-]{1,64}$` (DEM-261 security HIGH-1). Redis glob meta (`*`, `?`, `[`, `]`) + field separator (`:`) defense-in-depth ile reddedilir; `idSchema` bir gün regex eklerse redundant olur.

**TTL:**

| Scope | TTL |
|-------|-----|
| Card | 60s |
| List | 90s |
| Board | 180s |
| Workspace | 300s |
| PDF render dataset | 600s |

**Invalidation (event-driven):**

Worker `apps/worker/src/queues/report-cache-invalidator.ts`:

- `notification_outbox` / `realtime_events` tablolarındaki yeni event'leri consume eder (Faz 5/6 worker zaten consume ediyor — ek handler).
- Event'ten etkilenen scope'ları bul (ör. `card.moved` → cardId + listIds + boardId + workspaceId).
- `SCAN` ile ilgili pattern'leri sil:
  ```txt
  report:dataset:v1:card:<cardId>:*
  report:dataset:v1:list:<listId>:*
  report:dataset:v1:board:<boardId>:*
  report:dataset:v1:workspace:<workspaceId>:*
  ```
- Redis `SCAN COUNT 100` batch silme.
- **SCAN+DEL atomic değil:** iteration sırasında yeni `SET` gelirse o key invalidation'dan kaçar; TTL backstop (60-300s) eninde sonunda temizler. "Stale + fresh karışık" pencere kabul edildi (DEM-261 security LOW-1).
- **Workspace role değişiklikleri (kabul edilen TTL pencere):** Admin → member demote sonrası `:admin` suffix'li cache key max `workspace=300s` / `pdf=600s` boyunca eski admin-view'u servis edebilir. Bu trade-off bilgi sızıntısı disiplini (§9.4) içinde kabul edilebilir kayıp olarak işaretli; ileride `workspace_members` mutation'ından invalidator hook eklenebilir (DEM-261 security MED-1, follow-up).

**"Stale" rozeti (Faz 13N — DEM-270):**

- Panel açıkken socket: `report.invalidated` event'i (scope tabanlı) `workspace:{workspaceId}` room'una publish edilir.
- **Workspace room üyeliği:** Faz 5A `board:join` ile simetrik bir `workspace:join` handshake'i (`apps/api/src/socket/rooms.ts`, DEM-270) ile sağlanır. Server `resolveWorkspaceMembership` ile `workspace_members` satırını okur, üye değilse `Forbidden`. Board-only kullanıcı (workspace üyesi olmayan ama board:explicit-viewer) workspace room'a giremez — workspace scope rapor da göremediği için event akışı tutarlı.
- UI bu event'i dinler: `useReportStale` hook (`apps/web/src/lib/realtime/use-report-stale.ts`) `workspace:{id}` room'una `workspace:join` emit eder, `report.invalidated` payload'unu `affectsWatchedScope` saf fonksiyonuyla açık raporun scope'una göre eşler.
- Eşleşirse `<StaleBadge>` görünür; **otomatik refresh YOK** (§9.12 — chart zıplaması engellensin). Kullanıcı "Yenile" basana kadar mevcut görünüm korunur.
- "Yenile" → TanStack `report.preview` query invalidate → cache miss → fresh dataset → rozet kaybolur.
- Disconnect sırasında rozet sıfırlanmaz; reconnect sonrası `connect` event'inde room'a yeniden join + opsiyonel "biriken değişiklikler" hatırlatması.
- Burst event flood için hook-level guard: `isStale` zaten `true` ise tekrar setState yapılmaz (re-render maliyeti sıfır).

**Event payload sözleşmesi** (`ReportInvalidatedSocketEvent` — `@pusula/api/lib/report-invalidation`):

```ts
{
  at: string;                            // ISO yayın anı
  scopeKinds: Array<'card'|'list'|'board'|'workspace'>;
  workspaceId: string;                   // root match
  boardId?: string;
  listId?: string;
  cardId?: string;
  eventType: string;                     // 'card.moved' vb. (audit)
}
```

**`affectsWatchedScope` semantiği (V1):**

| Açık rapor scope'u | Eşleştiği event'ler |
|--------------------|---------------------|
| `workspace` | Aynı `workspaceId` payload'unun **tüm** event'leri (workspace raporları her şeyi aggregate eder) |
| `board` | Aynı `boardId` payload'u (board-level + altındaki list/card event'leri payload'a `boardId` taşır) |
| `list` | Aynı `listId` payload'u — V1: card.* event'leri listId taşımıyorsa list-scope stale **tetiklenmez** (cache invalidator listId pattern'i kapsar ama scope adapter pattern'i daha gevşek). V2: 13E payload'una `listId` her zaman ekle. |
| `card` | Aynı `cardId` payload'u |

## 16.8 PDF Render Pipeline

```txt
1. Kullanıcı PDF İndir butonuna basar
   → tRPC report.export({ source, format: 'pdf' })
   → DB: report_renders.insert(status='queued')
   → BullMQ: 'report-render' kuyruğuna { renderId } job
   → Socket'e 'report.render.queued' event (user room)

2. Worker job consume eder
   → status='rendering' update
   → tRPC report.print.requestToken (worker secret) → JWT (renderId + 5dk exp)
   → Puppeteer launch (singleton cluster, max 3 page concurrent)
   → page.goto('${APP_URL}/reports/print/<renderId>?token=<jwt>',
              { waitUntil: 'networkidle0' })
   → page sayfası: tRPC print.verifyToken → dataset alır, <ReportDocument/> render,
                   "ready" flag DOM'a yazar
   → page.waitForFunction('window.__reportReady === true', { timeout: 30s })
   → page.pdf({
       format: 'A4',
       printBackground: true,
       margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
       headerTemplate: '<div>...</div>',
       footerTemplate: '<div>Sayfa <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
       displayHeaderFooter: true,
     })
   → MinIO upload (s3 SDK):
     bucket=pusula-reports, key=workspace/<wsId>/<renderId>.pdf
   → DB: report_renders.update(status='completed', completedAt),
         report_render_assets.insert(...)
   → Socket: 'report.render.completed' { renderId, signedUrl (1sa) }
   → Schedule'dan tetiklendiyse Resend ile email gönder (link, attachment değil)

3. UI listener
   → Loading state → tamam → toast "Rapor hazır [İndir]"
   → Buton tıklanınca signed URL ile direkt MinIO'dan indir
```

**Print sayfası (`apps/web/src/app/(internal)/reports/print/[id]/page.tsx`):**

- Public route (auth middleware'den hariç), ama tRPC `print.verifyToken` token'sız reddeder.
- Tüm chrome (header, sidebar, mobil nav) yok — minimal HTML iskeleti.
- `print.css` ile sayfa break'leri: `.micro-report { page-break-inside: avoid; }`.
- Chart'lar render olur olmaz `window.__reportReady = true`.
- Recharts animasyon: `<RechartsResponsiveContainer>` `isAnimationActive={false}` (mode=print).

**Puppeteer worker kurulumu (Faz 13I — DEM-265 implementasyonu):**

- Docker image: paylaşılan `apps/api/Dockerfile` (api + worker tek image, CLAUDE.md §3) runner stage'ine `apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont` + `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` env. **`@sparticuz/chromium` Lambda-glibc bundle; Alpine musl üzerinde çalışmaz** — Puppeteer Docker pattern'i system chromium. ~150 MB layer cost.
- `puppeteer-core` ^24 (worker `package.json` dependency).
- Browser singleton: `getOrLaunchBrowser` worker process boyunca tek instance reuse; her job yeni `page` açar; `disconnected` event'inde cache invalidate. SIGTERM/SIGINT'te graceful `closeBrowser()`.
- Worker concurrency: `2` (compose memory 1 GB, page başına ~200 MB; spec §16.8 "max 3 paralel page" guard).
- `pageReadyTimeoutMs`: 30 s default (testlerde 1 ms).
- `page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })`.

**Print sayfası — i18n (Faz 13I geçici çözüm):**

13Q (DEM-266) tam i18n provider gelene kadar `report.print.verifyToken` server-side fallback yapar: `packages/api/src/lib/report-i18n-tr.ts` (`REPORT_PRINT_I18N_TR`) Türkçe stub map'i dataset envelope'una `payload.i18n: Record<string, string>` olarak gömer. UI client `t(key, params) = payload.i18n[key] ?? key` resolver'ı + `{{placeholder}}` interpolation'la çalışır. Eksik key → key string'i ekrana yansır (kullanıcı için çirkin ama PDF üretilir). 13Q'da bu dosya silinir, `next-intl` provider'a bağlanır.

**Worker → API guvenliği:**

- `WORKER_SHARED_SECRET` env (min 32 char, `apps/api` + `apps/worker` paylaşımlı). `defaultPrintTokenResolver` POST `/trpc/report.print.requestToken` çağrısında `x-worker-secret` header'ı gönderir.
- `apps/api` `buildTrpcContext` header'ı **timing-safe** karşılaştırır (`crypto.timingSafeEqual`); eşleşmezse `ctx.workerSharedSecret` undefined → procedure UNAUTHORIZED. String compare'in length-time leak'i `timingSafeEqual` ile elimine.
- Print token: HMAC-SHA256, 5 dakika TTL, renderId bind'li (cross-render leak engeli — `expectedRenderId` verify).

**Hata yolu disiplini:**

- `unsupported_format`, `print_token_failed`, `pdf_render_failed`, `storage_upload_failed`, `db_commit_failed` kategorileri.
- DB row `status='failed'` + `errorMessage` (PII-safe, kategori başlığı). Pub/sub `report.render.failed` event'i `apps/api/socket` bridge'i tarafından `user:{triggeredBy}` room'una gider.
- Format mismatch'i (xlsx/png — 13L/13M'de gelecek) BullMQ retry'ı tetiklemez (kalıcı user error); transient hatalar (token/render/upload) `throw` ile retry'lanır.

**MinIO bucket:**

- Ayrı bucket: `S3_REPORTS_BUCKET` (default `pusula-reports`) — attachment bucket'ından (`S3_BUCKET`) izole, lifecycle politikaları farklı (rapor 90g + son 5 sürüm policy 13P / DEM-272).
- Asset key: `workspace/<workspaceId>/<renderId>.pdf`. `report_render_assets.expires_at = NOW() + 90g` set edilir (13P retention worker'ı bunu kullanır).
- **Service account policy zorunluluğu (DEM-276 post-mortem 2026-06-01):** `pusula-app` IAM policy'sine `pusula-reports/*` + `pusula-reports` resource'ları `s3:GetObject/PutObject/DeleteObject` + `s3:GetBucketLocation/ListBucket` action'larıyla **manuel** eklenmeli. İlk deploy'da bu adım atlandığı için PDF render 4 gün boyunca `storage_upload_failed` ile fail oldu (üstteki diğer bug katmanları gizledi). Sonraki deploy'larda `docker-compose.yml`'daki `minio-setup` servisi bu işi idempotent yapacak şekilde genişletilmeli (açık takip işi DEM-276 post-mortem yorumunda).

### Server Component fetch akışı (post-mortem 2026-06-01)

Print sayfası (`apps/web/.../reports/print/[id]/page.tsx`) **Server Component**'tir; `report.print.verifyToken` çağrısını **server-side fetch** ile yapar (browser-side değil). İki önemli yapısal kural — DEM-276 incident'i bunların ikisini de ihlal etmişti:

1. **Server-side fetch internal Docker network kullanır** — `process.env.INTERNAL_API_URL` (default `http://api:3001`) öncelikli; yoksa `env.NEXT_PUBLIC_API_URL`'a düşer. Browser bundle build-time'da `NEXT_PUBLIC_API_URL=https://api.<domain>` ile inline olmalı (Cloudflare/Traefik üzerinden trip), Server Component **runtime'da internal hostname'i tercih eder** (hızlı + reverse-proxy bağımsız). `compose.prod.yml` `web` servisinin `environment:` bloğunda **hem** `INTERNAL_API_URL=http://api:3001` **hem** runtime `NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}` set edilmeli — runtime'da yoksa `env.ts` default'u `http://localhost:3001`'a düşer ve ECONNREFUSED olur. Worker `defaultPrintTokenResolver` / `defaultReportDatasetResolver` da `INTERNAL_API_URL` env'ini aynı şekilde kullanır.
2. **`URLSearchParams.set('input', ...)` çağrısında MANUEL `encodeURIComponent` ÇAĞIRMA** — `set()` zaten URL encode eder; manuel ekleme `%` karakterlerini `%25` yapıp double-encode'a yol açar → API JSON parse fail → 400 Bad Request. Helper sadece `JSON.stringify({ json: input })` döndürmeli, encode etmemeli. Web (`page.tsx` + `widget/.../page.tsx`) ve worker (`report-dataset-resolver.ts`) bu disipline uymalı.

**Auth disiplini — `verifyToken` public route'tur, `requestToken` worker-only:** `apps/api/src/trpc.ts` context build'inde iki ayrı alan: `workerSharedSecret` (`x-worker-secret` header doğrulamasıyla set, sadece `requestToken` için) ve `printVerifyTokenSecret` (env'den header check'siz set, `verifyToken` için). Aynı `WORKER_SHARED_SECRET` env değerinden gelir ama context separasyonu Server Component fetch'inin (header yollayamaz) auth fail'ini engeller. `verifyToken`'ın HMAC token zaten authentic — sahiplik ek auth gerektirmez.

## 16.9 Excel & PNG Export

**Excel (xlsx):**

- `exceljs` (server-side, ~115KB).
- Her micro-report kendi `worksheetExport(data): { columns, rows }` fonksiyonu sağlar (manifest'in opsiyonel metodu).
- Worker'da `report-render` queue içinde format='xlsx' branch'i; Puppeteer atlanır.
- Multi-sheet: rapor metadata sheet'i + her micro-report ayrı sheet.
- Stil: workspace logo (opsiyonel), başlık satırı bold + dolu, KPI rakamları sayı formatı.

**PNG/SVG (chart-level):**

- `assetTarget: { microReportId }` ile tek bir micro-report seçilir.
- Pipeline: Puppeteer print sayfasının özel route'u `/reports/print/<id>/widget/<microReportId>` → tek widget render → `page.screenshot({ omitBackground: true })`.
- SVG: chart kütüphanesi recharts SVG ürettiği için DOM'dan `outerHTML` çıkarmak yeterli (route'a `?format=svg`).

## 16.10 UI Akışı

### 16.10.1 Composer Modal

```txt
┌─ Rapor Oluştur — Pano: "Ürün Sprint 23" ───────────────┐
│ Şablon Seç                                              │
│ ┌──────────────┬──────────────┬──────────────┐          │
│ │ Pano Sağlık  │ Sprint Özeti │ Üye Performans│         │
│ ├──────────────┼──────────────┼──────────────┤          │
│ │ Vade & Risk  │ Pano Akışı   │ Etiket Dağ.  │          │
│ └──────────────┴──────────────┴──────────────┘          │
│                                                         │
│ Filtreler                                               │
│  Tarih:    [Son 30 gün         ▾]                       │
│  Üyeler:   [Tümü   ▾] [Atanan/Aktör/Watcher ▾]          │
│  Etiketler:[Hiçbiri▾] (○ AND ◉ OR)                      │
│  Durum:    [☑ Açık  ☑ Tamamlanan  ☐ Arşivli]            │
│  Listeler: [Tümü   ▾]  (bu pano içi)                    │
│                                                         │
│  Karşılaştır: [☑] Önceki 30 günle delta göster           │
│                                                         │
│  [Önizle]      [Kaydet (admin)]    [PDF İndir]          │
└─────────────────────────────────────────────────────────┘
```

### 16.10.2 Panel Görünümü

`/workspace/[slug]/reports/[id]` veya inline tab:

```txt
┌─ Pano Sağlık Raporu — Ürün Sprint 23 ──────────────────┐
│ Filtreler: Son 30g • Tümü • OR • Açık+Kapalı            │
│ [Yenile] [Stale ⚠] [PDF] [Excel] [Zamanla] [⋯]          │
├─────────────────────────────────────────────────────────┤
│ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐                        │
│ │ 142 │ │ 38% │ │  7  │ │ 4.2g│                        │
│ │Aktif│ │Tamam│ │Geciken│ Ort.│                        │
│ │ ↑12%│ │ ↑4% │ │ ↓2  │ │↑0.3g│                        │
│ └─────┘ └─────┘ └─────┘ └─────┘                        │
│                                                         │
│ Status Dağılımı            Aging Raporu                 │
│ [pie chart]                [bar histogram]              │
│                                                         │
│ Aktivite Heatmap (gün × saat)                           │
│ [heatmap]                                               │
│                                                         │
│ Geciken Kartlar                                         │
│ [table: kart, atanan, vade, etiket]                     │
└─────────────────────────────────────────────────────────┘
```

### 16.10.3 Workspace `/reports` Merkez Sayfası

- 3 sekme: **Kaydedilmiş** / **Zamanlanmış** / **Son Render'lar**.
- Filtreleme: scope (kart/liste/pano/ws), preset, oluşturan.
- Hızlı eylemler: aç, çoğalt (admin), sil (admin), zamanla (admin), yeni render.

### 16.10.4 Entity Panel Tab'ları

- Card detail panel: `Detay | Üyeler | Etiketler | Checklist | Raporlar`.
- Board top-bar: `Tahta | Liste | Takvim | Raporlar | Otomasyon | Ayarlar`.
- List: dedicated tab yok; pano `Raporlar` tab'ında list-scope filtre seçilir (alt-menu).
- Workspace settings: `Genel | Üyeler | Raporlar | Faturalandırma(yok)`.

### 16.10.5 Stale ve Restricted Rozetleri

- `<StaleBadge variant="warning">Veriler güncellendi — [Yenile]</StaleBadge>` üst sağ köşe.
- `<RestrictedScopeBanner>` üstte sarı şerit: "Bu raporun 2 panosu görünürlüğünüz dışında — kısıtlı görünüm."

## 16.11 Permission Enforcement Noktası

Permission helper kanonik konum: `@pusula/domain/reports/permission.ts`. tRPC procedure'leri bu helper'ı server-side çağırır. Detay matrisi → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md) §9.5.

Çekirdek kural: kim olursa olsun, kullanıcının erişebildiği alt entity'ler dışındaki veri raporlama envelope'una eklenmez — sayım dahil. Bu, "bilgi sızıntısı yok" garantisidir.

## 16.12 i18n Stratejisi

Faz 13Q (DEM-273) ile tek-kaynak JSON locale + ESLint hardcode yasağı +
CI sync check kuruldu.

```
packages/domain/src/reports/i18n-keys.ts        (REPORT_I18N_KEYS — canonical key map)
apps/web/src/locales/tr/reports.json            (TR çeviri — canonical, tam dolu)
apps/web/src/locales/en/reports.json            (EN çeviri — V1 quick translation)
packages/api/src/lib/locales/tr-reports.json    (server-side mirror, byte-identical)
packages/api/src/lib/locales/en-reports.json    (server-side mirror, byte-identical)
packages/api/src/lib/report-i18n-tr.ts          (flat map — `flattenLocaleTree` JSON'dan üretir)
apps/web/src/components/reports/hooks/use-report-i18n.ts (client-side resolver — JSON'dan)
```

**Akış:**

```
UI bileşeni: t('reports.composer.title.create')
  ↓
useReportI18n hook → apps/web/src/locales/tr/reports.json (static JSON import)
  ↓  resolveKey('reports.composer.title.create') = composer.title.create lookup
  ↓  interpolate(template, params) — single-brace `{name}` regex
  ↓
"Yeni Rapor Oluştur"  (eksikse key string'i ekrana — debug fallback)
```

**Print pipeline (server-side):**

```
report.print procedure
  ↓ envelope payload'a `i18n: REPORT_PRINT_I18N_TR` ekle
  ↓ REPORT_PRINT_I18N_TR = flattenLocaleTree(tr-reports.json) (Object.freeze)
  ↓
print sayfası (apps/web/.../report-print-client.tsx)
  ↓ makeTranslator(payload.i18n) — aynı `{name}` single-brace
```

**Key kuralı (REPORT_I18N_KEYS canonical map):**

- `reports.presets.<presetIdCamel>.title` / `.description` (19 preset — `card.overview` → `cardOverview`)
- `reports.microReports.<microIdCamel>.title` / `.emptyState` (30 micro-report — `activity-timeline` → `activityTimeline`)
- `reports.filters.range.<presetId>` (9 range preset)
- `reports.filters.members.relations.<assignee|actor|watcher>`
- `reports.filters.labels.mode.<and|or>`
- `reports.filters.scope.cardStatus.<open|completed|archived>`
- `reports.actions.<preview|save|update|delete|duplicate|refresh|schedule|...>`
- `reports.actions.export.<pdf|xlsx|png|svg|image>`
- `reports.delta.<up|down|neutral|new>`
- `reports.restricted.banner` / `.explanation`
- `reports.stale.badge` / `.message`
- `reports.render.status.<queued|...>` / `.format.<pdf|xlsx|...>`
- `reports.schedule.cadence.<daily|weekly|monthly>` / `.recipient.<user|email>`
- `reports.comparison.toggle` / `.mode.<previousPeriod|sameLastYear>`
- `reports.email.subject` / `.greeting` / `.body` / `.cta` / `.footer`
- `reports.permission.<...>` — `canPerformReportAction` reason key'leri

**Eksiklikte fallback:** key bulunamazsa key string'i basılır (dev'de debug
için görünür). CI'da `pnpm check-i18n-keys` + sync test eksik key'leri fail
eder.

**Sync invariant'lar (CI enforced):**

1. `REPORT_I18N_KEYS` map'inin tüm leaf'leri TR locale JSON'da var.
2. `apps/web/src/locales/tr/reports.json` ↔ `packages/api/src/lib/locales/tr-reports.json` byte-identical.
3. EN locale TR ile aynı key ağacını taşır (placeholder + shape parity).
4. Print stub flat map'i REPORT_I18N_KEYS'in tüm leaf'lerini içerir.

Doğrulayan: `packages/domain/scripts/check-i18n-keys.ts` (script) +
`packages/domain/src/reports/__tests__/i18n-locale-sync.test.ts` (vitest) +
`packages/api/src/lib/report-i18n-tr.test.ts` (flatten + flat map test).

**Hardcode metin yasağı:** `eslint-plugin-pusula/no-hardcoded-text-in-reports`
(`packages/config/eslint-plugin-pusula.mjs`) kuralı `apps/web/src/components/reports/**`
ve `packages/ui/src/reports/**` altındaki non-test dosyalarda JSX text
literal + `title`/`aria-label`/`alt`/`placeholder` attribute hardcode metni
yasaklar. `pnpm lint` CI adımı ile koşar.

**Placeholder formatı:** single-brace `{name}` standart. Hem `useReportI18n`
hem print client `makeTranslator` regex'i `/\{\s*(\w+)\s*\}/g` kullanır.
Double-brace `{{name}}` (mustache) 13Q öncesi geçici çözümdü, kaldırıldı.

**Tarih/sayı formatları:** `Intl.DateTimeFormat` / `Intl.NumberFormat` workspace locale'ından (default `tr-TR`).

## 16.13 Comparison Delta Semantiği

`comparisonConfig.enabled = true` ise:

- Backend: aynı micro-report query'si **iki kez** çalışır (current + previous).
- Previous period = current period uzunluğunda kaydırılmış (`from - duration`, `from`).
- Cache key'inde `:cmp:1` suffix.
- UI:
  - KPI cards: alt satırda `↑%12` yeşil / `↓%8` kırmızı + önceki dönem küçük rakam.
  - Bar/line chart: arka planda noktalı çizgi + tooltip "Önceki: ..."
  - Tablo: ek "Δ" sütunu (opsiyonel, `supportsComparison`'a göre).
- Comparison farkı eşik altındaysa (≤1% absolute) rozet "─" (nötr) gösterilir, false-positive trend gürültüsü engellenir.

## 16.14 Mobil (Faz 13S — apps/mobile)

`apps/mobile` Faz 7'de scaffold edildi (Faz 7 büyük oranda `Done` — [DEM-30](https://linear.app/demirkol/issue/DEM-30)). 13S adımı bu mevcut app'e raporlama erişimini ekler.

**Yeni ekranlar (Expo Router, mevcut `(boards)` grubu altında):**

- `apps/mobile/app/(app)/(boards)/workspace-reports/[id].tsx` — workspaceId param. Tab switcher (Kaydedilmiş / Zamanlanmış) + FlatList. tRPC `report.listSaved` + `report.schedule.listByWorkspace`. Pusula mobile pattern (`ListRow`, `Pressable`, `EmptyState`).
- `apps/mobile/app/(app)/(boards)/saved-reports/[id].tsx` — savedReportId param. `WebView` ile web'in detay sayfasını render (`${WEB_URL}/workspaces/${workspaceId}/reports/${savedReportId}?embed=mobile`); header'da PDF indir butonu.

**Web tarafı `?embed=mobile`:** mevcut `/workspaces/[id]/reports/[reportId]/page.tsx` query param ile çağrılınca app-shell header'ı + admin-only aksiyon butonları (Excel / Zamanla / Çoğalt / Sil) CSS class'ı ile gizlenir; WebView'da yalnız panel + Yenile + PDF görünür. CSS rules `apps/web/src/app/(app)/_components/embed-mobile.css` + `<body data-embed-mode="mobile">` toggle (search param'dan client component okur).

**Auth cookie share:**

- iOS: `<WebView sharedCookiesEnabled />` — Better Auth session cookie cihaz cookie jar'ından WebView'a otomatik geçer. Better Auth Expo client cookie'yi `SecureStore`'da tutar, ek olarak HTTP istek `Cookie` başlığında verir; `sharedCookiesEnabled` aynı host (web subdomain) için cookie'yi WebView'a açar.
- Android: `<WebView thirdPartyCookiesEnabled />` — web ve API farklı subdomain'lerse cookie'nin `Domain=.pusulaportal.com` ile yazılması gerekir (`apps/api/src/auth.ts` Better Auth `cookieAttributes.domain` ayarı buna bağlı).
- Production'da web `https://pusulaportal.com` + API `https://api.pusulaportal.com` paylaşılan parent domain üzerinden çalışıyor → cookie share mevcut Faz 7 mobile auth pattern'i ile aynı.

**PDF indir akışı:**

1. Tap → mobile `report.export.mutate({ source: 'saved', savedReportId, format: 'pdf' })` → `renderId`.
2. Polling: 2sn aralıkla `report.getRender({ renderId })` — `status='completed'` + asset `downloadUrl` (presigned 5dk) gelince poll dur. Timeout 120sn (V1 worker render < 30sn, marjin 4x).
3. `expo-file-system` `FileSystem.downloadAsync(downloadUrl, fileUri)` → yerel cache (`FileSystem.cacheDirectory + 'pusula-report-' + renderId + '.pdf'`).
4. `expo-sharing` `Sharing.shareAsync(fileUri, { mimeType: 'application/pdf' })` → native share sheet (iOS Files / Mail / Mesajlar; Android share intent).

> Polling vs Socket: V1 polling (mobile arka plan kısıtları olmadan; pull-to-refresh ile uyumlu). V2 → Faz 5C mobile socket ext (Faz 7 sonrası iş) → `report.render.completed` event.

**Push bildirimi `report_scheduled_ready` (yeni tip):**

- `NOTIFICATION_TYPES` enum'a APPEND-ONLY eklenir (`packages/domain/src/constants.ts` + migration `0039_dem275_faz13S_report_scheduled_ready.sql` `ALTER TYPE notification_type ADD VALUE 'report_scheduled_ready'`).
- Worker `apps/worker/src/jobs/report-render.ts` `onCompleted` hook'u (Faz 13J zaten kullanır) — `triggerKind === 'scheduled' && scheduleId` durumunda `sendScheduledReportEmail` çağırılır + recipient `userId` set ise `notification_outbox` insert (channel `in_app` + `push`, type `report_scheduled_ready`, payload `{ savedReportId, renderId, workspaceId, scheduleId, reportTitle, completedAtIso }`, `event_id=NULL`).
- Outbox insert sonrası publish enqueue: `enqueueNotificationPublish({ eventId: SCHEDULER_TICK_EVENT_ID })` — mevcut `event_id IS NULL` batch sentinel.
- Push template `notification-templates.ts` `renderNotificationPush` switch'e yeni case → title: `Raporunuz hazır`, body: `"{reportTitle}" raporu indirilebilir.`, data: `{ type: 'report_scheduled_ready', savedReportId, renderId, workspaceId }`.
- Email kanalı outbox'a YAZILMAZ — mail zaten `sendScheduledReportEmail` ile gitti; duplicate önlenir. Email template switch'inde generic fallback case'i (exhaustiveness için) bulunur ama hiç render edilmez.
- Cooldown bypass GEREKMEZ — schedule başına bir tetik; 60sn içinde aynı kullanıcıya iki rapor düşmez (`schedule.tick` dakika başı + her schedule benzersiz). Yine de defansif: rule engine `COOLDOWN_BYPASS` set'i bu tipi içermez (mevcut bypass listesi mention/davet için kanonik); direct insert path zaten cooldown logic'inden geçmez.

**Deep link `pusula://workspaces/{workspaceId}/reports/{savedReportId}` (universal + scheme):**

- Push tap → `notification-target.ts` `payload.savedReportId` set ise yeni `NotificationTarget` varyantı `{ pathname: '/saved-reports/[id]', params: { id, workspaceId, title } }` döner.
- URL → `deep-link.ts` mevcut `/workspaces/{id}/...` parser'ı yeni segment `/reports/{savedReportId}` için extension.
- Cold-start (uygulama kapalıyken push tap) + warm (foreground listener) ikisi de `useNotificationDeepLink` (Faz 7L) içinden çalışır; helper'lara yeni target tipinin eklenmesi yeterli.
- iOS Universal Links + Android App Links `pusulaportal.com/workspaces/{id}/reports/{savedReportId}` URL'lerini uygulamada açar (`app.config.ts` `associatedDomains` + `intentFilters` Faz 7L zaten ayarlandı).

**Workspace ekranı header'ına "Raporlar" girişi:** `apps/mobile/app/(app)/(boards)/workspaces/[id].tsx` `headerRight`'ta mevcut "Üyeler" butonunun yanına ikon butonu (`bar-chart`).

**Manuel/save render için in-app bildirim (DEM-276 follow-up 2026-06-01):**

- `report_scheduled_ready` scheduled pipeline'a özel kalır (push + email + in-app). Manuel/save tetik için ayrı iki tip: `report_render_completed` ve `report_render_failed` (migration `0046_dem276_followup_manual_render_notifications.sql`). Aynı `notification_outbox` mantığı **kullanılmaz** — worker `processReportRenderJob` doğrudan `notifications` tablosuna INSERT eder (`triggerKind in ('manual','save')` && `triggeredBy IS NOT NULL` guard'ı; success path tx içinde, fail path `stampFailed` sonrası best-effort try/catch).
- Channel `in_app` only — render kullanıcının kendi tetiklediği aksiyon, mail/push spam üretir.
- Frontend `apps/web/.../notification-center.tsx` + `notification-type-icon.tsx` + `activity-summary.ts` + `notification-link.ts` bu iki tipi tanır; `linkTo` `/workspaces/{id}/reports?tab=renders` döner. `notification-link.ts` `SYSTEM_NOTIFICATION_TYPES` set'ine eklendi (aktör avatarı/adı gizli).
- Auto-download UX'i: `apps/web/src/lib/realtime/use-report-render-global.ts` (`app-shell.tsx`'de global çağrı) socket `report.render.completed` event'i alınca `report.getRender` ile signed URL'i çekip anchor click ile otomatik indirir + 8 sn persistent toast gösterir. Bildirim bell'i kullanıcı toast'ı kaçırdığında veya sayfa kapalıyken kalıcı kayıttır.

**13S kapsam dışı:**

- Native React Native chart render (WebView yeterli; V2 Skia/Victory).
- Mobilde oluşturma/zamanlama (sadece view + indir; composer + ScheduleDialog web'de).
- Excel / PNG / SVG export mobile (V1 PDF only; CSV daha mobile-friendly olabilir → V2).
- Offline cache (son render PDF'leri SQLite'a → V2).

## 16.15 Test Stratejisi

**Domain (Vitest):**

- Her scope adapter için unit test (in-memory PG via testcontainers).
- Comparison delta hesaplaması edge cases (sıfır bölme, eşik, eksi değer).
- Permission helper (workspace admin vs board viewer vs restricted scope).
- Filtre Zod schema (custom range validation, etiket and/or mantığı).

**API (Vitest + testcontainers PG + Redis):**

- `report.preview` cache hit/miss davranışı.
- `report.save` permission (board viewer reject, board admin accept).
- `report.export` job enqueue + render kaydı.
- Outbox invalidation: card.moved → ilgili cache key purge.

**Web (React Testing Library):**

- Her micro-report component: panel mode + print mode + empty state + restricted banner.
- Composer: preset seçimi → defaults yükleme, filtre değişimi → preview invalidation.
- Stale badge davranışı.

**E2E (Playwright — 13R):**

- Workspace owner: rapor oluştur → kaydet → schedule oluştur → manual run → email link verify (Resend test mode).
- Board viewer: ad-hoc rapor oluştur (kayıt butonu disable), PDF indir.
- Workspace admin: workspace raporu üret, restricted scope rozeti yok.
- Workspace member (kısıtlı): restricted banner görünür.
- Comparison toggle: chart'ta delta görünür.
- PDF: render bitsin, MinIO'dan indir, dosya 0 byte değil.

## 16.16 Açık Riskler ve Önlemler

| Risk | Etki | Önlem |
|------|------|-------|
| Worker'da Chromium image production'da ~150-300MB → image boyutu büyür | Build/deploy yavaşlar | `@sparticuz/chromium` (minify); gerekirse ayrı worker tier (`apps/worker-render`) opsiyonu Faz 14'e |
| Büyük workspace'te `activity_events` query yavaş (1M+ row) | Rapor 30sn+ | 13B'de `activity_events` üzerinde `(workspace_id, created_at)` ve `(board_id, type, created_at)` composite index; eşik aşılırsa snapshot rollup post-MVP |
| PDF render concurrent yük (10 kullanıcı aynı anda) | Worker queue dolar | Render queue concurrency=3, kullanıcıya "sıradayken hazırlanıyor" toast; priority queue (saved/scheduled vs adhoc) post-MVP |
| Resend free tier email kotası | Scheduled raporlar başarısız | Production'da Resend paid tier; worker retry + DLQ + Sentry alert |
| Comparison query maliyeti 2x | DB yük 2x | Comparison cache key ayrı ama aynı TTL; eşik aşılırsa "delta sadece KPI"a düşür |
| MinIO retention yanlış silme | Veri kaybı | Retention worker dry-run önce log (`REPORT_RETENTION_DRY_RUN=true` ilk hafta), sonra aktif; `archivedAt` kayıtları silmez |
| i18n TR-only literal sızıntısı | Çeviri kalitesi | ESLint kuralı: `apps/web/src/components/reports/**` içinde JSX text literal yasak (custom rule, 13Q) |
| Print sayfası `window.__reportReady` flag chart render bitmeden true olur | PDF'te boş chart | Recharts `onAnimationEnd` callback (animasyon kapalı olsa bile) + `requestIdleCallback` + 500ms safety delay |

## 16.17 Retention Pipeline (Faz 13P — DEM-272)

**Politika kaynağı:** `@pusula/api/lib/report-retention-policy.ts` (saf TS,
framework-bağımsız). I/O katmanı: `apps/worker/src/jobs/report-retention.ts`
(BullMQ daily cron + S3 delete + DB tx).

```txt
Daily 03:00 UTC tick
  ├─ Adım 1: Saved-attached render adayları
  │    SELECT DISTINCT saved_report_id WHERE saved_report_id IS NOT NULL
  │      AND created_at < NOW() - maxAgeDays
  │      GROUP BY saved_report_id
  │      LIMIT MAX_SAVED_PER_TICK (200)
  │
  │  Her aday için:
  │    ▶ Tüm sürümleri çek (id, version, createdAt)
  │    ▶ `decideSavedReportRenderRetention` çağır
  │       - En yeni `keepVersions=5` sürüm → keep (kept_recent_version)
  │       - Korumalı set dışında, yaş ≤ maxAgeDays → keep (kept_under_age)
  │       - Yaş > maxAgeDays → delete (superseded_by_newer_versions)
  │    ▶ Her delete kararı için `tryDeleteRender`:
  │       1. SELECT report_render_assets WHERE renderId = X
  │       2. MinIO DeleteObject (her asset) — 404 idempotent (tolere)
  │       3. DB tx: DELETE report_render_assets + DELETE report_renders
  │
  └─ Adım 2: Ad-hoc render adayları
       SELECT id, created_at WHERE saved_report_id IS NULL
         AND created_at < NOW() - maxAgeDays
         ORDER BY created_at ASC
         LIMIT MAX_AD_HOC_PER_TICK (500)

     Her aday için:
       ▶ `decideAdHocRenderRetention` çağır (keep/delete + sebep)
       ▶ Her delete kararı için aynı `tryDeleteRender` akışı
```

**Disiplin:**

- **Storage-first, DB-second:** `attachment-cleanup-sweeper` ile aynı disiplin.
  MinIO objesi silinmeden DB satırı silinmez → tutarsızlık (orphan storage)
  yerine "yeniden dene" pencere kalır. DB satırı silinmesi tx içinde atomik
  (`delete asset → delete render`). Idempotent: aynı tick iki kez koşunca
  ikincide hiçbir şey silmez.
- **404 idempotent:** `isObjectMissingError` `NoSuchKey`/`NotFound`/404'ü
  tolere eder; gerçek 5xx hata `failed` sayar ve Sentry'ye gider.
- **Fail isolation:** Tek render silimi fail ederse diğer kararlar
  devam eder (sweeper pattern'i).
- **Sentry breadcrumb:** `captureException(error, { renderId, savedReportId,
  reason, stage })` her hatada — telemetry sızıntısız (PII içermez).

**Dry-run mode (`REPORT_RETENTION_DRY_RUN=true`):**

- Default `true` (güvenli — production'ın ilk haftası bu mod kalır).
- Hiçbir DB satırı veya MinIO objesi silinmez.
- `console.warn('[DRY-RUN] would delete ...')` her aday için log.
- `result.deleted` sayım dry-run'da da artar (sembolik — "silinecekti").
- Operator log incelemesi sonrası `false` set eder (manual karar). 13T deploy
  fazında bu geçiş kullanıcı onayıyla yapılır.

**Konfigürasyon (`apps/worker/src/env.ts`):**

| Env | Default | Anlam |
|-----|---------|-------|
| `REPORT_RETENTION_DRY_RUN` | `true` | Dry-run modu açık/kapalı |
| `REPORT_RETENTION_KEEP_VERSIONS` | `5` | Saved son N hep tutulur |
| `REPORT_RETENTION_MAX_AGE_DAYS` | `90` | Yaş eşiği (gün) |
| `MAX_SAVED_PER_TICK` (kod sabit) | `200` | Bir tick'te distinct saved aday |
| `MAX_AD_HOC_PER_TICK` (kod sabit) | `500` | Bir tick'te ad-hoc aday |

**Format-agnostic:** Retention `report_render_assets.format` (pdf/xlsx/png/svg)
ayırt etmez — format ne olursa olsun aynı politika uygulanır. 13L (Excel + PNG)
asset'leri de aynı tick'te temizlenir; kod değişikliği gerekmez.

**Permission-agnostic:** Sistem cron — `restrictedScope` veya
`workspace_members` ile etkileşmez. Silme operasyonu admin işi olarak kabul
edilir; UI tetik yok.

**V1 dışı (V2 backlog):**

- Workspace başına farklı retention süresi (enterprise plan).
- Kullanıcı tetikli "Şimdi temizle" admin butonu.
- Soft delete + restore window (7g arşiv).
- DLQ inspect UI (manual redrive).

## 16.18 Klasik Pano PDF (Faz 14 — DEM-290)

Faz 13'ün kapsamlı raporlama sistemine **paralel ve bağımsız** ikinci PDF
subsystem'i. Eski Pusula (`D:\projects\pusulav0`, v2.2) `@react-pdf/renderer`
tek-tık senkron PDF özelliğinin v2'ye birebir uyarlaması. Pano başlık
dropdown'unda "Rapor İndir" → bekle → PDF in.

Faz 14 plan + 12 karar kaydı + domain mapping kanonik tablosu →
[`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md).
Domain kuralları → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md) §9.15.

### 16.18.1 Faz 13 vs Faz 14 Ayrım Tablosu

| Boyut                        | Faz 13 (kapsamlı raporlama)                                | Faz 14 (klasik pano PDF)                                  |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Tetikleyici                  | Composer modal (preset + filtre + scope seçimi)            | Pano dropdown "Rapor İndir" — parametresiz                |
| Scope                        | Card / List / Board / Workspace (universal micro-report)   | Board sabit (1 PDF = 1 pano)                              |
| Renderer                     | Puppeteer + `apps/web/src/app/(internal)/reports/print/[id]` | `@react-pdf/renderer` server-side JSX → buffer           |
| Pipeline                     | BullMQ `report-render` queue + worker + MinIO + Resend     | Senkron request handler (`route.ts`) → `pdf().toBuffer()` |
| Persistence                  | `report_renders` + `report_render_assets` + retention 90g  | Hiçbiri — buffer doğrudan response body                   |
| Cache                        | Redis kısa-TTL (60-600s) + outbox-driven invalidation       | Yok — her istek deep-fetch yeniden                        |
| Permission                   | `canPerformReportAction(action, scope, ctx)` policy        | **Aynı policy reuse** (`render`, `boardScope`, `ctx`)     |
| i18n namespace               | `reports.*` (Faz 13Q)                                      | `reports.classic.*` (alt scope, aynı dosya)               |
| Mobil                        | `apps/mobile` WebView panel + `FileSystem.downloadAsync`   | Aynı `FileSystem.downloadAsync` + `Sharing.shareAsync`    |
| Worker queue                 | `report-render`, `report-schedule`, vd.                    | **Hiç worker queue yok**                                  |
| Storage                      | MinIO `pusula-reports` bucket                              | **Hiç MinIO yok**                                         |

### 16.18.2 Paket / Katman Yerleşimi

```txt
apps/web/
  src/
    app/
      api/boards/[boardId]/report/route.ts  ◀ 14E (yeni)
    components/reports/classic-pdf/
      board-report-document.tsx              ◀ 14C (yeni — eski 915 satır port)
      use-download-board-report.ts           ◀ 14F (yeni — fetch + blob + download)
    lib/pdf/
      fonts.ts                               ◀ 14B (yeni — Roboto CDN register)
  package.json                                ◀ 14B (@react-pdf/renderer ^4.3.0)

packages/api/
  src/services/
    board-report-data.ts                     ◀ 14D (yeni — deep-fetch service)
```

### 16.18.3 Endpoint + Permission

```txt
GET /api/boards/[boardId]/report
  │
  ├─ Better Auth session → 401 yoksa
  ├─ Board lookup (Drizzle) → 404 yoksa
  ├─ canPerformReportAction('render', { type: 'board', id: boardId }, ctx)
  │    └─ FORBIDDEN → 403
  ├─ loadBoardForClassicReport(db, boardId, userId)
  │    └─ deep-fetch tek query'de:
  │       board + workspace + boardMembers + lists + cards(non-archived)
  │       + checklists + checklistItems + comments (top 5 per card)
  │       + cardMembers + labels + attachments (varlık sayımı)
  ├─ pdf(<BoardReportDocument data={...}/>).toBuffer()
  │    └─ Roboto CDN register (fonts.ts) — Font.register({ family: 'Roboto', src: ... })
  ├─ filename = `{slugify(board.title)}-raporu-{format(now, 'yyyy-MM-dd')}.pdf`
  │    └─ ASCII-clean Turkish-friendly (turkishSlugify helper)
  └─ NextResponse(buffer, {
       headers: {
         'Content-Type': 'application/pdf',
         'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
       }
     })
```

**Permission stratejisi (karar 6):** Faz 13F'te yazılan
`canPerformReportAction('render', boardScope, ctx)` policy birebir reuse
edilir. Yeni permission kodu yok; viewer/member/admin matrisi hazır.

**Hata yolu:** 401 (no session) · 403 (permission) · 404 (board not found) ·
500 (deep-fetch fail veya `pdf().toBuffer()` fail). Sentry breadcrumb her
hatada (`boardId`, `userId`, stage).

### 16.18.4 React-PDF Document — 4 Sayfa Kategorisi

`<BoardReportDocument data={...}/>` tek dosya inline (eski Pusula `ProjectReportDocument.tsx`
915 satır deseni). Sayfa kategorileri:

```jsx
<Document>
  <Page size="A4" style={styles.coverPage}>{/* Sayfa 1 — Kapak */}</Page>
  <Page size="A4" style={styles.membersPage}>{/* Sayfa 2 — Üyeler */}</Page>
  {data.lists.map((list) => (
    <Page key={list.id} size="A4" style={styles.listPage}>
      {/* Sayfa 3.N — Liste sayfası (her liste ayrı) */}
      {/* Kart tablosu + altında indented checklist + son 5 yorum */}
    </Page>
  ))}
  {data.totalCommentCount > 0 && (
    <Page size="A4" style={styles.commentsPage}>{/* Sayfa 4 — Yorumlar özeti */}</Page>
  )}
</Document>
```

İçerik kanonik tablosu → [`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md) §8.3.
Boş pano (karar 12) durumunda Sayfa 3 ve 4 hiç render edilmez — yerine
Sayfa 2'den sonra "Veri yok" bilgi sayfası eklenir.

### 16.18.5 Font Stratejisi (karar 4)

```ts
// apps/web/src/lib/pdf/fonts.ts
import { Font } from '@react-pdf/renderer';

export function registerReportFonts() {
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9fBBc4.ttf', fontWeight: 500 },
      { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.ttf', fontWeight: 700 },
    ],
  });
}
```

CDN ilk istekte cache'lenir (~50KB). Local `apps/web/public/fonts/`
reddedildi (binary repo yükü). TR karakter render (ş/ğ/ü/ç/ö/ı) doğrulaması
14C kabul kriteri.

### 16.18.6 Mobil Entegrasyonu (karar 10 — Faz 13S reuse)

`apps/mobile` board ayarları header dropdown'unda "Pano raporu indir":

```ts
// apps/mobile/app/(app)/workspaces/[id]/boards/[boardId].tsx
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

async function downloadBoardReport(boardId: string, boardTitle: string) {
  const url = `${apiUrl}/api/boards/${boardId}/report`;
  const filename = `${slugify(boardTitle)}-raporu-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const { uri } = await FileSystem.downloadAsync(url, dest, {
    headers: { Cookie: betterAuthSessionCookie },
  });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
```

Faz 13S'in (DEM-275) kazandırdığı altyapı birebir reuse. Yeni native paket
eklenmez (`expo-file-system` + `expo-sharing` zaten projede).

### 16.18.7 Senkron Pipeline'ın Sınırları

Senkron request handler'ın bilinen sınırları + kabul:

| Risk                                                   | Etki                              | Önlem                                                                                              |
| ------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Büyük pano (500+ kart) PDF render 30s+ alabilir        | Request timeout (Vercel 60s)      | V1 kabul — küçük/orta panolar hedef; büyük pano kullanıcısı Faz 13'ün asenkron pipeline'ına yönlendirilir |
| Concurrent indirme N-isteğe doğru Node CPU bound       | Server load spike                 | Next.js route handler default concurrency; production'da rate limit (Faz 8C k6 senaryo)            |
| `@react-pdf/renderer` server bundle ~2MB              | Cold start +200ms                 | Kabul — tek route handler, lazy import yeterli                                                     |
| Roboto CDN unreachable                                 | PDF fontless render (fallback)   | `@react-pdf/renderer` system font fallback'i (Helvetica) — TR karakter eksik kalır → 14C kabul: CDN gerekli, offline build edilirse local'e geç |

**Karşılaştırma:** Faz 13'ün Puppeteer pipeline'ı bu sınırları aşar
(asenkron queue + worker + retention), ama Faz 14 deliberate olarak basit
tutulur — "tek tık → PDF" UX'i için worker overhead'i aşırı.

### 16.18.8 Kaçınılması Gerekenler (klasik PDF)

- Puppeteer kullanmak (Faz 13'ün araçları; klasik için aşırı).
- Composer UI açmak (parametresiz; kullanıcı seçenek görmez).
- Worker queue eklemek (senkron request handler yeterli).
- MinIO'ya kaydetmek (buffer doğrudan response).
- Faz 13 print sayfasını (`/reports/print/[id]`) reuse etmek (farklı pipeline; karışıklık riski).
- Arşivli kart/listeyi PDF'e dahil etmek (`cards.archived_at IS NULL` zorunlu filtre).
- Permission'ı yeniden yazmak (karar 6 — Faz 13 policy reuse).
- i18n'i hardcode TR ile geçmek (karar 11 — `reports.classic.*` namespace).
- 422 ile boş pano'yu reddetmek (karar 12 — "Veri yok" sayfası).
