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
 * JSONB tip placeholder'ları: `filters`, `microReports`, `comparison`
 * alanları `@pusula/domain/reports` (13C / DEM-259) inince gerçek tiplere
 * bağlanacak; bu dosya 13C öncesi şema/migration teslim eder ve `unknown`
 * placeholder kullanır (jsonb runtime'da serbestçe geçer).
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
]);

// ─── JSONB type placeholders (13C — DEM-259 inince gerçek tiplere bağlanacak) ─
//
// `Record<string, unknown>` `unknown` yerine kasıtlı — insert input pozisyonunda
// `unknown` her şeyi (string, number, ...) kabul ederdi; `Record` JSON-obje
// guardrail'i koyar ve 13C'de gerçek Zod-türetilmiş tiplere replace-friendly.

// TODO(13C — DEM-259): replace with `ReportFilters` from `@pusula/domain/reports`.
type ReportFiltersPlaceholder = Record<string, unknown>;
// TODO(13C — DEM-259): replace with `MicroReportSelection[]` from `@pusula/domain/reports`.
type MicroReportSelectionPlaceholder = Record<string, unknown>[];
// TODO(13C — DEM-259): replace with `ComparisonConfig | null` from `@pusula/domain/reports`.
type ComparisonConfigPlaceholder = Record<string, unknown>;
// TODO(13C — DEM-259): replace with `CadenceConfig` from `@pusula/domain/reports`.
type CadenceConfigPlaceholder = Record<string, unknown>;

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
    filters: jsonb().$type<ReportFiltersPlaceholder>().notNull(),

    /** Preset default'u + kullanıcı toggle'larıyla seçili micro-report'lar. */
    microReports: jsonb().$type<MicroReportSelectionPlaceholder>().notNull(),

    /** Comparison ayarı — null ise comparison kapalı. */
    comparison: jsonb().$type<ComparisonConfigPlaceholder>(),

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
     *   daily:   `{ hour, minute }`
     *   weekly:  `{ dayOfWeek (0-6), hour, minute }`
     *   monthly: `{ dayOfMonth (1-31 | 'last'), hour, minute }`
     * 13C domain'inde Zod ile validate edilir.
     */
    cadenceConfig: jsonb().$type<CadenceConfigPlaceholder>().notNull(),

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
    filters: jsonb().$type<ReportFiltersPlaceholder>().notNull(),
    comparison: jsonb().$type<ComparisonConfigPlaceholder>(),

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
export const reportRenderAssets = pgTable('report_render_assets', {
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
});

// ─── Inferred types ─────────────────────────────────────────────────────────

export type SavedReport = typeof savedReports.$inferSelect;
export type NewSavedReport = typeof savedReports.$inferInsert;
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type NewReportSchedule = typeof reportSchedules.$inferInsert;
export type ReportRender = typeof reportRenders.$inferSelect;
export type NewReportRender = typeof reportRenders.$inferInsert;
export type ReportRenderAsset = typeof reportRenderAssets.$inferSelect;
export type NewReportRenderAsset = typeof reportRenderAssets.$inferInsert;
