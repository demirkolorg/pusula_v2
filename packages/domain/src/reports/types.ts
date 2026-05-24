import { z } from 'zod';
import { idSchema } from '../schemas/common';

/**
 * Faz 13C — `@pusula/domain/reports/types`: kanonik Zod şema + TS tip
 * setini tanımlar (DEM-259). Saf TypeScript — React, Drizzle, tRPC
 * bağımlılığı YOK.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.4 +
 * `docs/domain/09-raporlama-kurallari.md` §9.2-9.9.
 *
 * Entity id'leri (`userIds`, `labelIds`, `boardIds`, ...) `idSchema`
 * (nanoid) kullanır — Pusula konvansiyonu (`z.string().uuid()` yalnız
 * `clientMutationId` için, bkz. 13C ADR 2026-05-23).
 */

// ─── Scope ─────────────────────────────────────────────────────────────────

export const reportScopeKindSchema = z.enum(['card', 'list', 'board', 'workspace']);
export type ReportScopeKind = z.infer<typeof reportScopeKindSchema>;

export const reportScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('card'),
    cardId: idSchema,
    boardId: idSchema,
    workspaceId: idSchema,
  }),
  z.object({
    kind: z.literal('list'),
    listId: idSchema,
    boardId: idSchema,
    workspaceId: idSchema,
  }),
  z.object({
    kind: z.literal('board'),
    boardId: idSchema,
    workspaceId: idSchema,
  }),
  z.object({
    kind: z.literal('workspace'),
    workspaceId: idSchema,
  }),
]);
export type ReportScope = z.infer<typeof reportScopeSchema>;

export type CardScope = Extract<ReportScope, { kind: 'card' }>;
export type ListScope = Extract<ReportScope, { kind: 'list' }>;
export type BoardScope = Extract<ReportScope, { kind: 'board' }>;
export type WorkspaceScope = Extract<ReportScope, { kind: 'workspace' }>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const RANGE_PRESETS = [
  'today',
  'yesterday',
  'last7d',
  'last30d',
  'last90d',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
] as const;

export const rangePresetSchema = z.enum(RANGE_PRESETS);
export type RangePreset = z.infer<typeof rangePresetSchema>;

export const reportRangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), preset: rangePresetSchema }),
  z
    .object({
      kind: z.literal('custom'),
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .refine((r) => new Date(r.from).getTime() <= new Date(r.to).getTime(), {
      message: 'custom range: from must be ≤ to',
      path: ['from'],
    }),
]);
export type ReportRange = z.infer<typeof reportRangeSchema>;

export const MEMBER_RELATIONS = ['assignee', 'actor', 'watcher'] as const;
export const memberRelationSchema = z.enum(MEMBER_RELATIONS);
export type MemberRelation = z.infer<typeof memberRelationSchema>;

export const memberFilterSchema = z.object({
  userIds: z.array(idSchema),
  relations: z.array(memberRelationSchema),
});

export const LABEL_FILTER_MODES = ['and', 'or'] as const;
export const labelFilterModeSchema = z.enum(LABEL_FILTER_MODES);
export type LabelFilterMode = z.infer<typeof labelFilterModeSchema>;

export const labelFilterSchema = z.object({
  labelIds: z.array(idSchema),
  mode: labelFilterModeSchema,
});

export const CARD_STATUS_FILTERS = ['open', 'completed', 'archived'] as const;
export const cardStatusFilterSchema = z.enum(CARD_STATUS_FILTERS);
export type CardStatusFilter = z.infer<typeof cardStatusFilterSchema>;

export const CHECKLIST_STATUS_FILTERS = ['all', 'completed', 'incomplete'] as const;
export const checklistStatusFilterSchema = z.enum(CHECKLIST_STATUS_FILTERS);
export type ChecklistStatusFilter = z.infer<typeof checklistStatusFilterSchema>;

export const scopeFilterSchema = z.object({
  cardStatus: z.array(cardStatusFilterSchema).optional(),
  includeArchivedLists: z.boolean().default(false),
  listIds: z.array(idSchema).optional(),
  boardIds: z.array(idSchema).optional(),
  checklistStatus: checklistStatusFilterSchema.optional(),
});

