/**
 * Faz 13P ([DEM-272](https://linear.app/demirkol/issue/DEM-272)) — rapor
 * render retention worker.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16 (risk tablosu +
 * `REPORT_RETENTION_DRY_RUN`) + `docs/domain/09-raporlama-kurallari.md` §9.10
 * (persistence — saved'in son 5 sürümü hep tutulur, ad-hoc 90g).
 *
 * Akış (her tick — daily 03:00 UTC):
 *   1. Eski (`created_at < NOW() - maxAgeDays`) saved-attached render satırı
 *      olan saved report id'lerini topla (group by `saved_report_id`).
 *   2. Her aday saved için TÜM render satırlarını oku +
 *      `decideSavedReportRenderRetention` ile karar dizisini hesapla.
 *   3. Her `delete` karar için MinIO obje(leri) sil → asset satırlarını sil →
 *      render satırını sil (S3-first, DB-second; atomik DB tx).
 *   4. Ad-hoc (savedReportId IS NULL) render'lar için yaş filtresi + her birini
 *      `decideAdHocRenderRetention` ile değerlendir + delete uygula.
 *   5. Sentry: silme operasyonu fail ederse `captureException` (renderId,
 *      savedReportId, reason context'i ile). Tick batch'ini durdurmaz.
 *
 * Dry-run mode (`REPORT_RETENTION_DRY_RUN=true`): hiçbir DB satırı veya MinIO
 * objesi silinmez; sadece log + counter döner. Production'ın ilk haftası bu
 * mod aktif (kullanıcı manual log review sonrası `false` yapar).
 *
 * Pattern: `attachment-cleanup-sweeper.ts` (Faz 11C) ile storage-first + DB-
 * second disiplini; `report-schedule-tick.ts` (Faz 13J) ile fail-isolation
 * (tek render fail diğerlerini durdurmaz). Worker concurrency=1 — race YOK.
 */
import { and, asc, eq, isNotNull, isNull, lt } from '@pusula/db';
import type { Database } from '@pusula/db';
import {
  reportRenderAssets,
  reportRenders,
  type ReportRenderAsset,
} from '@pusula/db';
import {
  RETENTION_KEEP_VERSIONS,
  RETENTION_MAX_AGE_DAYS,
  decideAdHocRenderRetention,
  decideSavedReportRenderRetention,
  type RenderRetentionDecision,
} from '@pusula/api/lib/report-retention-policy';

/** BullMQ job ismi — daily cron tick. */
export const REPORT_RETENTION_TICK_JOB_NAME = 'report-retention-tick';

/** Daily 03:00 UTC — düşük trafik penceresi. */
export const REPORT_RETENTION_TICK_CRON = '0 3 * * *';

/** Tek tick'te taranan max distinct saved report sayısı. */
export const MAX_SAVED_PER_TICK = 200;

/** Tek tick'te işlenen max ad-hoc render sayısı. */
export const MAX_AD_HOC_PER_TICK = 500;

/** Sentry-compatible captureException surface. */
export interface RetentionErrorReporter {
  (err: Error, context?: Record<string, unknown>): void;
}

export interface ReportRetentionStorage {
  /**
   * MinIO/S3 obje silme. `attachment-cleanup`'taki `s3DeleteObjectAdapter`
   * pattern'i — `NoSuchKey`/404 idempotent (zaten yok = OK).
   */
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
}

export interface ReportRetentionTickDeps {
  db: Database;
  storage: ReportRetentionStorage;
  /** Dry-run modunda hiçbir DB/S3 silimi yapılmaz; sadece counter + log. */
  dryRun: boolean;
  /** Sentry breadcrumb — best-effort, undefined ise sessiz. */
  captureException?: RetentionErrorReporter;
  /** Override — default 5. */
  keepVersions?: number;
  /** Override — default 90. */
  maxAgeDays?: number;
  /** Override — default 200. */
  maxSavedPerTick?: number;
  /** Override — default 500. */
  maxAdHocPerTick?: number;
  /** Test deterministic now. */
  now?: () => Date;
}

export interface ReportRetentionTickResult {
  /** Toplam evaluated render sayısı (saved + ad-hoc). */
  evaluated: number;
  /** Politika "keep" diyen sayım. */
  kept: number;
  /** Politika "delete" diyen ve fiilen silinen (veya dry-run'da silinmiş gibi sayılan). */
  deleted: number;
  /** Silme sırasında hata yakalanan sayım (Sentry'ye iletildi). */
  failed: number;
  /** Distinct saved report aday sayısı. */
  savedScanned: number;
  /** Ad-hoc aday sayısı. */
  adHocScanned: number;
  dryRun: boolean;
}

