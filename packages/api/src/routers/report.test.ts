/**
 * Faz 13D integration tests — report router (DEM-260).
 *
 * Live Postgres + tRPC caller pattern (board.test.ts ile aynı). DB
 * yoksa suite skip; lokal `pnpm infra:up` + `pnpm db:migrate` gerekir
 * (13B migration zaten uygulanmış olmalı).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  boardMembers,
  reportRenders,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { issuePrintToken } from '../lib/report-print-token';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext } from '../context';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  // 13B/0035 migration applied probe.
  await probe.db.execute(dbMod.sql`select 1 from saved_reports limit 0`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-rep-owner');
const adminId = newId('u-rep-admin');
const memberId = newId('u-rep-member');
const viewerId = newId('u-rep-viewer');
const outsiderId = newId('u-rep-outsider');
const createdUserIds = [ownerId, adminId, memberId, viewerId, outsiderId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(
  userId: string,
  opts?: {
    workerSharedSecret?: string;
    /** DEM-276 — verifyToken yeni alan; omit ⇒ workerSharedSecret'a eşitlenir. */
    printVerifyTokenSecret?: string;
    enqueueReportRender?: (i: { renderId: string }) => void;
  },
) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: session(userId),
      db: probe.db,
      workerSharedSecret: opts?.workerSharedSecret,
      printVerifyTokenSecret: opts?.printVerifyTokenSecret ?? opts?.workerSharedSecret,
      enqueueReportRender: opts?.enqueueReportRender,
    }),
  );
}

function callerAnonymous(opts?: {
  workerSharedSecret?: string;
  /** DEM-276 — verifyToken yeni alan; omit ⇒ workerSharedSecret'a eşitlenir. */
  printVerifyTokenSecret?: string;
}) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: null,
      db: probe.db,
      workerSharedSecret: opts?.workerSharedSecret,
      printVerifyTokenSecret: opts?.printVerifyTokenSecret ?? opts?.workerSharedSecret,
    }),
  );
}

