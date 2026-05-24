/**
 * Faz 13P ([DEM-272](https://linear.app/demirkol/issue/DEM-272)) — rapor
 * render retention policy (saf helper).
 *
 * Spec:
 *  - `docs/architecture/16-raporlama-mimarisi.md` §16 risk tablosu (90g + dry-run).
 *  - `docs/domain/09-raporlama-kurallari.md` §9.10 (persistence — saved'in son
 *    5 sürümü hep tutulur, ad-hoc 90g).
 *
 * Politika:
 *  - **Saved-attached render'lar** (`savedReportId IS NOT NULL`): bir saved
 *    report'un en yeni `keepVersions` sürümü yaşa bakılmaksızın korunur. Geri
 *    kalan sürümler `maxAgeDays`'ten eski ise silinir, değilse tutulur.
 *  - **Ad-hoc render'lar** (`savedReportId IS NULL`): `maxAgeDays`'ten eski
 *    ise silinir, değilse tutulur.
 *
 * Helper saf TS — DB/S3/Drizzle import etmez. Worker
 * (`apps/worker/src/jobs/report-retention.ts`) bu kararları DB satırlarına
 * uygulayan I/O katmanını taşır.
 */

/** Saved report'un her zaman korunan en yeni sürüm sayısı. */
export const RETENTION_KEEP_VERSIONS = 5;

/** 90 günden eski render'lar silinir (saved son N hariç). */
export const RETENTION_MAX_AGE_DAYS = 90;

/** Tek render satırı için verilen karar + log/test için sebep. */
export type RenderRetentionAction = 'keep' | 'delete';

export type RenderRetentionReason =
  /** Saved report'un en yeni `keepVersions` sürümünden biri — yaşa bakılmaz. */
  | 'kept_recent_version'
  /** `maxAgeDays` içinde — saved/ad-hoc fark etmez, tutulur. */
  | 'kept_under_age'
  /** Saved sürümlerinden eski olanı + age aşımı — silinir. */
  | 'superseded_by_newer_versions'
  /** Ad-hoc render `maxAgeDays`'ten eski — silinir. */
  | 'ad_hoc_expired';

export interface RenderRetentionDecision {
  renderId: string;
  action: RenderRetentionAction;
  reason: RenderRetentionReason;
}

interface SavedRenderRow {
  id: string;
  version: number;
  createdAt: Date;
}

interface AdHocRenderRow {
  id: string;
  createdAt: Date;
}

/**
 * Bir saved report'un render listesi için retention kararı dizisi döner.
 *
 * - En yeni `keepVersions` sürüm her zaman `keep` (sebep `kept_recent_version`).
 *   Sürüm yarışı: aynı `version` iki satıra atanmışsa (DB hatası veya legacy
 *   data) `createdAt DESC` ikincil sırasıyla deterministik karar.
 * - Korunan setin dışındaki sürümler `maxAgeDays` içinde ise `keep` (sebep
 *   `kept_under_age`); eski ise `delete` (sebep `superseded_by_newer_versions`).
 *
 * Boş liste → boş array.
 */
export function decideSavedReportRenderRetention(args: {
  renders: ReadonlyArray<SavedRenderRow>;
  now: Date;
  keepVersions?: number;
  maxAgeDays?: number;
}): RenderRetentionDecision[] {
  const keepVersions = args.keepVersions ?? RETENTION_KEEP_VERSIONS;
  const maxAgeDays = args.maxAgeDays ?? RETENTION_MAX_AGE_DAYS;
  if (!Number.isFinite(keepVersions) || keepVersions < 0) {
    throw new Error('decideSavedReportRenderRetention: keepVersions >= 0 required');
  }
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new Error('decideSavedReportRenderRetention: maxAgeDays >= 0 required');
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  // Version DESC, createdAt DESC (deterministic tie-break — duplicate version'lar
  // ortaya çıkarsa en yeni timestamp'li satır "yeni" sayılır).
  const sorted = [...args.renders].sort((a, b) => {
    if (b.version !== a.version) return b.version - a.version;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const protectedIds = new Set<string>(
    sorted.slice(0, keepVersions).map((row) => row.id),
  );

  return sorted.map((render) => {
    if (protectedIds.has(render.id)) {
      return {
        renderId: render.id,
        action: 'keep' as const,
        reason: 'kept_recent_version' as const,
      };
    }
    const ageMs = args.now.getTime() - render.createdAt.getTime();
    if (ageMs <= maxAgeMs) {
      return {
        renderId: render.id,
        action: 'keep' as const,
        reason: 'kept_under_age' as const,
      };
    }
    return {
      renderId: render.id,
      action: 'delete' as const,
      reason: 'superseded_by_newer_versions' as const,
    };
  });
}

/**
 * Ad-hoc render (savedReportId null) için retention kararı. Saved versiyon
 * koruması YOK — sadece `maxAgeDays` eşiği.
 */
export function decideAdHocRenderRetention(args: {
  render: AdHocRenderRow;
  now: Date;
  maxAgeDays?: number;
}): RenderRetentionDecision {
  const maxAgeDays = args.maxAgeDays ?? RETENTION_MAX_AGE_DAYS;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new Error('decideAdHocRenderRetention: maxAgeDays >= 0 required');
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const ageMs = args.now.getTime() - args.render.createdAt.getTime();
  if (ageMs <= maxAgeMs) {
    return {
      renderId: args.render.id,
      action: 'keep',
      reason: 'kept_under_age',
    };
  }
  return {
    renderId: args.render.id,
    action: 'delete',
    reason: 'ad_hoc_expired',
  };
}
