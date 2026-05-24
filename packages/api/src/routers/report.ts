/**
 * Faz 13D ([DEM-260](https://linear.app/demirkol/issue/DEM-260)) — Raporlama
 * tRPC router. Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.6 +
 * `docs/domain/09-raporlama-kurallari.md` §9.5 (yetki matrisi).
 *
 * Procedure listesi (12 + nested):
 *   - catalog                 — preset + micro-report listesi (scope filtreli)
 *   - preview                 — dataset envelope (cache + render orchestrator)
 *   - save / listSaved / getSaved / update / delete / archive
 *   - export / getRender / listRenders
 *   - schedule.* (create/update/delete/list/runNow)
 *   - print.requestToken (worker) / print.verifyToken (public)
 *
 * Auth disiplini:
 *   - `protectedProcedure` baz; her procedure başında
 *     `canPerformReportAction(action, scope, {workspace, board})` ile §9.5
 *     yetkilendirme. Workspace/board erişimi `effectiveBoardRole` ile çözülür.
 *   - Mutation'lar `clientMutationId` taşır (middleware'den).
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull } from '@pusula/db';
import {
  boardMembers,
  boards,
  cards,
  lists,
  reportRenderAssets,
  reportRenders,
  reportSchedules,
  savedReports,
  workspaceMembers,
  workspaces,
  type Database,
  type ReportRender,
  type SavedReport,
} from '@pusula/db';
import {
  effectiveBoardRole,
  idSchema,
  type BoardRole,
  type WorkspaceRole,
} from '@pusula/domain';
import {
  canPerformReportAction,
  comparisonConfigSchema,
  getPresetsForScope,
  getMicroReportsForScope,
  microReportSelectionSchema,
  reportExportSchema,
  reportFiltersSchema,
  reportRenderListSchema,
  reportScopeKindSchema,
  reportScopeSchema,
  savedReportCreateSchema,
  savedReportListSchema,
  savedReportPatchSchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  type ReportPermissionCtx,
  type ReportPermissionResult,
  type ReportScope,
  type CadenceConfig,
  type ComparisonConfig,
  type MicroReportSelection,
  type ReportFilters,
} from '@pusula/domain/reports';
import { z } from 'zod';
import { buildReportCacheKey, noOpReportCache } from '../lib/report-cache';
import { renderReportDataset, type ReportEnvelope } from '../lib/report-envelope';
import { REPORT_PRINT_I18N_TR } from '../lib/report-i18n-tr';
import {
  issuePrintToken,
  PRINT_TOKEN_TTL_MS,
  verifyPrintToken,
} from '../lib/report-print-token';
import { buildReportPermissionsCtx } from '../lib/report-permissions';
import { getReportDataAdapter } from '../services/report-data';
import { publicProcedure, protectedProcedure, router } from '../trpc';
import type { Context } from '../context';

// ─── Permission resolver ────────────────────────────────────────────────────

/**
 * Çağıran session user'ın scope'taki workspace + (varsa) board rolünü
 * çöz. Tüm permission check'ler bunun üstüne kurulur.
 */
async function resolveReportPermissionCtx(
  ctx: Context & { session: NonNullable<Context['session']> },
  scope: ReportScope,
): Promise<ReportPermissionCtx> {
  const userId = ctx.session.user.id;

  const workspaceId = scope.workspaceId;
  const [wsMembership] = await ctx.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  const workspaceRole = (wsMembership?.role ?? null) as WorkspaceRole | null;

  let boardRole: BoardRole | null = null;
  if (scope.kind !== 'workspace') {
    const boardId = scope.boardId;
    const [boardMembership] = await ctx.db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
      .limit(1);
    boardRole = effectiveBoardRole({
      workspaceRole,
      boardRole: (boardMembership?.role ?? null) as BoardRole | null,
    });
  }

  return { workspace: workspaceRole, board: boardRole };
}

function enforceReportPermission(result: ReportPermissionResult): void {
  if (result.allowed) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `report permission denied: ${result.reason ?? 'unknown'}`,
  });
}

/**
 * Saved report row / render row → `ReportScope` reconstruction
 * (DEM-260 code-review K1 + security-review C1).
 *
 * Card/list/board scope satırları `saved_reports` (ve `report_renders`)
 * tablolarında **denormalize boardId kolonu YOK** (13B polymorphic
 * `scope_id`). Permission ctx'i (`effectiveBoardRole`) gerçek board
 * üzerinden çözebilmek için boardId'yi `cards.list_id → lists.board_id`
 * zinciriyle DB'den lookup et. Workspace scope için workspaceId zaten
 * row'da; ek lookup yok.
 *
 * Bu fonksiyon ayrıca **cross-workspace tutarlılığını** doğrular: card
 * gerçekten `row.workspaceId`'e ait olmalı (saldırgan workspace A'ya
 * yazılmış card scope'lu saved report'u B workspaceId'siyle plant
 * edemez). Tutarsızlıkta FORBIDDEN.
 */