describe.runIf(dbAvailable)('report router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Report Co',
      slug: newSlug('report-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);

    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: adminId, role: 'admin' },
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: viewerId, role: 'member' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Report Board',
      icon: 'layout-grid',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;

    // viewerId board:viewer rolünde explicit
    await db()
      .insert(boardMembers)
      .values({ boardId, userId: viewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Önemli',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Test Kart',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
    await probe?.pool.end();
  });

  it('catalog: board scope için 6 preset + filtreli micro-report listesi döner', async () => {
    const out = await callerFor(memberId).report.catalog({ scopeKind: 'board' });
    expect(out.scopeKind).toBe('board');
    expect(out.presets.length).toBe(6);
    expect(out.microReports.length).toBeGreaterThan(0);
    // Her micro-report board scope'u destekler.
    for (const m of out.microReports) {
      expect(m.supports).toContain('board');
    }
  });

  it('catalog: card scope için 4 preset', async () => {
    const out = await callerFor(memberId).report.catalog({ scopeKind: 'card' });
    expect(out.presets.length).toBe(4);
  });

  it('preview: board.health envelope döner; 5 micro-report sonucu içerir', async () => {
    const out = await callerFor(memberId).report.preview({
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
    });
    expect(out.scope).toEqual({ kind: 'board', boardId, workspaceId });
    expect(out.presetId).toBe('board.health');
    // board.health preset (13K sonrası): board-health-score / kpi-card /
    // status-breakdown / aging-report / due-date-overview (5 micro-report) —
    // tüm 30 adapter implementli olduğu için hepsi data döner.
    expect(out.microReports.length).toBe(5);
    expect(out.generatedAt).toMatch(/^\d{4}-/);
  });

  it('preview: card.activity preset all adapters return data (13K — 30/30)', async () => {
    const out = await callerFor(memberId).report.preview({
      scope: { kind: 'card', cardId, boardId, workspaceId },
      presetId: 'card.activity',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
    });
    // card.activity preset: activity-timeline / activity-breakdown /
    // comment-volume / attachment-summary. 13K sonrası tüm 4 adapter
    // implementli → error: null + data döner.
    const timeline = out.microReports.find((m) => m.id === 'activity-timeline');
    expect(timeline).toBeDefined();
    expect(timeline?.error).toBeNull();
    expect(timeline?.data).toMatchObject({ totalCount: expect.any(Number) });
    const breakdown = out.microReports.find((m) => m.id === 'activity-breakdown');
    expect(breakdown).toBeDefined();
    expect(breakdown?.error).toBeNull();
    expect(breakdown?.data).toMatchObject({ totalCount: expect.any(Number) });
  });

  it('preview: outsider FORBIDDEN', async () => {
    await expect(
      callerFor(outsiderId).report.preview({
        scope: { kind: 'board', boardId, workspaceId },
        presetId: 'board.health',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
      }),
    ).rejects.toThrowError(/permission denied/i);
  });

  it('preview: comparison toggle previousData yükler (kpi-card)', async () => {
    const out = await callerFor(memberId).report.preview({
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      comparison: { enabled: true, mode: 'previousPeriod' },
    });
    const kpi = out.microReports.find((m) => m.id === 'kpi-card');
    expect(kpi).toBeDefined();
    // kpi-card adapter implementli + supportsComparison=true → comparison data.
    expect(kpi?.data).toBeDefined();
    expect(kpi?.comparisonData).toBeDefined();
  });

  it('save: board admin başarılı; saved report row döner', async () => {
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      title: 'Pano Sağlık 2026',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [{ microReportId: 'kpi-card', enabled: true }],
    });
    expect(saved.id).toBeTruthy();
    expect(saved.title).toBe('Pano Sağlık 2026');
    expect(saved.createdBy).toBe(adminId);
    // Cleanup için referans tutmaya gerek yok — workspace cascade siler.
  });

  it('save: board viewer FORBIDDEN', async () => {
    await expect(
      callerFor(viewerId).report.save({
        workspaceId,
        scope: { kind: 'board', boardId, workspaceId },
        presetId: 'board.health',
        title: 'Viewer Save',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
      }),
    ).rejects.toThrowError(/permission denied/i);
  });

  it('listSaved + getSaved + update + archive + delete CRUD zinciri', async () => {
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.flow',
      title: 'CRUD Test',
      filters: { range: { kind: 'preset', preset: 'last7d' } },
      microReports: [{ microReportId: 'list-flow', enabled: true }],
    });
    // list
    const list = await callerFor(memberId).report.listSaved({
      workspaceId,
      limit: 20,
    });
    expect(list.items.find((r) => r.id === saved.id)).toBeDefined();
    // get
    const got = await callerFor(memberId).report.getSaved({ id: saved.id });
    expect(got.id).toBe(saved.id);
    // update
    const updated = await callerFor(adminId).report.update({
      id: saved.id,
      title: 'Yeni İsim',
    });
    expect(updated.title).toBe('Yeni İsim');
    // archive
    const archived = await callerFor(adminId).report.archive({
      id: saved.id,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();
    // delete
    const deleted = await callerFor(adminId).report.delete({ id: saved.id });
    expect(deleted.id).toBe(saved.id);
    // get → NOT_FOUND
    await expect(callerFor(memberId).report.getSaved({ id: saved.id })).rejects.toThrowError(
      /bulunamadı/,
    );
  });

  it('export: report_renders satırı oluşur + enqueueReportRender çağrılır', async () => {
    const enqueueSpy = vi.fn();
    const out = await callerFor(memberId, { enqueueReportRender: enqueueSpy }).report.export({
      source: 'adhoc',
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
      format: 'pdf',
    });
    expect(out.renderId).toBeTruthy();
    expect(enqueueSpy).toHaveBeenCalledWith({ renderId: out.renderId });
    // DB row'u doğrula
    const [row] = await db()
      .select()
      .from(reportRenders)
      .where(dbMod.eq(reportRenders.id, out.renderId))
      .limit(1);
    expect(row?.status).toBe('queued');
    expect(row?.format).toBe('pdf');
    expect(row?.triggerKind).toBe('manual');
  });

  it('getRender + listRenders zinciri', async () => {
    const out = await callerFor(memberId).report.export({
      source: 'adhoc',
      workspaceId,
      scope: { kind: 'workspace', workspaceId },
      presetId: 'workspace.executive-summary',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
      format: 'xlsx',
    });
    const got = await callerFor(memberId).report.getRender({ renderId: out.renderId });
    expect(got.render.id).toBe(out.renderId);
    expect(got.assets).toEqual([]);
    const list = await callerFor(memberId).report.listRenders({ workspaceId, limit: 50 });
    expect(list.items.find((r) => r.id === out.renderId)).toBeDefined();
  });

  it('schedule.create + list + delete (admin)', async () => {
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      title: 'Schedule Test',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
    });
    const created = await callerFor(adminId).report.schedule.create({
      savedReportId: saved.id,
      cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
    });
    expect(created.id).toBeTruthy();
    expect(created.cadence).toBe('daily');
    expect(created.isActive).toBe(true);

    const list = await callerFor(memberId).report.schedule.list({ savedReportId: saved.id });
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(created.id);

    const deleted = await callerFor(adminId).report.schedule.delete({ id: created.id });
    expect(deleted.id).toBe(created.id);
  });

  it('schedule.create with external email: admin allowed, viewer rejected', async () => {
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      title: 'Email Schedule',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
    });
    // Admin (workspace:admin) — recipientEmail board scope için
    // workspace:admin ister → izinli.
    const created = await callerFor(adminId).report.schedule.create({
      savedReportId: saved.id,
      cadenceConfig: { cadence: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
      recipientEmails: ['external@example.test'],
    });
    expect(created.recipientEmails).toEqual(['external@example.test']);

    // viewer (board:viewer + workspace:member) → recipientEmail FORBIDDEN.
    await expect(
      callerFor(viewerId).report.schedule.create({
        savedReportId: saved.id,
        cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
        timezone: 'Europe/Istanbul',
        recipientEmails: ['x@y.test'],
      }),
    ).rejects.toThrowError(/permission denied/i);
  });

  it('print.requestToken: WORKER_SHARED_SECRET yoksa UNAUTHORIZED', async () => {
    await expect(
      callerAnonymous().report.print.requestToken({ renderId: 'render-123' }),
    ).rejects.toThrowError(/WORKER_SHARED_SECRET/i);
  });

  it('print.requestToken + verifyToken happy path', async () => {
    const secret = 'a'.repeat(40); // ≥32 char
    const out = await callerFor(memberId).report.export({
      source: 'adhoc',
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
      format: 'pdf',
    });
    const tok = await callerAnonymous({ workerSharedSecret: secret }).report.print.requestToken({
      renderId: out.renderId,
    });
    expect(tok.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const payload = await callerAnonymous({ workerSharedSecret: secret }).report.print.verifyToken({
      renderId: out.renderId,
      token: tok.token,
    });
    // Faz 13I (DEM-265) — verifyToken artık `{ envelope, i18n, workspaceName,
    // locale }` döner. Envelope shape'i içeride.
    expect(payload.envelope.scope).toEqual({
      kind: 'board',
      boardId,
      workspaceId,
    });
    expect(payload.envelope.microReports.length).toBe(5);
    // i18n + workspaceName + locale gömülü (UI t() resolver bunu kullanır).
    expect(payload.locale).toBe('tr-TR');
    expect(payload.workspaceName).toBeDefined();
    expect(payload.i18n['reports.print.generatedAt']).toBeDefined();
  });

  it('print.verifyToken: yanlış secret reddedilir (bad signature)', async () => {
    const secret = 'a'.repeat(40);
    const fakeSecret = 'b'.repeat(40);
    const out = await callerFor(memberId).report.export({
      source: 'adhoc',
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
      format: 'pdf',
    });
    // Token doğru secret ile imzalanır; verify yanlış secret ile dener.
    const tok = issuePrintToken({ renderId: out.renderId, secret });
    await expect(
      callerAnonymous({ workerSharedSecret: fakeSecret }).report.print.verifyToken({
        renderId: out.renderId,
        token: tok,
      }),
    ).rejects.toThrowError(/verification failed/i);
  });

  it('save: workspaceId ≠ scope.workspaceId mismatch reddedilir (C1 security)', async () => {
    // Saldırgan workspace A'da admin, scope'ta da A diyor ama insert hedefi
    // başka workspace olmaya çalışıyor. Zod refine yakalar.
    await expect(
      callerFor(adminId).report.save({
        workspaceId: 'ws-fake-id',
        scope: { kind: 'workspace', workspaceId },
        presetId: 'workspace.executive-summary',
        title: 'Plant',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
      }),
    ).rejects.toThrowError(/workspaceId ile scope.workspaceId/);
  });

  it('save: card scope DB lookup ile workspace tutarsızlığı yakalar (C1 security)', async () => {
    // Workspace üyesi olmadığı bir workspace'in workspaceId'sini gönderirse
    // refine yakalar; ama refine geçen ama DB-level uyumsuzluk varsa
    // (örn. başka workspace'in board id'si) scopeFromPolymorphicRow
    // FORBIDDEN dönmeli. Bu testte mevcut workspace'te olmayan bir card id
    // veririz → NOT_FOUND.
    await expect(
      callerFor(adminId).report.save({
        workspaceId,
        scope: {
          kind: 'card',
          cardId: 'card-does-not-exist',
          boardId,
          workspaceId,
        },
        presetId: 'card.overview',
        title: 'Bad Scope',
        filters: { range: { kind: 'preset', preset: 'last30d' } },
        microReports: [],
      }),
    ).rejects.toThrowError(/Saved report scope/);
  });

  it('save/get/update/delete: card scope CRUD (K1 polymorphic permission fix)', async () => {
    // K1: card scope için scopeFromPolymorphicRow DB lookup ile boardId
    // çözer; permission ctx doğru effectiveBoardRole alır.
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'card', cardId, boardId, workspaceId },
      presetId: 'card.overview',
      title: 'Kart Özeti',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [{ microReportId: 'entity-summary', enabled: true }],
    });
    expect(saved.scopeKind).toBe('card');
    expect(saved.scopeId).toBe(cardId);

    // Board viewer kullanıcısı card scope saved'ı **görebilir** (render =
    // board:viewer); ama update edemez (admin gerekir).
    const got = await callerFor(viewerId).report.getSaved({ id: saved.id });
    expect(got.id).toBe(saved.id);

    await expect(
      callerFor(viewerId).report.update({ id: saved.id, title: 'fail' }),
    ).rejects.toThrowError(/permission denied/i);

    // Admin update ✓
    const updated = await callerFor(adminId).report.update({
      id: saved.id,
      title: 'Yeni Kart Özeti',
    });
    expect(updated.title).toBe('Yeni Kart Özeti');

    await callerFor(adminId).report.delete({ id: saved.id });
  });

  it('recipientEmail: workspace scope için workspace:admin reddedilir (sadece owner)', async () => {
    // Spec §9.5: workspace scope'ta recipientEmail için workspace:owner.
    // adminId workspace:admin → reddedilmeli.
    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'workspace', workspaceId },
      presetId: 'workspace.executive-summary',
      title: 'WS Schedule Email',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
    });
    await expect(
      callerFor(adminId).report.schedule.create({
        savedReportId: saved.id,
        cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
        timezone: 'Europe/Istanbul',
        recipientEmails: ['external@example.test'],
      }),
    ).rejects.toThrowError(/permission denied/i);
    // owner ✓
    const created = await callerFor(ownerId).report.schedule.create({
      savedReportId: saved.id,
      cadenceConfig: { cadence: 'daily', hour: 9, minute: 0 },
      timezone: 'Europe/Istanbul',
      recipientEmails: ['external@example.test'],
    });
    expect(created.recipientEmails).toEqual(['external@example.test']);
  });

  it('listSaved: guest workspace + board:viewer kullanıcı kendi panosundaki saved\'ları görür (W1 fix)', async () => {
    // Pusula invariant: board üyeliği alan kullanıcı workspace_members'a
    // 'guest' olarak da eklenir (§1 invariant 13). Bu kullanıcı eski W1
    // buggy hâlinde `'render'` action workspace:guest için reddedilirken
    // FORBIDDEN alıyordu; fix sonrası kendi board scope'lu saved'larını
    // filtered list ile görür.
    await db()
      .insert(workspaceMembers)
      .values({ workspaceId, userId: outsiderId, role: 'guest' })
      .onConflictDoNothing();
    await db()
      .insert(boardMembers)
      .values({ boardId, userId: outsiderId, role: 'viewer' })
      .onConflictDoNothing();

    const saved = await callerFor(adminId).report.save({
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      title: 'Board-Guest Görünür',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
    });

    const out = await callerFor(outsiderId).report.listSaved({ workspaceId, limit: 20 });
    // Guest + board:viewer workspace_members'ta row var → ana akış (eski
    // workspace gate'i de zaten geçerdi). Test mevcut davranışın
    // bozulmadığını doğrular.
    expect(out.items.find((r) => r.id === saved.id)).toBeDefined();
  });

  it('print.verifyToken: expired token reddedilir', async () => {
    const secret = 'a'.repeat(40);
    const out = await callerFor(memberId).report.export({
      source: 'adhoc',
      workspaceId,
      scope: { kind: 'board', boardId, workspaceId },
      presetId: 'board.health',
      filters: { range: { kind: 'preset', preset: 'last30d' } },
      microReports: [],
      format: 'pdf',
    });
    // ttlMs=0 → token üretildiği anda zaten expired.
    const tok = issuePrintToken({ renderId: out.renderId, secret, ttlMs: 0 });
    // 1 ms delay
    await new Promise((r) => setTimeout(r, 5));
    await expect(
      callerAnonymous({ workerSharedSecret: secret }).report.print.verifyToken({
        renderId: out.renderId,
        token: tok,
      }),
    ).rejects.toThrowError(/expired/);
  });
});
