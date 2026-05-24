/**
 * Faz 13J ([DEM-266](https://linear.app/demirkol/issue/DEM-266)) — schedule
 * cron tick job.
 *
 * BullMQ repeatable job (every minute) `report-schedule` queue'ya basılır;
 * worker bu job'u alır ve due schedule'ları (`is_active=true AND
 * next_run_at <= NOW()`) tarar. Her due schedule için:
 *   1. `report_renders` row insert (status='queued', triggerKind='scheduled',
 *      scheduleId, version=lastVersion+1).
 *   2. `last_run_at = NOW()`, `next_run_at = computeNextRunAt(...)` update.
 *   3. `pusula-report-render` queue'ya `{ renderId }` enqueue (13I worker
 *      consume eder; completion handler scheduled branch'inde email gönderir).
 *
 * Tek schedule fail ederse diğerleri devam eder (try/catch içeride). Batch
 * limit `MAX_PER_TICK` (100) — overload guard.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §8.
 * Pattern: `notification-email-digest.ts` (Faz 10G) cron tick simetrik.
 */
import { and, asc, desc, eq, lte, sql } from '@pusula/db';
import type { Database } from '@pusula/db';
import {
  reportRenders,
  reportSchedules,
  savedReports,
  type ReportSchedule,
} from '@pusula/db';
import { computeNextRunAt, type CadenceConfig } from '@pusula/domain';

export const REPORT_SCHEDULE_TICK_JOB_NAME = 'report-schedule-tick';
// Pusula `notification-email-digest` ile aynı convention (her dakika).
export const REPORT_SCHEDULE_TICK_CRON = '* * * * *';

/** Production overload guard — bir tick'te max 100 schedule işle. */
const MAX_PER_TICK = 100;

export interface ReportScheduleTickDeps {
  db: Database;
  /**
   * 13I `pusula-report-render` queue'ya `{ renderId }` enqueue eder. Fire-
   * and-forget; Redis blip durumunda DB row 'queued' kalır + sonraki tick
   * sweeper işi üstlenir (13H Scheduled tab'da görünür). Tick fail
   * etmemeli.
   */
  enqueueReportRender: (input: { renderId: string }) => Promise<unknown> | unknown;
  /** Test deterministic. */
  now?: () => Date;
}

export interface ReportScheduleTickResult {
  scanned: number;
  enqueued: number;
  failed: number;
}

/**
 * Cron tick processor — her dakikada bir çağrılır. Pure async; BullMQ
 * Worker callback'inden çağrılır. Hata fırlatmaz (sweeper disiplini).
 */
export async function processReportScheduleTick(
  deps: ReportScheduleTickDeps,
): Promise<ReportScheduleTickResult> {
  const now = deps.now ?? (() => new Date());
  const tickAt = now();

  // 1. Due schedule'ları tara (partial index `report_schedules_next_run_idx`
  // is_active=true filter zaten 13B'de). ORDER BY next_run_at ASC → en eski
  // gecikme önce işlenir (fairness).
  const due = await deps.db
    .select()
    .from(reportSchedules)
    .where(
      and(
        eq(reportSchedules.isActive, true),
        lte(reportSchedules.nextRunAt, tickAt),
      ),
    )
    .orderBy(asc(reportSchedules.nextRunAt))
    .limit(MAX_PER_TICK);

  if (due.length === 0) {
    return { scanned: 0, enqueued: 0, failed: 0 };
  }

  let enqueued = 0;
  let failed = 0;

  for (const schedule of due) {
    try {
      const renderId = await processSingleSchedule(deps, schedule, tickAt);
      if (renderId) {
        // Best-effort enqueue (Redis blip toleransı — DB row 'queued'
        // kaldığı için 13H Scheduled tab'da kullanıcı manuel "Hemen
        // çalıştır" diyebilir; veya 13P retention worker zamanla
        // recover edebilir 13P scope dışı).
        try {
          await deps.enqueueReportRender({ renderId });
          enqueued += 1;
        } catch (err) {
          console.warn(
            `[worker:report-schedule-tick] enqueue failed for renderId=${renderId} schedule=${schedule.id}:`,
            err instanceof Error ? err.message : String(err),
          );
          // DB row zaten 'queued' status'unda — sweeper/operator recover eder.
          failed += 1;
        }
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `[worker:report-schedule-tick] schedule=${schedule.id} failed:`,
        err instanceof Error ? err.message : String(err),
      );
      // Tek schedule fail diğerlerini durdurmaz.
    }
  }

  return { scanned: due.length, enqueued, failed };
}

/**
 * Tek schedule için DB transaction:
 *  - saved row + last version oku
 *  - report_renders INSERT (status='queued')
 *  - reportSchedules.lastRunAt + nextRunAt UPDATE
 *
 * Sonsuz döngü engeli: `computeNextRunAt` always `> from` döner. Aynı
 * tick'te aynı schedule iki kez işlenmez (next_run_at güncellendiği için).
 */
async function processSingleSchedule(
  deps: ReportScheduleTickDeps,
  schedule: ReportSchedule,
  tickAt: Date,
): Promise<string | null> {
  return await deps.db.transaction(async (tx) => {
    // 1. Saved row oku
    const [saved] = await tx
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, schedule.savedReportId))
      .limit(1);
    if (!saved) {
      // Saved silinmiş — schedule de cleanup gerek. V1: schedule pasif yap.
      await tx
        .update(reportSchedules)
        .set({ isActive: false })
        .where(eq(reportSchedules.id, schedule.id));
      return null;
    }

    // 2. Last version (saved report için)
    const [lastVersion] = await tx
      .select({ version: reportRenders.version })
      .from(reportRenders)
      .where(eq(reportRenders.savedReportId, saved.id))
      .orderBy(desc(reportRenders.version))
      .limit(1);
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    // 3. report_renders INSERT (status='queued', triggerKind='scheduled')
    const [render] = await tx
      .insert(reportRenders)
      .values({
        workspaceId: saved.workspaceId,
        savedReportId: saved.id,
        scheduleId: schedule.id,
        scopeKind: saved.scopeKind,
        scopeId: saved.scopeId,
        presetId: saved.presetId,
        filters: saved.filters,
        comparison: saved.comparison,
        status: 'queued',
        format: 'pdf', // V1: scheduled sadece PDF teslim eder
        version: nextVersion,
        triggeredBy: null, // sistem tetiği — schedule.createdBy alternatif düşünüldü ama trigger karmaşıklığını azaltmak için null
        triggerKind: 'scheduled',
      })
      .returning({ id: reportRenders.id });

    // 4. Schedule last/next run güncelle. Sonsuz döngü engeli:
    // computeNextRunAt always > tickAt (cadence helper invariant).
    const nextRunAt = computeNextRunAt({
      config: schedule.cadenceConfig as CadenceConfig,
      timezone: schedule.timezone,
      from: tickAt,
    });
    await tx
      .update(reportSchedules)
      .set({
        lastRunAt: tickAt,
        nextRunAt,
        // Drizzle camelCase keys + snake_case DB columns
        // `updatedAt` zaten triggered by Drizzle defaults; manuel set yok.
        updatedAt: sql`NOW()`,
      })
      .where(eq(reportSchedules.id, schedule.id));

    return render!.id;
  });
}