/**
 * Daily retention tick. Hata fırlatmaz — tek satır fail edip diğerleri devam
 * edebilir (sweeper disiplini). Tick'in kendisi BullMQ retry'a düşmez (idle
 * job), zaten daily.
 */
export async function processReportRetentionTick(
  deps: ReportRetentionTickDeps,
): Promise<ReportRetentionTickResult> {
  const now = deps.now ?? (() => new Date());
  const tickAt = now();
  const keepVersions = deps.keepVersions ?? RETENTION_KEEP_VERSIONS;
  const maxAgeDays = deps.maxAgeDays ?? RETENTION_MAX_AGE_DAYS;
  const maxSavedPerTick = deps.maxSavedPerTick ?? MAX_SAVED_PER_TICK;
  const maxAdHocPerTick = deps.maxAdHocPerTick ?? MAX_AD_HOC_PER_TICK;
  const cutoff = new Date(tickAt.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  const stats: ReportRetentionTickResult = {
    evaluated: 0,
    kept: 0,
    deleted: 0,
    failed: 0,
    savedScanned: 0,
    adHocScanned: 0,
    dryRun: deps.dryRun,
  };

  // ─── 1. Saved-attached render'lar ──────────────────────────────────────
  // En az 1 eski sürümü olan saved report aday id'leri (group by + limit).
  // Saved tamamen yeniyse aday değildir (keep koruması zaten sağlanır TTL
  // beklemeden — sadece overhead'i azaltır).
  //
  // ORDER BY savedReportId ASC deterministik sıra — `maxSavedPerTick`
  // aşıldığında bir sonraki tick'in kalan adayları toplaması için stable
  // pencere garantisi (code-review W1). Postgres `GROUP BY` aksi halde
  // sıralama garantisi vermez; 201+ saved varsa farklı subset gelir ve
  // bazı saved'ler hiç temizlenmeyebilir.
  const savedCandidates = await deps.db
    .select({ savedReportId: reportRenders.savedReportId })
    .from(reportRenders)
    .where(
      and(
        isNotNull(reportRenders.savedReportId),
        lt(reportRenders.createdAt, cutoff),
      ),
    )
    .groupBy(reportRenders.savedReportId)
    .orderBy(asc(reportRenders.savedReportId))
    .limit(maxSavedPerTick);
  stats.savedScanned = savedCandidates.length;

  for (const candidate of savedCandidates) {
    const savedReportId = candidate.savedReportId;
    if (!savedReportId) continue;

    let renders: Array<{ id: string; version: number; createdAt: Date }>;
    try {
      renders = await deps.db
        .select({
          id: reportRenders.id,
          version: reportRenders.version,
          createdAt: reportRenders.createdAt,
        })
        .from(reportRenders)
        .where(eq(reportRenders.savedReportId, savedReportId));
    } catch (err) {
      stats.failed += 1;
      report(deps, err, { savedReportId, stage: 'fetch_saved_renders' });
      continue;
    }

    const decisions = decideSavedReportRenderRetention({
      renders,
      now: tickAt,
      keepVersions,
      maxAgeDays,
    });

    for (const decision of decisions) {
      stats.evaluated += 1;
      if (decision.action === 'keep') {
        stats.kept += 1;
        continue;
      }
      const ok = await tryDeleteRender(deps, decision, savedReportId);
      if (ok) stats.deleted += 1;
      else stats.failed += 1;
    }
  }

  // ─── 2. Ad-hoc (savedReportId IS NULL) render'lar ──────────────────────
  // Yaş filtresi DB-side; her aday zaten "delete" kararı alacak (policy
  // sembolik olarak uygulanır — log + sebep tutarlılığı).
  let adHocCandidates: Array<{ id: string; createdAt: Date }> = [];
  try {
    adHocCandidates = await deps.db
      .select({ id: reportRenders.id, createdAt: reportRenders.createdAt })
      .from(reportRenders)
      .where(
        and(
          isNull(reportRenders.savedReportId),
          lt(reportRenders.createdAt, cutoff),
        ),
      )
      .orderBy(asc(reportRenders.createdAt))
      .limit(maxAdHocPerTick);
  } catch (err) {
    report(deps, err, { stage: 'fetch_ad_hoc_candidates' });
  }
  stats.adHocScanned = adHocCandidates.length;

  for (const render of adHocCandidates) {
    stats.evaluated += 1;
    const decision = decideAdHocRenderRetention({
      render,
      now: tickAt,
      maxAgeDays,
    });
    if (decision.action === 'keep') {
      // Edge: DB filtresi cutoff'u çoktan geçirmiş ama clock skew (gelecek
      // createdAt) policy'yi keep'e döndürebilir.
      stats.kept += 1;
      continue;
    }
    const ok = await tryDeleteRender(deps, decision, null);
    if (ok) stats.deleted += 1;
    else stats.failed += 1;
  }

  return stats;
}

/**
 * Tek render için: MinIO objelerini sil → asset rows sil → render row sil.
 * S3 404'leri tolere; gerçek hata yakalanırsa stats `failed` artar ve Sentry
 * breadcrumb gönderilir. Dry-run modu silimi atlayarak true döner (sayım
 * sembolik).
 */
async function tryDeleteRender(
  deps: ReportRetentionTickDeps,
  decision: RenderRetentionDecision,
  savedReportId: string | null,
): Promise<boolean> {
  if (deps.dryRun) {
    console.warn(
      `[worker:report-retention] [DRY-RUN] would delete renderId=${decision.renderId} ` +
        `reason=${decision.reason}${savedReportId ? ` savedReportId=${savedReportId}` : ''}`,
    );
    return true;
  }

  let assets: ReportRenderAsset[];
  try {
    assets = await deps.db
      .select()
      .from(reportRenderAssets)
      .where(eq(reportRenderAssets.renderId, decision.renderId));
  } catch (err) {
    report(deps, err, {
      renderId: decision.renderId,
      reason: decision.reason,
      savedReportId,
      stage: 'fetch_assets',
    });
    return false;
  }

  // Storage-first: tek tek sil. Hata: 404'ler tolere, gerçek 5xx throw → tüm
  // render silimini atla (bir sonraki tick tekrar dener).
  for (const asset of assets) {
    try {
      await deps.storage.deleteObject({ bucket: asset.s3Bucket, key: asset.s3Key });
    } catch (err) {
      if (isObjectMissingError(err)) {
        // Idempotent — zaten yok.
        continue;
      }
      report(deps, err, {
        renderId: decision.renderId,
        s3Bucket: asset.s3Bucket,
        s3Key: asset.s3Key,
        reason: decision.reason,
        savedReportId,
        stage: 'storage_delete',
      });
      return false;
    }
  }

  // DB-second: asset + render satırını atomik tek tx'te sil. asset cascade
  // zaten render delete'de tetiklenirdi ama açık silim — cascade davranışı
  // gelecekteki refactor'a bırakılmaz.
  try {
    await deps.db.transaction(async (tx) => {
      await tx
        .delete(reportRenderAssets)
        .where(eq(reportRenderAssets.renderId, decision.renderId));
      await tx.delete(reportRenders).where(eq(reportRenders.id, decision.renderId));
    });
  } catch (err) {
    report(deps, err, {
      renderId: decision.renderId,
      reason: decision.reason,
      savedReportId,
      stage: 'db_delete',
    });
    return false;
  }

  return true;
}

/**
 * Best-effort Sentry breadcrumb + console.warn. `captureException` undefined
 * ise sadece log.
 */
function report(
  deps: ReportRetentionTickDeps,
  err: unknown,
  context: Record<string, unknown>,
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  console.warn(
    `[worker:report-retention] ${context.stage ?? 'unknown'} failed:`,
    error.message,
    context,
  );
  // Sentry capture'ı try/catch — telemetry hatası tick'i etkilemez.
  if (deps.captureException) {
    try {
      deps.captureException(error, context);
    } catch (sentryErr) {
      console.warn(
        '[worker:report-retention] captureException itself threw:',
        sentryErr instanceof Error ? sentryErr.message : String(sentryErr),
      );
    }
  }
}

/** S3 SDK error name veya HTTP status'tan "obje yok" tespiti. */
export function isObjectMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (candidate.name === 'NoSuchKey' || candidate.name === 'NotFound') return true;
  if (candidate.Code === 'NoSuchKey' || candidate.Code === 'NotFound') return true;
  const status = candidate.$metadata?.httpStatusCode;
  return typeof status === 'number' && status === 404;
}