async function scopeFromPolymorphicRow(
  db: Database,
  row: { scopeKind: 'card' | 'list' | 'board' | 'workspace'; scopeId: string; workspaceId: string },
): Promise<ReportScope> {
  switch (row.scopeKind) {
    case 'workspace':
      return { kind: 'workspace', workspaceId: row.workspaceId };

    case 'board': {
      const [board] = await db
        .select({ workspaceId: boards.workspaceId })
        .from(boards)
        .where(eq(boards.id, row.scopeId))
        .limit(1);
      if (!board) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report scope (board) bulunamadı.' });
      }
      if (board.workspaceId !== row.workspaceId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Saved report scope workspace tutarsızlığı (board → workspace).',
        });
      }
      return { kind: 'board', boardId: row.scopeId, workspaceId: row.workspaceId };
    }

    case 'list': {
      const [row2] = await db
        .select({ boardId: lists.boardId, workspaceId: boards.workspaceId })
        .from(lists)
        .innerJoin(boards, eq(boards.id, lists.boardId))
        .where(eq(lists.id, row.scopeId))
        .limit(1);
      if (!row2) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report scope (list) bulunamadı.' });
      }
      if (row2.workspaceId !== row.workspaceId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Saved report scope workspace tutarsızlığı (list → workspace).',
        });
      }
      return {
        kind: 'list',
        listId: row.scopeId,
        boardId: row2.boardId,
        workspaceId: row.workspaceId,
      };
    }

    case 'card': {
      const [row2] = await db
        .select({
          listId: cards.listId,
          boardId: lists.boardId,
          workspaceId: boards.workspaceId,
        })
        .from(cards)
        .innerJoin(lists, eq(lists.id, cards.listId))
        .innerJoin(boards, eq(boards.id, lists.boardId))
        .where(eq(cards.id, row.scopeId))
        .limit(1);
      if (!row2) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report scope (card) bulunamadı.' });
      }
      if (row2.workspaceId !== row.workspaceId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Saved report scope workspace tutarsızlığı (card → workspace).',
        });
      }
      return {
        kind: 'card',
        cardId: row.scopeId,
        boardId: row2.boardId,
        workspaceId: row.workspaceId,
      };
    }
  }
}

async function scopeFromSavedReport(db: Database, row: SavedReport): Promise<ReportScope> {
  return scopeFromPolymorphicRow(db, row);
}

async function scopeFromRenderRow(db: Database, row: ReportRender): Promise<ReportScope> {
  return scopeFromPolymorphicRow(db, row);
}

// ─── catalog + preview ──────────────────────────────────────────────────────

const catalogRouter = protectedProcedure
  .input(z.object({ scopeKind: reportScopeKindSchema }))
  .query(({ input }) => {
    const presets = getPresetsForScope(input.scopeKind);
    const microReports = getMicroReportsForScope(input.scopeKind);
    return { scopeKind: input.scopeKind, presets, microReports };
  });

