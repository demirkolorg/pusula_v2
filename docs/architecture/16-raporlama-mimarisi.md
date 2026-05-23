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
updated: 2026-05-23
---

# 16 — Raporlama Mimarisi

> Eksen: **tasarım / teknik**. Faz 13 (post-MVP epic, [DEM-256](https://linear.app/demirkol/issue/DEM-256)).
> Domain kuralları → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md).
> Faz planı → [`../process/07-faz-13-raporlama-plani.md`](../process/07-faz-13-raporlama-plani.md).

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
| `apps/worker/src/queues/report-render.ts` | Puppeteer headless render + MinIO upload + render kaydı |
| `apps/worker/src/queues/report-schedule.ts` | BullMQ cron job (every minute tick) → due schedules enqueue |
| `apps/worker/src/queues/report-cache-invalidator.ts` | Notification outbox / realtime event consumer → ilgili cache key purge |
| `apps/worker/src/queues/report-retention.ts` | Daily cron → 90g'den eski render versiyon silimi |
| `apps/mobile/app/workspace/[slug]/reports/*` | Saved + scheduled liste + WebView panel + PDF share (Faz 13S) |

## 16.3 Veritabanı Şeması (Drizzle, `casing: 'snake_case'`)

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
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // scope sahipliği — entity yetkisi senkron
  scopeKind: reportScopeKindEnum().notNull(),
  scopeId: uuid().notNull(),  // card_id / list_id / board_id / workspace_id

  presetId: text().notNull(),  // domain registry id (örn. 'board.health')
  title: text().notNull(),     // kullanıcı verdiği isim
  description: text(),

  // filtre snapshot'ı (Zod schema'lı, domain'de validate)
  filters: jsonb().$type<ReportFilters>().notNull(),

  // hangi micro-report'ları içerir (preset default'u + kullanıcı toggle'ları)
  microReports: jsonb().$type<MicroReportSelection[]>().notNull(),

  // comparison ayarı
  comparison: jsonb().$type<ComparisonConfig | null>(),

  createdBy: uuid().notNull().references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp({ withTimezone: true }),
}, (t) => [
  index('saved_reports_workspace_idx').on(t.workspaceId),
  index('saved_reports_scope_idx').on(t.scopeKind, t.scopeId),
]);

export const reportSchedules = pgTable('report_schedules', {
  id: uuid().primaryKey().defaultRandom(),
  savedReportId: uuid().notNull().references(() => savedReports.id, { onDelete: 'cascade' }),

  cadence: reportScheduleCadenceEnum().notNull(),
  // daily: { hour, minute }
  // weekly: { dayOfWeek (0-6), hour, minute }
  // monthly: { dayOfMonth (1-31 veya 'last'), hour, minute }
  cadenceConfig: jsonb().notNull(),

  timezone: text().notNull(),  // IANA (workspace default'undan)

  // alıcılar
  recipientUserIds: uuid().array().notNull().default([]),
  recipientEmails: text().array().notNull().default([]),

  isActive: boolean().notNull().default(true),
  lastRunAt: timestamp({ withTimezone: true }),
  nextRunAt: timestamp({ withTimezone: true }).notNull(),  // worker tick için indexli

  createdBy: uuid().notNull().references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('report_schedules_next_run_idx').on(t.nextRunAt).where(sql`is_active = true`),
]);

// Her render geçmişi (saved + scheduled + ad-hoc save sonrası)
export const reportRenders = pgTable('report_renders', {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  savedReportId: uuid().references(() => savedReports.id, { onDelete: 'cascade' }),
  scheduleId: uuid().references(() => reportSchedules.id, { onDelete: 'set null' }),

  // ad-hoc render için snapshot (savedReportId null olabilir)
  scopeKind: reportScopeKindEnum().notNull(),
  scopeId: uuid().notNull(),
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

  // teslim
  triggeredBy: uuid().references(() => users.id),
  triggerKind: text().notNull(),  // 'manual' | 'scheduled' | 'save'

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
  id: uuid().primaryKey().defaultRandom(),
  renderId: uuid().notNull().references(() => reportRenders.id, { onDelete: 'cascade' }),

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
- `restrictedScope` alanı — kullanıcı erişmediği panolar dışlanırsa raporda ve PDF'te rozet için.
- `version` — saved report'un her yeni render'ında artar; "son 5 versiyon hep tut" policy için.
- `nextRunAt` partial index sadece aktif schedule'lar — worker tick'i hızlı tarama.
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

export const reportFiltersSchema = z.object({
  range: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('preset'), preset: z.enum([
      'today', 'yesterday', 'last7d', 'last30d', 'last90d',
      'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear',
    ]) }),
    z.object({ kind: z.literal('custom'), from: z.string().datetime(), to: z.string().datetime() }),
  ]),

  members: z.object({
    userIds: z.array(z.string().uuid()),
    relations: z.array(z.enum(['assignee', 'actor', 'watcher'])),
  }).optional(),

  labels: z.object({
    labelIds: z.array(z.string().uuid()),
    mode: z.enum(['and', 'or']),
  }).optional(),

  scopeFilter: z.object({
    cardStatus: z.array(z.enum(['open', 'completed', 'archived'])).optional(),
    includeArchivedLists: z.boolean().default(false),
    listIds: z.array(z.string().uuid()).optional(),
    boardIds: z.array(z.string().uuid()).optional(),
    checklistStatus: z.enum(['all', 'completed', 'incomplete']).optional(),
  }).optional(),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const comparisonConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['previousPeriod', 'sameLastYear']),  // V1: sadece previousPeriod
});

