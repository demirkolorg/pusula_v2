import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  CadenceConfig,
  ComparisonConfig,
  MicroReportSelection,
  ReportFilters,
} from '@pusula/domain/reports';
import { users } from './auth';
import { workspaces } from './workspaces';
import { archivedAt, primaryId, timestamps } from './_common';

/**
 * Faz 13 — Raporlama Sistemi (DEM-258 / API-2026-05-23-001).
 *
 * 4 tablo + 4 enum, Pusula konvansiyonuyla (`primaryId()` text+nanoid PK,
 * text FK'ler, `...timestamps` spread, `archivedAt()` helper). Belgenin
 * kanonik referansı: `docs/architecture/16-raporlama-mimarisi.md` §16.3 —
 * uuid yerine text/nanoid kararı 2026-05-23 ADR satırında kayıtlı
 * (`02-teknoloji-kararlari.md`).
 *
 * JSONB tipleri 13C ([DEM-259](https://linear.app/demirkol/issue/DEM-259))
 * `@pusula/domain/reports`'a bağlandı (önceki Placeholder type'lar kaldırıldı).
 * Runtime'da jsonb serbestçe geçer; Zod validation tRPC procedure
 * katmanında (`@pusula/api` — 13D) `reportFiltersSchema` /
 * `cadenceConfigSchema` / `comparisonConfigSchema` /
 * `microReportSelectionSchema` ile yapılır.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export const reportScopeKindEnum = pgEnum('report_scope_kind', [
  'card',
  'list',
  'board',
  'workspace',
]);

export const reportScheduleCadenceEnum = pgEnum('report_schedule_cadence', [
  'daily',
  'weekly',
  'monthly',
]);

export const reportRenderStatusEnum = pgEnum('report_render_status', [
  'queued',
  'rendering',
  'completed',
  'failed',
  'expired',
]);

export const reportRenderFormatEnum = pgEnum('report_render_format', [
  'pdf',
  'xlsx',
  'png',
  // Faz 13L (DEM-268) — chart-level SVG export. APPEND-ONLY (Postgres enum
  // disiplini; daha önce 13B/0035 ile 3 değer yaratıldı).
  'svg',
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Kullanıcının "Kaydet" dediği rapor (ad-hoc DEĞIL). Scope sahipliği +
 * entity yetkisi senkron — `scope_id` polymorphic (FK yok), `scope_kind`
 * ile birlikte hangi entity'ye bağlı olduğunu söyler. Pusula'nın diğer
 * tüm hedef tabloları (cards/lists/boards/workspaces) `text` id taşıdığı
 * için tip ortaktır.
 */
export const savedReports = pgTable(
  'saved_reports',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    scopeKind: reportScopeKindEnum().notNull(),
    /** Polymorphic — card/list/board/workspace id. FK yok (bkz. doc-block). */
    scopeId: text().notNull(),

    /** Domain registry id, örn. `'board.health'`. */
    presetId: text().notNull(),
    title: text().notNull(),
    /** Kullanıcının verdiği serbest ek açıklama (opsiyonel). */
    description: text(),

    /** Filtre snapshot'ı — Zod schema'lı (`@pusula/domain/reports`, 13C). */
    filters: jsonb().$type<ReportFilters>().notNull(),

    /** Preset default'u + kullanıcı toggle'larıyla seçili micro-report'lar. */
    microReports: jsonb().$type<MicroReportSelection[]>().notNull(),

    /** Comparison ayarı — null ise comparison kapalı. */
    comparison: jsonb().$type<ComparisonConfig>(),

    createdBy: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    index('saved_reports_workspace_idx').on(t.workspaceId),
    index('saved_reports_scope_idx').on(t.scopeKind, t.scopeId),
  ],
);

/**
 * Kaydedilmiş raporun cron benzeri zamanlanmış teslim ayarı.
 * `next_run_at` partial index sadece aktif schedule'larda → worker tick
 * (BullMQ repeatable job) bu index üzerinden hızlı tarama yapar.
 */
export const reportSchedules = pgTable(
  'report_schedules',
  {
    id: primaryId(),
    savedReportId: text()
      .notNull()
      .references(() => savedReports.id, { onDelete: 'cascade' }),

    cadence: reportScheduleCadenceEnum().notNull(),
    /**
     * Cadence ayrıntısı:
     *   daily:   `{ cadence: 'daily', hour, minute }`
     *   weekly:  `{ cadence: 'weekly', dayOfWeek (0-6), hour, minute }`
     *   monthly: `{ cadence: 'monthly', dayOfMonth (1-31 | 'last'), hour, minute }`
     * Discriminated union (`@pusula/domain/reports` `cadenceConfigSchema`)
     * tRPC procedure katmanında Zod ile validate edilir.
     */
    cadenceConfig: jsonb().$type<CadenceConfig>().notNull(),

    /** IANA zaman dilimi (workspace default'undan). */
    timezone: text().notNull(),

    /** Alıcılar — user.id text/nanoid olduğundan text[]. */
    recipientUserIds: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    recipientEmails: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    isActive: boolean().notNull().default(true),
    lastRunAt: timestamp({ withTimezone: true }),
    nextRunAt: timestamp({ withTimezone: true }).notNull(),

    createdBy: text()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    // Worker tick: yalnız aktif schedule'lar, `next_run_at` sıralı.
    index('report_schedules_next_run_idx')
      .on(t.nextRunAt)
      .where(sql`${t.isActive} = true`),
  ],
);