const previewRouter = protectedProcedure
  .input(
    z.object({
      scope: reportScopeSchema,
      presetId: z.string().min(1),
      filters: reportFiltersSchema,
      comparison: comparisonConfigSchema.nullable().optional(),
      microReportOverrides: z.array(microReportSelectionSchema).optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const permCtx = await resolveReportPermissionCtx(ctx, input.scope);
    enforceReportPermission(canPerformReportAction('generate', input.scope, permCtx));

    // Cache key (NoOp şimdilik). 13E'de buradan dönen value envelope'a eşit.
    const cache = ctx.reportCache ?? noOpReportCache;
    const cacheKey = buildReportCacheKey({
      scope: input.scope,
      presetId: input.presetId,
      filters: input.filters,
      comparison: input.comparison ?? null,
      userId: ctx.session.user.id,
      isAdmin: permCtx.workspace === 'admin' || permCtx.workspace === 'owner',
    });
    const cached = await cache.get<ReportEnvelope>(cacheKey);
    if (cached) return cached;

    const queryCtx = {
      db: ctx.db,
      userId: ctx.session.user.id,
      now: () => new Date(),
      permissions: buildReportPermissionsCtx({ db: ctx.db, userId: ctx.session.user.id }),
    };
    const envelope = await renderReportDataset(queryCtx, getReportDataAdapter, {
      scope: input.scope,
      presetId: input.presetId,
      filters: input.filters,
      comparison: input.comparison ?? null,
      microReportOverrides: input.microReportOverrides,
    });

    // TTL: scope kind → §16.7 tablosu (card 60 / list 90 / board 180 / workspace 300).
    const ttlByScope: Record<ReportScope['kind'], number> = {
      card: 60,
      list: 90,
      board: 180,
      workspace: 300,
    };
    await cache.set(cacheKey, envelope, ttlByScope[input.scope.kind]);
    return envelope;
  });

// ─── Saved CRUD ─────────────────────────────────────────────────────────────

const saveRouter = protectedProcedure
  .input(savedReportCreateSchema)
  .mutation(async ({ ctx, input }) => {
    // Cross-workspace data-plant koruması (security review C1): scope'taki
    // board/list/card gerçekten `input.workspaceId`'e ait mı? Zod refine
    // sadece istek body'sinde iki workspaceId alanının aynı olduğunu
    // doğruluyor; saldırgan başka workspace'ten board id'siyle plant
    // edebilir → DB-level lookup ile doğrula.
    const scopeId =
      input.scope.kind === 'card'
        ? input.scope.cardId
        : input.scope.kind === 'list'
          ? input.scope.listId
          : input.scope.kind === 'board'
            ? input.scope.boardId
            : input.scope.workspaceId;
    await scopeFromPolymorphicRow(ctx.db, {
      scopeKind: input.scope.kind,
      scopeId,
      workspaceId: input.workspaceId,
    });

    const permCtx = await resolveReportPermissionCtx(ctx, input.scope);
    enforceReportPermission(canPerformReportAction('save', input.scope, permCtx));

    const [row] = await ctx.db
      .insert(savedReports)
      .values({
        workspaceId: input.workspaceId,
        scopeKind: input.scope.kind,
        scopeId,
        presetId: input.presetId,
        title: input.title,
        description: input.description ?? null,
        filters: input.filters,
        microReports: input.microReports,
        comparison: input.comparison ?? null,
        createdBy: ctx.session.user.id,
      })
      .returning();
    return row!;
  });

const listSavedRouter = protectedProcedure
  .input(savedReportListSchema)
  .query(async ({ ctx, input }) => {
    // W1 (code review): listSaved sıkı workspace üyeliği şartı koymaz —
    // workspace-guest + board-explicit-viewer kullanıcı kendi panosundaki
    // saved'ları görebilmeli. Row-level filter: workspace üyesi
    // değilse permission helper üstünden erişilebilir board id'leri
    // çıkartıp `scope_kind/board → board_id ∈ accessible` ile sınırla.
    const userId = ctx.session.user.id;
    const permsCtx = buildReportPermissionsCtx({ db: ctx.db, userId });
    const [wsMembership] = await ctx.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!wsMembership) {
      // Workspace üyesi değil ama board üyesi olabilir; board scope'lu
      // saved'ları filtrele. Board üyeliği bile yoksa boş list dön.
      const accessibleBoardIds = await permsCtx.accessibleBoardsInWorkspace(input.workspaceId);
      if (accessibleBoardIds.length === 0) {
        return { items: [], nextCursor: null as string | null };
      }
      // board-only kullanıcı yalnız `scope_kind='board' AND scope_id ∈ accessible`
      // satırlarını görür (card/list scope için boardId lookup gerek; V1 basit
      // tut → yalnız board scope göster).
      const conditions = [
        eq(savedReports.workspaceId, input.workspaceId),
        eq(savedReports.scopeKind, 'board'),
      ];
      if (input.scopeId) conditions.push(eq(savedReports.scopeId, input.scopeId));
      if (input.presetId) conditions.push(eq(savedReports.presetId, input.presetId));
      if (input.archived === false) conditions.push(isNull(savedReports.archivedAt));
      const allRows = await ctx.db
        .select()
        .from(savedReports)
        .where(and(...conditions))
        .orderBy(desc(savedReports.updatedAt))
        .limit(input.limit);
      const allowedSet = new Set(accessibleBoardIds);
      const filteredRows = allRows.filter((r) => allowedSet.has(r.scopeId));
      return { items: filteredRows, nextCursor: null as string | null };
    }

    // Workspace üyesi (owner/admin/member/guest): mevcut akış —
    // workspace içindeki tüm saved'ları görür (UI scope filtre).
    const conditions = [eq(savedReports.workspaceId, input.workspaceId)];
    if (input.scopeKind) conditions.push(eq(savedReports.scopeKind, input.scopeKind));
    if (input.scopeId) conditions.push(eq(savedReports.scopeId, input.scopeId));
    if (input.presetId) conditions.push(eq(savedReports.presetId, input.presetId));
    if (input.archived === false) conditions.push(isNull(savedReports.archivedAt));
    const rows = await ctx.db
      .select()
      .from(savedReports)
      .where(and(...conditions))
      .orderBy(desc(savedReports.updatedAt))
      .limit(input.limit);
    return { items: rows, nextCursor: null as string | null };
  });