export const reportFiltersSchema = z.object({
  range: reportRangeSchema,
  members: memberFilterSchema.optional(),
  labels: labelFilterSchema.optional(),
  scopeFilter: scopeFilterSchema.optional(),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

// ─── Comparison ────────────────────────────────────────────────────────────

export const COMPARISON_MODES = ['previousPeriod', 'sameLastYear'] as const;
export const comparisonModeSchema = z.enum(COMPARISON_MODES);
export type ComparisonMode = z.infer<typeof comparisonModeSchema>;

export const comparisonConfigSchema = z.object({
  enabled: z.boolean(),
  // V1: yalnız `previousPeriod` desteklenir; `sameLastYear` post-MVP.
  mode: comparisonModeSchema,
});
export type ComparisonConfig = z.infer<typeof comparisonConfigSchema>;

// ─── Render format / Schedule cadence ──────────────────────────────────────

export const REPORT_RENDER_FORMATS = ['pdf', 'xlsx', 'png'] as const;
export const reportRenderFormatSchema = z.enum(REPORT_RENDER_FORMATS);
export type ReportRenderFormat = z.infer<typeof reportRenderFormatSchema>;

export const REPORT_RENDER_STATUSES = [
  'queued',
  'rendering',
  'completed',
  'failed',
  'expired',
] as const;
export const reportRenderStatusSchema = z.enum(REPORT_RENDER_STATUSES);
export type ReportRenderStatus = z.infer<typeof reportRenderStatusSchema>;

export const REPORT_SCHEDULE_CADENCES = ['daily', 'weekly', 'monthly'] as const;
export const reportScheduleCadenceSchema = z.enum(REPORT_SCHEDULE_CADENCES);
export type ReportScheduleCadence = z.infer<typeof reportScheduleCadenceSchema>;

const hourSchema = z.number().int().min(0).max(23);
const minuteSchema = z.number().int().min(0).max(59);

// `dayOfMonth` ya 1-31 sayısı ya literal `'last'` (ayın son günü).
const dayOfMonthSchema = z.union([z.number().int().min(1).max(31), z.literal('last')]);

// `dayOfWeek`: 0=Pazar … 6=Cumartesi.
const dayOfWeekSchema = z.number().int().min(0).max(6);

export const cadenceConfigSchema = z.discriminatedUnion('cadence', [
  z.object({
    cadence: z.literal('daily'),
    hour: hourSchema,
    minute: minuteSchema,
  }),
  z.object({
    cadence: z.literal('weekly'),
    dayOfWeek: dayOfWeekSchema,
    hour: hourSchema,
    minute: minuteSchema,
  }),
  z.object({
    cadence: z.literal('monthly'),
    dayOfMonth: dayOfMonthSchema,
    hour: hourSchema,
    minute: minuteSchema,
  }),
]);
export type CadenceConfig = z.infer<typeof cadenceConfigSchema>;

// ─── Micro-report ──────────────────────────────────────────────────────────

export const MICRO_REPORT_CATEGORIES = ['activity', 'status', 'time', 'structure'] as const;
export const microReportCategorySchema = z.enum(MICRO_REPORT_CATEGORIES);
export type MicroReportCategory = z.infer<typeof microReportCategorySchema>;

export const microReportSelectionSchema = z.object({
  microReportId: z.string().min(1),
  enabled: z.boolean(),
  // Preset default'unun üstüne kullanıcı override (örn. ad-hoc komposizyon).
  override: z
    .object({
      colSpan: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    })
    .optional(),
});
export type MicroReportSelection = z.infer<typeof microReportSelectionSchema>;

// ─── Restricted scope (bilgi sızıntısı engelleyici) ────────────────────────

export const restrictedScopeSchema = z.object({
  excludedKind: reportScopeKindSchema,
  excludedCount: z.number().int().nonnegative(),
});
export type RestrictedScope = z.infer<typeof restrictedScopeSchema>;

// ─── Saved report — input şemaları ─────────────────────────────────────────

const savedReportTitleSchema = z.string().trim().min(1).max(200);
const savedReportDescriptionSchema = z.string().trim().max(1000).optional();

/**
 * Cross-field check (security): `workspaceId` (DB row sahipliği) ve
 * `scope.workspaceId` (permission ctx) aynı olmalı. Aksi halde kullanıcı
 * workspace A'da `member`, B'ye misafir bile değilken `scope.workspaceId=A`
 * (permission PASS) + `workspaceId=B` (insert hedefi) ile cross-workspace
 * data plant edebilir (DEM-260 security review C1).
 */
export const savedReportCreateSchema = z
  .object({
    workspaceId: idSchema,
    scope: reportScopeSchema,
    presetId: z.string().min(1),
    title: savedReportTitleSchema,
    description: savedReportDescriptionSchema,
    filters: reportFiltersSchema,
    microReports: z.array(microReportSelectionSchema),
    comparison: comparisonConfigSchema.nullable().optional(),
  })
  .refine((v) => v.workspaceId === v.scope.workspaceId, {
    message: 'workspaceId ile scope.workspaceId aynı olmalı',
    path: ['scope', 'workspaceId'],
  });
export type SavedReportCreateInput = z.infer<typeof savedReportCreateSchema>;

export const savedReportPatchSchema = z.object({
  id: idSchema,
  title: savedReportTitleSchema.optional(),
  description: savedReportDescriptionSchema,
  filters: reportFiltersSchema.optional(),
  microReports: z.array(microReportSelectionSchema).optional(),
  comparison: comparisonConfigSchema.nullable().optional(),
});
export type SavedReportPatchInput = z.infer<typeof savedReportPatchSchema>;

export const savedReportListSchema = z.object({
  workspaceId: idSchema,
  scopeKind: reportScopeKindSchema.optional(),
  scopeId: idSchema.optional(),
  presetId: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type SavedReportListInput = z.infer<typeof savedReportListSchema>;

// ─── Schedule — input şemaları ─────────────────────────────────────────────

// IANA timezone id'lerini ön-onaylanmış bir set'le sınırlamak yerine Zod
// seviyesinde yalnız "boş değil" kontrolü yapıyoruz; gerçek doğrulama
// `Intl.supportedValuesOf('timeZone')`'a 13D procedure katmanında yapılır
// (domain saf TS — `Intl` runtime davranışı browser/node arası farklı).
const timezoneSchema = z.string().min(1).max(100);

const recipientEmailSchema = z.string().email().toLowerCase();

export const scheduleCreateSchema = z.object({
  savedReportId: idSchema,
  cadenceConfig: cadenceConfigSchema,
  timezone: timezoneSchema,
  recipientUserIds: z.array(idSchema).default([]),
  recipientEmails: z.array(recipientEmailSchema).default([]),
  isActive: z.boolean().default(true),
});
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;

export const scheduleUpdateSchema = z.object({
  id: idSchema,
  cadenceConfig: cadenceConfigSchema.optional(),
  timezone: timezoneSchema.optional(),
  recipientUserIds: z.array(idSchema).optional(),
  recipientEmails: z.array(recipientEmailSchema).optional(),
  isActive: z.boolean().optional(),
});
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;

// ─── Render listing + Export ───────────────────────────────────────────────

export const reportRenderListSchema = z.object({
  workspaceId: idSchema,
  savedReportId: idSchema.optional(),
  scheduleId: idSchema.optional(),
  status: reportRenderStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ReportRenderListInput = z.infer<typeof reportRenderListSchema>;

/**
 * Export source: ya kaydedilmiş bir rapor (saved), ya ad-hoc bir composer
 * snapshot'ı. Discriminated union — branch'lere göre payload farklı.
 *
 * `assetTarget` opsiyonel: PNG/SVG export'unda tek bir micro-report
 * widget'ını hedeflemek için (`{ microReportId }`).
 */
export const reportExportSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('saved'),
    savedReportId: idSchema,
    format: reportRenderFormatSchema,
    assetTarget: z.object({ microReportId: z.string().min(1) }).optional(),
  }),
  z
    .object({
      source: z.literal('adhoc'),
      workspaceId: idSchema,
      scope: reportScopeSchema,
      presetId: z.string().min(1),
      filters: reportFiltersSchema,
      microReports: z.array(microReportSelectionSchema),
      comparison: comparisonConfigSchema.nullable().optional(),
      format: reportRenderFormatSchema,
      assetTarget: z.object({ microReportId: z.string().min(1) }).optional(),
    })
    .refine((v) => v.workspaceId === v.scope.workspaceId, {
      message: 'workspaceId ile scope.workspaceId aynı olmalı',
      path: ['scope', 'workspaceId'],
    }),
]);
export type ReportExportInput = z.infer<typeof reportExportSchema>;
