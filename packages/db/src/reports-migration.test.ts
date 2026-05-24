import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from './index';
import {
  reportRenderAssets,
  reportRenders,
  reportSchedules,
  savedReports,
} from './schema/reports';

/**
 * Faz 13B (DEM-258) — migration `0035_dem258_faz13B_reports.sql` doğrulama
 * testi. Raporlama sisteminin 4 tablosunu (`saved_reports`, `report_schedules`,
 * `report_renders`, `report_render_assets`) + 4 enum'ı + index/FK/CHECK
 * yapısını ekler. Kanonik referans: `docs/architecture/16-raporlama-mimarisi.md`
 * §16.3.
 *
 * `attachments-migration.test.ts` pattern'i takip edilir:
 *   - Schema-shape + migration .sql metni assertion'ları (DB gerektirmez)
 *   - Canlı DB integration block (`describe.runIf(dbAvailable)`) — Postgres
 *     ulaşılamazsa atlanır ama discoverable kalır.
 */

const MIGRATION_FILE = '0035_dem258_faz13B_reports.sql';

// --- Schema-shape assertions (no DB required) --------------------------------

describe('reports schema shape', () => {
  it('saved_reports has the documented column set with text PK/FK', () => {
    const columns = getTableColumns(savedReports);

    expect(Object.keys(columns)).toEqual([
      'id',
      'workspaceId',
      'scopeKind',
      'scopeId',
      'presetId',
      'title',
      'description',
      'filters',
      'microReports',
      'comparison',
      'createdBy',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(columns.id?.getSQLType()).toBe('text');
    expect(columns.workspaceId?.getSQLType()).toBe('text');
    expect(columns.createdBy?.getSQLType()).toBe('text');
    expect(columns.scopeId?.getSQLType()).toBe('text');
    expect(columns.filters?.getSQLType()).toBe('jsonb');
    expect(columns.microReports?.getSQLType()).toBe('jsonb');
    expect(columns.comparison?.getSQLType()).toBe('jsonb');
    expect(columns.comparison?.notNull).toBe(false);
    expect(columns.archivedAt?.notNull).toBe(false);
  });

  it('report_schedules carries the cron-tick + array-recipient columns', () => {
    const columns = getTableColumns(reportSchedules);

    expect(Object.keys(columns)).toEqual([
      'id',
      'savedReportId',
      'cadence',
      'cadenceConfig',
      'timezone',
      'recipientUserIds',
      'recipientEmails',
      'isActive',
      'lastRunAt',
      'nextRunAt',
      'createdBy',
      'createdAt',
      'updatedAt',
    ]);
    expect(columns.recipientUserIds?.getSQLType()).toBe('text[]');
    expect(columns.recipientEmails?.getSQLType()).toBe('text[]');
    expect(columns.isActive?.notNull).toBe(true);
    expect(columns.nextRunAt?.notNull).toBe(true);
  });

  it('report_renders carries the snapshot + status + version columns + check', () => {
    const columns = getTableColumns(reportRenders);

    expect(Object.keys(columns)).toEqual([
      'id',
      'workspaceId',
      'savedReportId',
      'scheduleId',
      'scopeKind',
      'scopeId',
      'presetId',
      'filters',
      'comparison',
      'status',
      'format',
      'restrictedScope',
      // Faz 13L (DEM-268) — PNG/SVG için microReportId hedef.
      'assetTarget',
      'version',
      'triggeredBy',
      'triggerKind',
      'startedAt',
      'completedAt',
      'errorMessage',
      'createdAt',
    ]);
    expect(columns.version?.getSQLType()).toBe('integer');
    expect(columns.savedReportId?.notNull).toBe(false);
    expect(columns.scheduleId?.notNull).toBe(false);
    expect(columns.restrictedScope?.notNull).toBe(false);

    const config = getTableConfig(reportRenders);
    expect(config.checks.map((c) => c.name)).toContain('report_renders_trigger_kind_check');
  });

  it('report_render_assets carries MinIO object metadata', () => {
    const columns = getTableColumns(reportRenderAssets);

    expect(Object.keys(columns)).toEqual([
      'id',
      'renderId',
      'format',
      's3Bucket',
      's3Key',
      'byteSize',
      'checksum',
      'expiresAt',
      'createdAt',
    ]);
    expect(columns.byteSize?.getSQLType()).toBe('bigint');
    expect(columns.checksum?.notNull).toBe(false);
    expect(columns.expiresAt?.notNull).toBe(false);
  });

  it('exposes the workspace + scope + saved + next-run + scope-id indexes', () => {
    const savedConfig = getTableConfig(savedReports);
    const savedIndexNames = savedConfig.indexes.map((b) => b.config.name);
    expect(savedIndexNames).toEqual(
      expect.arrayContaining(['saved_reports_workspace_idx', 'saved_reports_scope_idx']),
    );

    const scheduleConfig = getTableConfig(reportSchedules);
    const nextRunIdx = scheduleConfig.indexes
      .map((b) => b.config)
      .find((c) => c.name === 'report_schedules_next_run_idx');
    expect(nextRunIdx).toBeDefined();
    // Partial index: only `is_active = true` rows.
    expect(nextRunIdx?.where).toBeDefined();

    const renderConfig = getTableConfig(reportRenders);
    const renderIndexNames = renderConfig.indexes.map((b) => b.config.name);
    expect(renderIndexNames).toEqual(
      expect.arrayContaining([
        'report_renders_workspace_idx',
        'report_renders_saved_idx',
        // Faz 13P (DEM-272) — retention partial indexes
        'report_renders_retention_saved_idx',
        'report_renders_retention_adhoc_idx',
      ]),
    );
    // Both retention indexes are partial — `where` clause set.
    const retentionSavedIdx = renderConfig.indexes
      .map((b) => b.config)
      .find((c) => c.name === 'report_renders_retention_saved_idx');
    expect(retentionSavedIdx?.where).toBeDefined();
    const retentionAdHocIdx = renderConfig.indexes
      .map((b) => b.config)
      .find((c) => c.name === 'report_renders_retention_adhoc_idx');
    expect(retentionAdHocIdx?.where).toBeDefined();
  });
});

// --- Static migration-file assertions ----------------------------------------

describe('0035 reports migration file', () => {
  const migrationPath = resolve(import.meta.dirname, '..', 'drizzle', MIGRATION_FILE);

  it('exists in the drizzle migrations folder', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('declares the four new enums', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toContain(
      `CREATE TYPE "public"."report_scope_kind" AS ENUM('card', 'list', 'board', 'workspace')`,
    );
    expect(sqlText).toContain(
      `CREATE TYPE "public"."report_schedule_cadence" AS ENUM('daily', 'weekly', 'monthly')`,
    );
    expect(sqlText).toContain(
      `CREATE TYPE "public"."report_render_status" AS ENUM('queued', 'rendering', 'completed', 'failed', 'expired')`,
    );
    expect(sqlText).toContain(
      `CREATE TYPE "public"."report_render_format" AS ENUM('pdf', 'xlsx', 'png')`,
    );
  });

  it('creates the four new tables with text PK', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(/CREATE TABLE "saved_reports" \([\s\S]*?"id" text PRIMARY KEY NOT NULL/);
    expect(sqlText).toMatch(
      /CREATE TABLE "report_schedules" \([\s\S]*?"id" text PRIMARY KEY NOT NULL/,
    );
    expect(sqlText).toMatch(
      /CREATE TABLE "report_renders" \([\s\S]*?"id" text PRIMARY KEY NOT NULL/,
    );
    expect(sqlText).toMatch(
      /CREATE TABLE "report_render_assets" \([\s\S]*?"id" text PRIMARY KEY NOT NULL/,
    );
  });

  it('wires up FK cascade behavior (workspace + saved + schedule + render)', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    // saved_reports.workspace_id → workspaces cascade
    expect(sqlText).toMatch(
      /saved_reports_workspace_id_workspaces_id_fk[\s\S]*?REFERENCES "public"\."workspaces"\("id"\) ON DELETE cascade/,
    );
    // saved_reports.created_by → users restrict (notNull → block delete)
    expect(sqlText).toMatch(
      /saved_reports_created_by_users_id_fk[\s\S]*?REFERENCES "public"\."users"\("id"\) ON DELETE restrict/,
    );
    // report_schedules.saved_report_id → saved_reports cascade
    expect(sqlText).toMatch(
      /report_schedules_saved_report_id_saved_reports_id_fk[\s\S]*?REFERENCES "public"\."saved_reports"\("id"\) ON DELETE cascade/,
    );
    // report_renders.workspace_id → workspaces cascade
    expect(sqlText).toMatch(
      /report_renders_workspace_id_workspaces_id_fk[\s\S]*?REFERENCES "public"\."workspaces"\("id"\) ON DELETE cascade/,
    );
    // report_renders.saved_report_id → saved_reports cascade (nullable)
    expect(sqlText).toMatch(
      /report_renders_saved_report_id_saved_reports_id_fk[\s\S]*?REFERENCES "public"\."saved_reports"\("id"\) ON DELETE cascade/,
    );
    // report_renders.schedule_id → report_schedules set null
    expect(sqlText).toMatch(
      /report_renders_schedule_id_report_schedules_id_fk[\s\S]*?REFERENCES "public"\."report_schedules"\("id"\) ON DELETE set null/,
    );
    // report_renders.triggered_by → users set null (nullable preserves history)
    expect(sqlText).toMatch(
      /report_renders_triggered_by_users_id_fk[\s\S]*?REFERENCES "public"\."users"\("id"\) ON DELETE set null/,
    );
    // report_render_assets.render_id → report_renders cascade
    expect(sqlText).toMatch(
      /report_render_assets_render_id_report_renders_id_fk[\s\S]*?REFERENCES "public"\."report_renders"\("id"\) ON DELETE cascade/,
    );
  });

  it('emits the partial next_run index gated by is_active', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(
      /CREATE INDEX "report_schedules_next_run_idx" ON "report_schedules"[\s\S]*?WHERE\s+"report_schedules"\."is_active"\s*=\s*true/,
    );
  });

  it('emits the composite saved + workspace render indexes', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toContain(
      `CREATE INDEX "report_renders_workspace_idx" ON "report_renders" USING btree ("workspace_id","created_at")`,
    );
    expect(sqlText).toContain(
      `CREATE INDEX "report_renders_saved_idx" ON "report_renders" USING btree ("saved_report_id","version")`,
    );
    expect(sqlText).toContain(
      `CREATE INDEX "saved_reports_scope_idx" ON "saved_reports" USING btree ("scope_kind","scope_id")`,
    );
  });

  it('declares the trigger_kind CHECK constraint', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(
      /CONSTRAINT "report_renders_trigger_kind_check" CHECK[\s\S]*?'manual'[\s\S]*?'scheduled'[\s\S]*?'save'/,
    );
  });

  it('initializes recipient arrays to empty text[] defaults', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toContain(`"recipient_user_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL`);
    expect(sqlText).toContain(`"recipient_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL`);
  });
});