/**
 * Her render geçmişi — saved + scheduled + ad-hoc save sonrası. Saved
 * report'un her yeni render'ında `version` +1. Ad-hoc render için
 * `saved_report_id` null olabilir; o durumda snapshot kolonları
 * (`preset_id`, `filters`, `comparison`, vb.) gerçek değerleri taşır.
 */
export const reportRenders = pgTable(
  'report_renders',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    savedReportId: text().references(() => savedReports.id, { onDelete: 'cascade' }),
    scheduleId: text().references(() => reportSchedules.id, { onDelete: 'set null' }),

    scopeKind: reportScopeKindEnum().notNull(),
    scopeId: text().notNull(),
    presetId: text().notNull(),
    filters: jsonb().$type<ReportFilters>().notNull(),
    comparison: jsonb().$type<ComparisonConfig>(),

    status: reportRenderStatusEnum().notNull().default('queued'),
    format: reportRenderFormatEnum().notNull(),

    /**
     * Aggregation sırasında kullanıcının erişemediği alt entity'lerin
     * sayımı. Workspace admin için her zaman null (rozet görünmez). UI'da
     * `<RestrictedScopeBanner/>` (13O / DEM-271) bu alanı kullanır.
     */
    restrictedScope: jsonb().$type<{
      excludedKind: string;
      excludedCount: number;
    } | null>(),

    /**
     * Faz 13L (DEM-268) — PNG/SVG render'ı için hedef micro-report.
     * `null` (pdf/xlsx) → tüm rapor. `{ microReportId }` (png/svg) → tek
     * widget. Mutation `report.export` insert ederken yazar; worker
     * `processReportRenderJob` PNG/SVG branch'inde okur.
     */
    assetTarget: jsonb().$type<{ microReportId: string } | null>(),

    /** Saved report'un her render'ında +1; "son 5 sürüm hep tut" policy için. */
    version: integer().notNull().default(1),

    triggeredBy: text().references(() => users.id, { onDelete: 'set null' }),
    /** `'manual' | 'scheduled' | 'save'` — DB-level CHECK ile sınırlanır. */
    triggerKind: text().notNull(),

    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    errorMessage: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('report_renders_workspace_idx').on(t.workspaceId, t.createdAt),
    index('report_renders_saved_idx').on(t.savedReportId, t.version),
    /**
     * Faz 13P (DEM-272) — retention worker partial index'leri. Daily tick
     * `WHERE saved_report_id IS NOT NULL AND created_at < cutoff` ve
     * `WHERE saved_report_id IS NULL AND created_at < cutoff` filtrelerini
     * seq scan'siz koşturmak için. `(workspaceId, createdAt)` indexi
     * workspace-agnostic filtrede leading column'a uyum sağlamadığından
     * büyük workspace'te yetmezdi (DB review 2026-05-24).
     */
    index('report_renders_retention_saved_idx')
      .on(t.savedReportId, t.createdAt)
      .where(sql`${t.savedReportId} IS NOT NULL`),
    index('report_renders_retention_adhoc_idx')
      .on(t.createdAt)
      .where(sql`${t.savedReportId} IS NULL`),
    check(
      'report_renders_trigger_kind_check',
      sql`${t.triggerKind} IN ('manual', 'scheduled', 'save')`,
    ),
  ],
);

/**
 * Render çıktı dosyaları — MinIO/S3 nesne anahtarları + boyut + checksum.
 * Retention worker (13P / DEM-272) `expires_at`'i kullanarak 90g + son 5
 * sürüm policy'sini uygular.
 */
export const reportRenderAssets = pgTable(
  'report_render_assets',
  {
    id: primaryId(),
    renderId: text()
      .notNull()
      .references(() => reportRenders.id, { onDelete: 'cascade' }),

    format: reportRenderFormatEnum().notNull(),
    s3Bucket: text().notNull(),
    s3Key: text().notNull(),
    byteSize: bigint({ mode: 'number' }).notNull(),
    checksum: text(),

    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Faz 13P (DEM-272) — retention worker `renderId` ile asset listesi
     * çeker + cascade DELETE renderId üzerinden çalışır. Postgres FK
     * referans kolonunu otomatik index'lemez; bu index olmadan asset
     * fetch + cascade silimi seq scan riski taşır (DB review 2026-05-24).
     */
    index('report_render_assets_render_idx').on(t.renderId),
  ],
);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type SavedReport = typeof savedReports.$inferSelect;
export type NewSavedReport = typeof savedReports.$inferInsert;
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type NewReportSchedule = typeof reportSchedules.$inferInsert;
export type ReportRender = typeof reportRenders.$inferSelect;
export type NewReportRender = typeof reportRenders.$inferInsert;
export type ReportRenderAsset = typeof reportRenderAssets.$inferSelect;
export type NewReportRenderAsset = typeof reportRenderAssets.$inferInsert;