export type ComparisonConfig = z.infer<typeof comparisonConfigSchema>;

export interface MicroReportManifest<TData> {
  id: string;
  i18nKey: string;
  category: MicroReportCategory;
  supports: ReadonlyArray<ReportScopeKind>;
  defaultLayout: { colSpan: 1 | 2 | 3 | 4; minHeight: number };
  supportsComparison: boolean;
  supportsCsv: boolean;
  supportsPngExport: boolean;
  emptyStateKey: string;

  query: ScopeAdapter<TData>;
  Component: React.ComponentType<MicroReportProps<TData>>;
  PrintComponent?: React.ComponentType<MicroReportProps<TData>>;
  worksheetExport?(data: TData): { columns: ExcelColumn[]; rows: unknown[][] };
}

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

- `hash` = MurmurHash3 + stable JSON serialization.
- `userId` cache key'inde çünkü permission-filtered (her kullanıcının görünen veri farklı).
- Workspace admin için ayrı bir key (suffix `:admin`) → tüm üyeler aynı veriye düşer.

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

**"Stale" rozeti:**

- Panel açıkken socket: `report.invalidated` event'i (scope tabanlı) `workspace:{workspaceId}` room'una publish.
- UI bu event'i dinler, açık raporun scope'una düşerse `<StaleBadge/>` gösterir.
- Kullanıcı "Yenile" basınca tRPC `preview` tekrar çağrılır (cache miss → fresh).

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

**Puppeteer worker kurulumu:**

- Docker image: `apps/worker/Dockerfile`'a `@sparticuz/chromium` paketi (~+150MB minified).
- `puppeteer-core` + `@sparticuz/chromium` combo.
- Connection pool: en fazla 3 paralel page (kaynağı koru), kuyruktan al.
- Memory limit: container `--memory=1g`.
- Timeout: 60s per render (büyük workspace fail-safe).

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

```
packages/domain/src/reports/i18n-keys.ts  (sabitler — drift'i önler)
apps/web/src/locales/tr/reports.json       (TR çeviri — şimdi dolu)
apps/web/src/locales/en/reports.json       (EN — boş şablon, sonra)
```

**Key kuralı:**

- `reports.presets.<presetId>.title` / `.description`
- `reports.microReports.<microReportId>.title` / `.emptyState`
- `reports.filters.range.<presetId>`
- `reports.actions.export.pdf` vb.
- `reports.delta.<up|down|neutral|new>`
- `reports.restricted.banner`
- `reports.stale.message`
- `reports.email.subject` / `.greeting` / `.cta`

**Eksiklikte fallback:** key bulunamazsa key string'i basılır (dev'de büyük "MISSING" prefix, prod'da sessiz). CI'da `i18n-lint` adımı eksik key'leri fail eder.

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

`apps/mobile` Faz 7'de scaffold edildi (`In Progress`). 13S adımı bu mevcut app'e ekler:

- Yeni ekran: `app/workspace/[slug]/reports.tsx`
  - Saved + Scheduled liste (tRPC `report.listSaved`).
  - Tap → `app/workspace/[slug]/reports/[id].tsx` → web'in panel sayfasını WebView ile render (auth token cookie inject; web mobile-responsive zaten).
  - PDF butonu → `report.export` çağır → render hazır olduğunda Expo `Sharing.shareAsync(signedUrl)` veya `FileSystem.downloadAsync` + native viewer.
- Bildirim: scheduled rapor hazır olunca push (`notification_outbox` zaten worker'da; `report.scheduled.ready` tipi eklenir) → deep link.

**13S kapsam dışı:** native React Native chart render (V2 için), mobilde oluşturma/zamanlama (sadece view + indir).

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