const getSavedRouter = protectedProcedure
  .input(z.object({ id: idSchema }))
  .query(async ({ ctx, input }) => {
    const [row] = await ctx.db.select().from(savedReports).where(eq(savedReports.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, row);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('render', scope, permCtx));
    return row;
  });

const updateSavedRouter = protectedProcedure
  .input(savedReportPatchSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, existing);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('update', scope, permCtx));

    const patch: Partial<SavedReport> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.filters !== undefined) patch.filters = input.filters as ReportFilters;
    if (input.microReports !== undefined) patch.microReports = input.microReports as MicroReportSelection[];
    if (input.comparison !== undefined) patch.comparison = (input.comparison ?? null) as ComparisonConfig | null;

    const [row] = await ctx.db
      .update(savedReports)
      .set(patch)
      .where(eq(savedReports.id, input.id))
      .returning();
    return row!;
  });

const deleteSavedRouter = protectedProcedure
  .input(z.object({ id: idSchema }))
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, existing);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('delete', scope, permCtx));
    await ctx.db.delete(savedReports).where(eq(savedReports.id, input.id));
    return { id: input.id };
  });

const archiveSavedRouter = protectedProcedure
  .input(z.object({ id: idSchema, archived: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, existing);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('update', scope, permCtx));

    const [row] = await ctx.db
      .update(savedReports)
      .set({ archivedAt: input.archived ? new Date() : null })
      .where(eq(savedReports.id, input.id))
      .returning();
    return row!;
  });

// ─── Render: export / getRender / listRenders ───────────────────────────────

const exportRouter = protectedProcedure
  .input(reportExportSchema)
  .mutation(async ({ ctx, input }) => {
    // Source: saved → saved row'dan scope/preset/filters; adhoc → input'tan.
    let scope: ReportScope;
    let presetId: string;
    let filters: ReportFilters;
    let comparison: ComparisonConfig | null;
    let workspaceId: string;
    let savedReportId: string | null = null;

    if (input.source === 'saved') {
      const [row] = await ctx.db
        .select()
        .from(savedReports)
        .where(eq(savedReports.id, input.savedReportId))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
      scope = await scopeFromSavedReport(ctx.db, row);
      presetId = row.presetId;
      filters = row.filters as ReportFilters;
      comparison = (row.comparison ?? null) as ComparisonConfig | null;
      workspaceId = row.workspaceId;
      savedReportId = row.id;
    } else {
      // Adhoc — security review C1: scope'taki entity'nin gerçekten
      // input.workspaceId'e ait olduğunu DB-level doğrula.
      const scopeId =
        input.scope.kind === 'card'
          ? input.scope.cardId
          : input.scope.kind === 'list'
            ? input.scope.listId
            : input.scope.kind === 'board'
              ? input.scope.boardId
              : input.scope.workspaceId;
      await scopeFromPolymorphicRow(ctx.db, {
        scopeKind: input.scope.kind,
        scopeId,
        workspaceId: input.workspaceId,
      });
      scope = input.scope;
      presetId = input.presetId;
      filters = input.filters;
      comparison = input.comparison ?? null;
      workspaceId = input.workspaceId;
    }

    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('render', scope, permCtx));

    // report_renders.insert (status='queued') + best-effort enqueue.
    // ID DB tarafında nanoid ile üretilir (`primaryId()` helper'ı).
    const [inserted] = await ctx.db
      .insert(reportRenders)
      .values({
      workspaceId,
      savedReportId,
      scopeKind: scope.kind,
      scopeId:
        scope.kind === 'card'
          ? scope.cardId
          : scope.kind === 'list'
            ? scope.listId
            : scope.kind === 'board'
              ? scope.boardId
              : scope.workspaceId,
      presetId,
      filters: filters,
      comparison: comparison,
      status: 'queued',
      format: input.format,
      assetTarget: input.assetTarget ?? null,
      version: 1,
      triggeredBy: ctx.session.user.id,
      triggerKind: 'manual',
    })
      .returning({ id: reportRenders.id });
    const renderId = inserted!.id;

    // 13I Puppeteer worker'ı bu queue'dan pickup eder (13D'de no-op default).
    if (ctx.enqueueReportRender) {
      try {
        await ctx.enqueueReportRender({ renderId });
      } catch {
        // Best-effort — DB kaydı kalır, worker sweeper alır.
      }
    }
    return { renderId };
  });

