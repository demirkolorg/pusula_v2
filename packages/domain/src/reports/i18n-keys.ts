/**
 * Faz 13C — i18n key sabitleri (DEM-259). Hardcode string sızıntısını
 * önlemek için tüm UI/email metinleri buradan referans alır.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.12 +
 * `docs/domain/09-raporlama-kurallari.md` (genel "UI hardcode metin
 * içermez" disiplini).
 *
 * Key formatı: `reports.<bucket>.<segment>[.<sub>]`. Translator dosyaları
 * (`apps/web/src/locales/{tr,en}/reports.json`) bu hiyerarşiye uyar
 * (13Q DEM-273'te tarama + ESLint kuralı).
 */
import { MICRO_REPORT_IDS } from './registry';
import { PRESET_IDS } from './presets';
import {
  CARD_STATUS_FILTERS,
  CHECKLIST_STATUS_FILTERS,
  COMPARISON_MODES,
  LABEL_FILTER_MODES,
  MEMBER_RELATIONS,
  RANGE_PRESETS,
  REPORT_RENDER_FORMATS,
  REPORT_RENDER_STATUSES,
  REPORT_SCHEDULE_CADENCES,
} from './types';

function toSegment(id: string): string {
  return id.replace(/[.-]([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Bir literal değer listesinden `{ value: 'reports.<prefix>.<segment>' }`
 * sabit map'i üretir — exhaustive: tüm değerler include + tip-güvenli.
 */
function keysFor<const T extends string>(
  values: ReadonlyArray<T>,
  prefix: string,
): Readonly<Record<T, string>> {
  const out: Record<string, string> = {};
  for (const v of values) {
    out[v] = `${prefix}.${toSegment(v)}`;
  }
  return Object.freeze(out) as Readonly<Record<T, string>>;
}

/**
 * Bir micro-report / preset id'sinden `.title` ve `.emptyState` (veya
 * `.description`) sub-key'leri üreten yardımcı.
 */
function titleAndAux<const T extends string>(
  ids: ReadonlyArray<T>,
  prefix: string,
  aux: 'emptyState' | 'description',
): Readonly<Record<T, { title: string; [k: string]: string }>> {
  const out: Record<string, { title: string; [k: string]: string }> = {};
  for (const id of ids) {
    const segment = toSegment(id);
    out[id] = Object.freeze({
      title: `${prefix}.${segment}.title`,
      [aux]: `${prefix}.${segment}.${aux}`,
    });
  }
  return Object.freeze(out) as Readonly<
    Record<T, { title: string; [k: string]: string }>
  >;
}

export const REPORT_I18N_KEYS = Object.freeze({
  // ─── Preset şablonları ─────────────────────────────────────────────────
  presets: titleAndAux(
    PRESET_IDS as ReadonlyArray<(typeof PRESET_IDS)[number]>,
    'reports.presets',
    'description',
  ),

  // ─── Micro-report'lar (30) ─────────────────────────────────────────────
  microReports: titleAndAux(
    MICRO_REPORT_IDS as ReadonlyArray<(typeof MICRO_REPORT_IDS)[number]>,
    'reports.microReports',
    'emptyState',
  ),

  // ─── Filtreler ─────────────────────────────────────────────────────────
  filters: Object.freeze({
    range: keysFor(RANGE_PRESETS, 'reports.filters.range'),
    members: Object.freeze({
      label: 'reports.filters.members.label',
      placeholder: 'reports.filters.members.placeholder',
      relations: keysFor(MEMBER_RELATIONS, 'reports.filters.members.relations'),
    }),
    labels: Object.freeze({
      label: 'reports.filters.labels.label',
      placeholder: 'reports.filters.labels.placeholder',
      mode: keysFor(LABEL_FILTER_MODES, 'reports.filters.labels.mode'),
    }),
    scope: Object.freeze({
      cardStatus: keysFor(CARD_STATUS_FILTERS, 'reports.filters.scope.cardStatus'),
      checklistStatus: keysFor(
        CHECKLIST_STATUS_FILTERS,
        'reports.filters.scope.checklistStatus',
      ),
      includeArchivedLists: 'reports.filters.scope.includeArchivedLists',
      listIds: 'reports.filters.scope.listIds',
      boardIds: 'reports.filters.scope.boardIds',
    }),
  }),

  // ─── Eylemler ──────────────────────────────────────────────────────────
  actions: Object.freeze({
    preview: 'reports.actions.preview',
    save: 'reports.actions.save',
    update: 'reports.actions.update',
    delete: 'reports.actions.delete',
    duplicate: 'reports.actions.duplicate',
    refresh: 'reports.actions.refresh',
    schedule: 'reports.actions.schedule',
    export: Object.freeze({
      pdf: 'reports.actions.export.pdf',
      xlsx: 'reports.actions.export.xlsx',
      png: 'reports.actions.export.png',
      svg: 'reports.actions.export.svg',
      image: 'reports.actions.export.image',
    }),
  }),

  // ─── Trend delta rozetleri ────────────────────────────────────────────
  delta: Object.freeze({
    up: 'reports.delta.up',
    down: 'reports.delta.down',
    neutral: 'reports.delta.neutral',
    new: 'reports.delta.new',
  }),

  // ─── Restricted scope + Stale (live update) ───────────────────────────
  restricted: Object.freeze({
    banner: 'reports.restricted.banner',
    explanation: 'reports.restricted.explanation',
  }),
  stale: Object.freeze({
    badge: 'reports.stale.badge',
    message: 'reports.stale.message',
  }),

  // ─── Render status ────────────────────────────────────────────────────
  render: Object.freeze({
    status: keysFor(REPORT_RENDER_STATUSES, 'reports.render.status'),
    format: keysFor(REPORT_RENDER_FORMATS, 'reports.render.format'),
  }),

  // ─── Schedule ─────────────────────────────────────────────────────────
  schedule: Object.freeze({
    cadence: keysFor(REPORT_SCHEDULE_CADENCES, 'reports.schedule.cadence'),
    recipient: Object.freeze({
      user: 'reports.schedule.recipient.user',
      email: 'reports.schedule.recipient.email',
    }),
    isActive: 'reports.schedule.isActive',
    runNow: 'reports.schedule.runNow',
  }),

  // ─── Comparison ───────────────────────────────────────────────────────
  comparison: Object.freeze({
    toggle: 'reports.comparison.toggle',
    mode: keysFor(COMPARISON_MODES, 'reports.comparison.mode'),
  }),

  // ─── Email (scheduled delivery — Resend) ──────────────────────────────
  email: Object.freeze({
    subject: 'reports.email.subject',
    greeting: 'reports.email.greeting',
    body: 'reports.email.body',
    cta: 'reports.email.cta',
    footer: 'reports.email.footer',
  }),

  // ─── Permission deny reason'ları (canPerformReportAction sonucu) ──────
  // `permission.ts` `reason` string'leri için kullanıcıya gösterilecek
  // çeviri key'leri. tRPC procedure'leri `FORBIDDEN` mesajını bu key'le
  // beslenir.
  permissionReason: Object.freeze({
    notWorkspaceMember: 'reports.permission.notWorkspaceMember',
    notBoardMember: 'reports.permission.notBoardMember',
    workspaceMemberRequired: 'reports.permission.workspaceMemberRequired',
    workspaceAdminRequired: 'reports.permission.workspaceAdminRequired',
    workspaceOwnerRequired: 'reports.permission.workspaceOwnerRequired',
    boardAdminRequired: 'reports.permission.boardAdminRequired',
    boardAdminOrWorkspaceOwnerRequired:
      'reports.permission.boardAdminOrWorkspaceOwnerRequired',
    jsonExportNotSupportedForScope: 'reports.permission.jsonExportNotSupportedForScope',
  }),
});

export type ReportI18nKeys = typeof REPORT_I18N_KEYS;