// --- Live-DB integration assertions ------------------------------------------

// Probe the DB at collection time so `describe.runIf` can react to it. The
// probe also confirms the four new tables exist (i.e. the migration ran).
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  await probe.db.execute(dbMod.sql`
    select 1 from saved_reports limit 0;
    select 1 from report_schedules limit 0;
    select 1 from report_renders limit 0;
    select 1 from report_render_assets limit 0;
  `);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('0035 reports migration (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    // Workspace cascade temizler saved_reports + report_renders + (zincirleme)
    // report_schedules + report_render_assets satırlarını. Sadece workspace +
    // user'ı silmek yeterli.
    for (const id of createdWorkspaceIds) {
      await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(dbMod.users).where(dbMod.eq(dbMod.users.id, id));
    }
    await probe?.pool.end();
  });

  /** Seed bir workspace + user; tüm test'ler bu çifti paylaşabilir. */
  async function seedWorkspaceAndUser() {
    const ownerId = newId('u-rep');
    createdUserIds.push(ownerId);
    await db()
      .insert(dbMod.users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(dbMod.workspaces)
      .values({ name: 'Reports Co', slug: newId('rep-co'), ownerId })
      .returning({ id: dbMod.workspaces.id });
    createdWorkspaceIds.push(ws!.id);
    await db()
      .insert(dbMod.workspaceMembers)
      .values({ workspaceId: ws!.id, userId: ownerId, role: 'owner' });

    return { workspaceId: ws!.id, userId: ownerId };
  }

  it('lists the four new tables in information_schema', async () => {
    const rows = await db().execute(dbMod.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN
        ('saved_reports', 'report_schedules', 'report_renders', 'report_render_assets')
      ORDER BY table_name
    `);
    expect(rows.rows.map((r) => r.table_name)).toEqual([
      'report_render_assets',
      'report_renders',
      'report_schedules',
      'saved_reports',
    ]);
  });

  it('declares the four new pg enums with their documented labels', async () => {
    // `array_agg` aggregate'i node-pg context'inde tip metadata'sıyla
    // gelmediği için array stringify (`'{a,b,c}'`) olarak döner; satır-bazlı
    // sorgu + JS-side grouping daha taşınabilir.
    const rows = await db().execute(dbMod.sql`
      SELECT t.typname AS name, e.enumlabel AS label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN
        ('report_scope_kind', 'report_schedule_cadence', 'report_render_status', 'report_render_format')
      ORDER BY t.typname, e.enumsortorder
    `);
    const byName = new Map<string, string[]>();
    for (const r of rows.rows) {
      const name = r.name as string;
      const labels = byName.get(name) ?? [];
      labels.push(r.label as string);
      byName.set(name, labels);
    }
    expect(byName.get('report_scope_kind')).toEqual(['card', 'list', 'board', 'workspace']);
    expect(byName.get('report_schedule_cadence')).toEqual(['daily', 'weekly', 'monthly']);
    expect(byName.get('report_render_status')).toEqual([
      'queued',
      'rendering',
      'completed',
      'failed',
      'expired',
    ]);
    expect(byName.get('report_render_format')).toEqual(['pdf', 'xlsx', 'png', 'svg']);
  });

  it('next_run partial index is gated by is_active = true', async () => {
    const rows = await db().execute(dbMod.sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE indexname = 'report_schedules_next_run_idx'
    `);
    expect(rows.rows[0]?.indexdef).toMatch(/is_active.*=.*true/i);
  });

  it('persists the full saved → schedule → render → asset chain', async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();

    const [saved] = await db()
      .insert(savedReports)
      .values({
        workspaceId,
        scopeKind: 'board',
        scopeId: newId('board'),
        presetId: 'board.health',
        title: 'Pano Sağlığı',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [{ microReportId: 'activity-timeline', enabled: true }],
        comparison: { enabled: true, mode: 'previousPeriod' },
        createdBy: userId,
      })
      .returning({ id: savedReports.id });

    const [schedule] = await db()
      .insert(reportSchedules)
      .values({
        savedReportId: saved!.id,
        cadence: 'daily',
        cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
        timezone: 'Europe/Istanbul',
        recipientEmails: ['alice@example.test'],
        nextRunAt: new Date(Date.now() + 24 * 3600 * 1000),
        createdBy: userId,
      })
      .returning({ id: reportSchedules.id });

    const [render] = await db()
      .insert(reportRenders)
      .values({
        workspaceId,
        savedReportId: saved!.id,
        scheduleId: schedule!.id,
        scopeKind: 'board',
        scopeId: newId('board'),
        presetId: 'board.health',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        status: 'completed',
        format: 'pdf',
        version: 1,
        triggeredBy: userId,
        triggerKind: 'scheduled',
        completedAt: new Date(),
      })
      .returning({ id: reportRenders.id });

    const [asset] = await db()
      .insert(reportRenderAssets)
      .values({
        renderId: render!.id,
        format: 'pdf',
        s3Bucket: 'pusula-reports',
        s3Key: `workspace/${workspaceId}/${render!.id}.pdf`,
        byteSize: 524_288,
        checksum: 'sha256:abc',
      })
      .returning({ id: reportRenderAssets.id });

    expect(saved?.id).toBeTruthy();
    expect(schedule?.id).toBeTruthy();
    expect(render?.id).toBeTruthy();
    expect(asset?.id).toBeTruthy();
  });

  it('rejects an invalid trigger_kind via the CHECK constraint', async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();

    // Drizzle 0.45 hatayı `DrizzleQueryError` ile wrap eder; constraint adı
    // `error.cause.constraint`'te, message'ta değil. `toThrowError(/.../)`
    // sadece `.message`'a bakar, bu yüzden manuel try/catch.
    let caught: unknown;
    try {
      await db()
        .insert(reportRenders)
        .values({
          workspaceId,
          scopeKind: 'workspace',
          scopeId: workspaceId,
          presetId: 'workspace.summary',
          filters: { range: { kind: "preset", preset: "last30d" } },
          format: 'pdf',
          triggeredBy: userId,
          triggerKind: 'bogus' as never,
        });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const pgErr = (caught as { cause?: { constraint?: string; code?: string } }).cause;
    expect(pgErr?.constraint).toBe('report_renders_trigger_kind_check');
    expect(pgErr?.code).toBe('23514'); // check_violation
  });

  // Parametrize: CHECK constraint üç dokumenter değeri de kabul etmeli.
  it.each(['manual', 'scheduled', 'save'] as const)(
    'accepts trigger_kind = %s via the CHECK constraint',
    async (kind) => {
      const { workspaceId, userId } = await seedWorkspaceAndUser();
      const [render] = await db()
        .insert(reportRenders)
        .values({
          workspaceId,
          scopeKind: 'workspace',
          scopeId: workspaceId,
          presetId: 'workspace.summary',
          filters: { range: { kind: "preset", preset: "last30d" } },
          format: 'pdf',
          triggeredBy: userId,
          triggerKind: kind,
        })
        .returning({ id: reportRenders.id, triggerKind: reportRenders.triggerKind });
      expect(render?.triggerKind).toBe(kind);
    },
  );

  // 13C ([DEM-259](https://linear.app/demirkol/issue/DEM-259)) inince
  // `filters` / `microReports` / `cadenceConfig` / `comparison` jsonb
  // alanları gerçek `@pusula/domain/reports` tiplerine bağlandı —
  // önceden burada bulunan "DB seviyesinde serbest jsonb shape kabul edilir"
  // smoke testleri obsolete oldu (artık compile-time check
  // `tsc --noEmit` ile yakalanıyor). Domain Zod validation testleri
  // `packages/domain/src/reports/__tests__/types.test.ts` altında.

  // scope_id polymorphic FK-yok kolonu için DB seviyesinde sadece notNull
  // kontrolü var; boş string DB tarafında kabul edilir. Gerçek validasyon
  // 13D tRPC procedure katmanında `idSchema` (`@pusula/domain/schemas/common`)
  // ile yapılır.
  it('accepts a (DB-level only) non-empty scope_id', async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const [saved] = await db()
      .insert(savedReports)
      .values({
        workspaceId,
        scopeKind: 'card',
        scopeId: newId('card-edge'),
        presetId: 'card.activity',
        title: 'edge',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
        createdBy: userId,
      })
      .returning({ id: savedReports.id, scopeId: savedReports.scopeId });
    expect(saved?.scopeId).toBeTruthy();
  });

  it('cascade-deletes saved_reports + renders + assets when workspace is removed', async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();

    const [saved] = await db()
      .insert(savedReports)
      .values({
        workspaceId,
        scopeKind: 'workspace',
        scopeId: workspaceId,
        presetId: 'workspace.summary',
        title: 'WS Özet',
        filters: { range: { kind: "preset", preset: "last30d" } },
        microReports: [],
        createdBy: userId,
      })
      .returning({ id: savedReports.id });

    const [render] = await db()
      .insert(reportRenders)
      .values({
        workspaceId,
        savedReportId: saved!.id,
        scopeKind: 'workspace',
        scopeId: workspaceId,
        presetId: 'workspace.summary',
        filters: { range: { kind: "preset", preset: "last30d" } },
        format: 'pdf',
        triggerKind: 'manual',
        triggeredBy: userId,
      })
      .returning({ id: reportRenders.id });

    await db()
      .insert(reportRenderAssets)
      .values({
        renderId: render!.id,
        format: 'pdf',
        s3Bucket: 'pusula-reports',
        s3Key: `workspace/${workspaceId}/${render!.id}.pdf`,
        byteSize: 1024,
      });

    // Workspace üyeliğini silmeden workspace cascade çalışmaz (ownership ref);
    // önce membership + workspace silinir, cascade saved/render/asset düşürür.
    await db()
      .delete(dbMod.workspaceMembers)
      .where(dbMod.eq(dbMod.workspaceMembers.workspaceId, workspaceId));
    await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, workspaceId));
    // Workspace afterAll cleanup'tan çıkar — manuel silindi.
    const idx = createdWorkspaceIds.indexOf(workspaceId);
    if (idx >= 0) createdWorkspaceIds.splice(idx, 1);

    const survivors = await db().execute(dbMod.sql`
      SELECT
        (SELECT count(*)::int FROM saved_reports WHERE id = ${saved!.id})         AS saved,
        (SELECT count(*)::int FROM report_renders WHERE id = ${render!.id})       AS render,
        (SELECT count(*)::int FROM report_render_assets WHERE render_id = ${render!.id}) AS assets
    `);
    expect(survivors.rows[0]?.saved).toBe(0);
    expect(survivors.rows[0]?.render).toBe(0);
    expect(survivors.rows[0]?.assets).toBe(0);
  });

  it('preserves history (set null) when a triggering user is removed', async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();

    // İkinci bir geçici user — manual render trigger eder, sonra silinir.
    const triggererId = newId('u-trig');
    await db()
      .insert(dbMod.users)
      .values({ id: triggererId, name: triggererId, email: `${triggererId}@example.test` });

    const [saved] = await db()
      .insert(savedReports)
      .values({
        workspaceId,
        scopeKind: 'workspace',
        scopeId: workspaceId,
        presetId: 'workspace.summary',
        title: 'WS',
        filters: { range: { kind: "preset", preset: "last30d" } },
        microReports: [],
        createdBy: userId,
      })
      .returning({ id: savedReports.id });

    const [render] = await db()
      .insert(reportRenders)
      .values({
        workspaceId,
        savedReportId: saved!.id,
        scopeKind: 'workspace',
        scopeId: workspaceId,
        presetId: 'workspace.summary',
        filters: { range: { kind: "preset", preset: "last30d" } },
        format: 'pdf',
        triggerKind: 'manual',
        triggeredBy: triggererId,
      })
      .returning({ id: reportRenders.id });

    await db().delete(dbMod.users).where(dbMod.eq(dbMod.users.id, triggererId));

    const after = await db()
      .select({ triggeredBy: reportRenders.triggeredBy })
      .from(reportRenders)
      .where(dbMod.eq(reportRenders.id, render!.id));
    expect(after[0]?.triggeredBy).toBeNull();
  });
});