const getRenderRouter = protectedProcedure
  .input(z.object({ renderId: idSchema }))
  .query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(reportRenders)
      .where(eq(reportRenders.id, input.renderId))
      .limit(1);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Render bulunamadı.' });
    const scope = await scopeFromRenderRow(ctx.db, row);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('render', scope, permCtx));

    // İlişkili asset'leri çek; ctx.objectStorage varsa her asset için
    // presigned GET URL üret (Faz 13H — DEM-264). Storage adapter yoksa
    // (test / Next route handler) `downloadUrl` null kalır.
    const rawAssets = await ctx.db
      .select()
      .from(reportRenderAssets)
      .where(eq(reportRenderAssets.renderId, input.renderId));
    const assets = await Promise.all(
      rawAssets.map(async (asset) => {
        if (!ctx.objectStorage) {
          return { ...asset, downloadUrl: null as string | null };
        }
        try {
          const url = await ctx.objectStorage.createPresignedGetUrl({
            key: asset.s3Key,
            // 5 dk yeterli — kullanıcı butona basıp indirir.
            expiresIn: 5 * 60,
          });
          return { ...asset, downloadUrl: url };
        } catch {
          return { ...asset, downloadUrl: null as string | null };
        }
      }),
    );
    return { render: row, assets };
  });

const listRendersRouter = protectedProcedure
  .input(reportRenderListSchema)
  .query(async ({ ctx, input }) => {
    const permCtx = await resolveReportPermissionCtx(ctx, {
      kind: 'workspace',
      workspaceId: input.workspaceId,
    });
    enforceReportPermission(
      canPerformReportAction(
        'render',
        { kind: 'workspace', workspaceId: input.workspaceId },
        permCtx,
      ),
    );
    const conditions = [eq(reportRenders.workspaceId, input.workspaceId)];
    if (input.savedReportId) conditions.push(eq(reportRenders.savedReportId, input.savedReportId));
    if (input.scheduleId) conditions.push(eq(reportRenders.scheduleId, input.scheduleId));
    if (input.status) conditions.push(eq(reportRenders.status, input.status));
    const rows = await ctx.db
      .select()
      .from(reportRenders)
      .where(and(...conditions))
      .orderBy(desc(reportRenders.createdAt))
      .limit(input.limit);
    return { items: rows, nextCursor: null as string | null };
  });


// ─── Schedule (nested) ──────────────────────────────────────────────────────

const scheduleCreateRouter = protectedProcedure
  .input(scheduleCreateSchema)
  .mutation(async ({ ctx, input }) => {
    const [saved] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, input.savedReportId))
      .limit(1);
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, saved);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('scheduleCreate', scope, permCtx));

    // External email kontrol: workspace-dışı email varsa workspace admin/owner şart.
    if (input.recipientEmails.length > 0) {
      enforceReportPermission(canPerformReportAction('recipientEmail', scope, permCtx));
    }

    // Faz 13J (DEM-266 security CRITICAL C1) — `recipientUserIds` workspace
    // member intersect. `recipientUser` permission check ek olarak DB-level
    // doğrulama: arbitrary user UUID kabul edilmez, yalnız aynı workspace'in
    // üyeleri. Demote race: schedule oluşturulduktan sonra user'ın workspace
    // erişimi kalkarsa `resolveScheduleRecipients` worker tarafında JOIN
    // ile defense-in-depth (bkz. report-scheduled-email.ts).
    if (input.recipientUserIds.length > 0) {
      enforceReportPermission(canPerformReportAction('recipientUser', scope, permCtx));
      const memberRows = await ctx.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, saved.workspaceId),
            inArray(workspaceMembers.userId, input.recipientUserIds),
          ),
        );
      const validIds = new Set(memberRows.map((m) => m.userId));
      const invalid = input.recipientUserIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'recipientUserIds workspace üyesi değil (cross-workspace recipient leak engeli).',
        });
      }
    }

    // nextRunAt = "şimdi + 1 saat" — gerçek hesap 13J scheduler worker'da
    // (cadence + timezone'a göre). Burada konservatif placeholder.
    const nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
    const [row] = await ctx.db
      .insert(reportSchedules)
      .values({
        savedReportId: input.savedReportId,
        cadence: input.cadenceConfig.cadence,
        cadenceConfig: input.cadenceConfig as CadenceConfig,
        timezone: input.timezone,
        recipientUserIds: [...input.recipientUserIds],
        recipientEmails: [...input.recipientEmails],
        isActive: input.isActive,
        nextRunAt,
        createdBy: ctx.session.user.id,
      })
      .returning();
    return row!;
  });

const scheduleUpdateRouter = protectedProcedure
  .input(scheduleUpdateSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule bulunamadı.' });
    const [saved] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, existing.savedReportId))
      .limit(1);
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, saved);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('scheduleCreate', scope, permCtx));

    // W3: tüm permission check'leri patch build'inden ÖNCE yap.
    if (input.recipientEmails !== undefined && input.recipientEmails.length > 0) {
      enforceReportPermission(canPerformReportAction('recipientEmail', scope, permCtx));
    }
    // Faz 13J (DEM-266 security CRITICAL C1) — recipientUserIds workspace
    // member intersect (create ile simetrik).
    if (input.recipientUserIds !== undefined && input.recipientUserIds.length > 0) {
      enforceReportPermission(canPerformReportAction('recipientUser', scope, permCtx));
      const memberRows = await ctx.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, saved.workspaceId),
            inArray(workspaceMembers.userId, input.recipientUserIds),
          ),
        );
      const validIds = new Set(memberRows.map((m) => m.userId));
      const invalid = input.recipientUserIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'recipientUserIds workspace üyesi değil (cross-workspace recipient leak engeli).',
        });
      }
    }


    const patch: Partial<typeof existing> = {};
    if (input.cadenceConfig !== undefined) {
      patch.cadence = input.cadenceConfig.cadence;
      patch.cadenceConfig = input.cadenceConfig as CadenceConfig;
    }
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.recipientUserIds !== undefined) patch.recipientUserIds = [...input.recipientUserIds];
    if (input.recipientEmails !== undefined) patch.recipientEmails = [...input.recipientEmails];
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const [row] = await ctx.db
      .update(reportSchedules)
      .set(patch)
      .where(eq(reportSchedules.id, input.id))
      .returning();
    return row!;
  });

const scheduleDeleteRouter = protectedProcedure
  .input(z.object({ id: idSchema }))
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule bulunamadı.' });
    const [saved] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, existing.savedReportId))
      .limit(1);
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, saved);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('scheduleDelete', scope, permCtx));
    await ctx.db.delete(reportSchedules).where(eq(reportSchedules.id, input.id));
    return { id: input.id };
  });

const scheduleListRouter = protectedProcedure
  .input(z.object({ savedReportId: idSchema }))
  .query(async ({ ctx, input }) => {
    const [saved] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, input.savedReportId))
      .limit(1);
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, saved);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('render', scope, permCtx));
    const rows = await ctx.db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.savedReportId, input.savedReportId))
      .orderBy(desc(reportSchedules.createdAt));
    return rows;
  });

/**
 * Faz 13H ([DEM-264](https://linear.app/demirkol/issue/DEM-264)) — workspace
 * genelindeki tüm schedule'lar için listeleme. `saved_reports` ile JOIN edip
 * sahip raporun `workspaceId`'sini filtreler. Listeleme yetkisi `listSaved`
 * ile aynı disiplinde: workspace üyesi tümünü, board-only kullanıcı yalnız
 * erişebildiği board'lara ait saved'ların schedule'larını görür.
 */
const scheduleListByWorkspaceRouter = protectedProcedure
  .input(
    z.object({
      workspaceId: idSchema,
      isActive: z.boolean().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const permsCtx = buildReportPermissionsCtx({ db: ctx.db, userId });

    // Workspace membership kontrolü; üye değilse board-only kullanıcı
    // olarak erişilebilir board id'leri ile sınırla (listSaved disiplini).
    const [wsMembership] = await ctx.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    let savedIds: string[] | null = null;
    if (!wsMembership) {
      // Board-only filter — yalnız accessible board scope'lu saved'lar.
      const accessibleBoardIds = await permsCtx.accessibleBoardsInWorkspace(input.workspaceId);
      if (accessibleBoardIds.length === 0) return { items: [] };
      const conditions = [
        eq(savedReports.workspaceId, input.workspaceId),
        eq(savedReports.scopeKind, 'board'),
      ];
      const accessibleSaved = await ctx.db
        .select({ id: savedReports.id, scopeId: savedReports.scopeId })
        .from(savedReports)
        .where(and(...conditions));
      savedIds = accessibleSaved
        .filter((row) => accessibleBoardIds.includes(row.scopeId))
        .map((row) => row.id);
      if (savedIds.length === 0) return { items: [] };
    }

    // Schedule + saved JOIN. Drizzle inner join + ws filter.
    // code-review W3 fix: board-only kullanıcı durumunda `savedIds` SQL'e
    // `inArray` ile uygulanır (post-query JS filter yerine). Büyük
    // workspace'te perf kazanımı.
    const baseConditions = [eq(savedReports.workspaceId, input.workspaceId)];
    if (typeof input.isActive === 'boolean') {
      baseConditions.push(eq(reportSchedules.isActive, input.isActive));
    }
    if (savedIds) {
      baseConditions.push(inArray(savedReports.id, savedIds));
    }

    const rows = await ctx.db
      .select({
        schedule: reportSchedules,
        savedReport: savedReports,
      })
      .from(reportSchedules)
      .innerJoin(savedReports, eq(reportSchedules.savedReportId, savedReports.id))
      .where(and(...baseConditions))
      .orderBy(desc(reportSchedules.createdAt));
    return { items: rows };
  });

const scheduleRunNowRouter = protectedProcedure
  .input(z.object({ id: idSchema }))
  .mutation(async ({ ctx, input }) => {
    const [schedule] = await ctx.db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, input.id))
      .limit(1);
    if (!schedule) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule bulunamadı.' });
    const [saved] = await ctx.db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, schedule.savedReportId))
      .limit(1);
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report bulunamadı.' });
    const scope = await scopeFromSavedReport(ctx.db, saved);
    const permCtx = await resolveReportPermissionCtx(ctx, scope);
    enforceReportPermission(canPerformReportAction('scheduleCreate', scope, permCtx));

    // export ile aynı akış — schedule context'inde manuel tetik.
    const [inserted] = await ctx.db
      .insert(reportRenders)
      .values({
      workspaceId: saved.workspaceId,
      savedReportId: saved.id,
      scheduleId: schedule.id,
      scopeKind: scope.kind,
      scopeId: saved.scopeId,
      presetId: saved.presetId,
      filters: saved.filters as ReportFilters,
      comparison: saved.comparison as ComparisonConfig | null,
      status: 'queued',
      format: 'pdf',
      version: 1,
      triggeredBy: ctx.session.user.id,
      // schedule context'inde tetiklendi (scheduleId NOT NULL); 13J worker
      // auto-run da aynı 'scheduled' triggerKind'i kullanır — runNow ile
      // ayrım için scheduleId presence yeterli.
      triggerKind: 'scheduled',
    })
      .returning({ id: reportRenders.id });
    const renderId = inserted!.id;
    if (ctx.enqueueReportRender) {
      try {
        await ctx.enqueueReportRender({ renderId });
      } catch {
        // Best-effort.
      }
    }
    return { renderId };
  });

// ─── Print (nested) ─────────────────────────────────────────────────────────

const printRequestTokenRouter = publicProcedure
  .input(z.object({ renderId: idSchema }))
  .mutation(async ({ ctx, input }) => {
    // Worker authentication: bu prosedür Hono adapter tarafında
    // `x-worker-secret` header'ı kontrol edilip ctx.workerSharedSecret'i
    // yalnız doğru secret gelen request'lerde set edilerek korunur. Test
    // ctx'i secret'sız → UNAUTHORIZED. Host (`apps/api`) middleware'i
    // header eşleşmesi yaparsa ctx üzerinden geçer.
    const secret = ctx.workerSharedSecret;
    if (!secret) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'WORKER_SHARED_SECRET tanımlı değil (print akışı kapalı).',
      });
    }
    // Bu prosedür worker-only çağrılır. Header check için host (apps/api)
    // Hono middleware'i `x-worker-secret` ile ctx.workerSharedSecret
    // eşleşmesini server tarafında yapar. Burada secret olduğu kabul
    // edilir + token üretilir.
    const token = issuePrintToken({
      renderId: input.renderId,
      secret,
    });
    return {
      token,
      expiresAt: new Date(Date.now() + PRINT_TOKEN_TTL_MS).toISOString(),
    };
  });

const printVerifyTokenRouter = publicProcedure
  .input(z.object({ renderId: idSchema, token: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    const secret = ctx.workerSharedSecret;
    if (!secret) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'WORKER_SHARED_SECRET tanımlı değil (print akışı kapalı).',
      });
    }
    const result = verifyPrintToken({
      token: input.token,
      secret,
      expectedRenderId: input.renderId,
    });
    if (!result.ok) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: `Print token verification failed: ${result.reason}`,
      });
    }
    // Render dataset'i döner. Cache miss durumunda saved/adhoc snapshot'tan
    // re-query. V1'de basit: render row'undaki snapshot ile preview'u
    // yeniden çalıştır (worker print render'ı saved/adhoc fark etmez).
    const [render] = await ctx.db
      .select()
      .from(reportRenders)
      .where(eq(reportRenders.id, input.renderId))
      .limit(1);
    // Faz 13I (DEM-265 security M3) — timing oracle koruması: render
    // bulunamazsa NOT_FOUND yerine UNAUTHORIZED dön. Saldırgan token+geçerli
    // renderId vs token+geçersiz renderId'yi cevap tipinden ayırt edemesin
    // (renderId enumeration için fail-secure). Token doğrulaması zaten
    // başarılı, ama row yokluğu kullanıcıya 401 görünür.
    if (!render) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Print token verification failed.',
      });
    }
    // W7 (DB review): triggeredBy null → fail-secure. Worker print akışı
    // her zaman authenticated tetikleyiciye dayanır; null durumunda
    // print'in koşması anlamsız (cross-tenant veri sızıntısı riski).
    if (!render.triggeredBy) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Render tetikleyici yok — print akışı kapalı.',
      });
    }
    const scope = await scopeFromRenderRow(ctx.db, render);

    // M1 (security review): tetikleyici user'ın hâlâ scope erişimi var mı?
    // Demote senaryosunda eski yetkili kullanıcı için render bekleyebilir;
    // print render anında permission re-check ile fail-secure.
    const triggerSession = { user: { id: render.triggeredBy, email: '', name: '' } };
    const triggerPermCtx = await resolveReportPermissionCtx(
      { ...ctx, session: triggerSession },
      scope,
    );
    enforceReportPermission(canPerformReportAction('render', scope, triggerPermCtx));

    const queryCtx = {
      db: ctx.db,
      userId: render.triggeredBy,
      now: () => new Date(),
      permissions: buildReportPermissionsCtx({
        db: ctx.db,
        userId: render.triggeredBy,
      }),
    };
    const envelope = await renderReportDataset(queryCtx, getReportDataAdapter, {
      scope,
      presetId: render.presetId,
      filters: render.filters as ReportFilters,
      comparison: render.comparison as ComparisonConfig | null,
    });

    // Faz 13I (DEM-265) — print sayfası için i18n + workspace meta'sını
    // dataset'e göm. 13Q (DEM-266) tam i18n provider gelene kadar
    // server-side resolve fallback (`REPORT_PRINT_I18N_TR`): UI
    // `t(key) = payload.i18n[key] ?? key` ile çalışır. Workspace adı
    // (`PrintPageFrame` header'ında görünür) — render'ın workspace'inden.
    const [ws] = await ctx.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, render.workspaceId))
      .limit(1);
    return {
      envelope,
      i18n: REPORT_PRINT_I18N_TR,
      workspaceName: ws?.name ?? '',
      // V1: tek locale (tr-TR). 13Q i18n provider geldiğinde dataset
      // payload.locale ile dynamic olur.
      locale: 'tr-TR',
    };
  });

// ─── Root router ─────────────────────────────────────────────────────────────

const scheduleRouter = router({
  create: scheduleCreateRouter,
  update: scheduleUpdateRouter,
  delete: scheduleDeleteRouter,
  list: scheduleListRouter,
  listByWorkspace: scheduleListByWorkspaceRouter,
  runNow: scheduleRunNowRouter,
});

const printRouter = router({
  requestToken: printRequestTokenRouter,
  verifyToken: printVerifyTokenRouter,
});

export const reportRouter = router({
  catalog: catalogRouter,
  preview: previewRouter,
  save: saveRouter,
  listSaved: listSavedRouter,
  getSaved: getSavedRouter,
  update: updateSavedRouter,
  delete: deleteSavedRouter,
  archive: archiveSavedRouter,
  export: exportRouter,
  getRender: getRenderRouter,
  listRenders: listRendersRouter,
  schedule: scheduleRouter,
  print: printRouter,
});
