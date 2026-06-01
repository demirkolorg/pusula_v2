/**
 * Faz 14E prod-fix (2026-06-01) — klasik pano PDF endpoint'i Hono raw route.
 *
 * `GET /api/boards/:boardId/report` — senkron deep-fetch +
 * `renderToBuffer(<BoardReportDocument data={...}/>)` → attachment stream.
 * Composer/queue/MinIO yok; Faz 13 raporlama subsystem'inden bağımsız.
 *
 * **Neden `apps/api`'de?** Önceki yer `apps/web` Next.js route handler'dı;
 * browser `pusulaportal.com/api/boards/.../report` çağrısında yalnız web
 * subdomain'ine ait cookie'leri yolluyordu. Better Auth cookie'si
 * `api.pusulaportal.com` host-only set edildiğinden (no `crossSubDomainCookies`
 * config) web route handler her zaman cookie göremez → 401. Endpoint API'ye
 * taşındı, browser doğrudan `${NEXT_PUBLIC_API_URL}/api/boards/.../report`'a
 * `credentials: 'include'` ile bağlanır; tRPC ile aynı cookie disiplini.
 *
 * Hata yolu: 401 (session yok) · 403 (permission) · 404 (board yok) · 500
 * (deep-fetch / pdf render / unexpected).
 */
import { Hono } from 'hono';
import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { and, eq, getDb, type Database } from '@pusula/db';
import { boardMembers, boards, workspaceMembers } from '@pusula/db';
import { loadBoardForClassicReport, type BoardReportData } from '@pusula/api';
import { effectiveBoardRole } from '@pusula/domain';
import type { BoardRole, WorkspaceRole } from '@pusula/domain';
import {
  canPerformReportAction,
  type ReportPermissionCtx,
} from '@pusula/domain/reports';

import { auth } from '../auth';
import { BoardReportDocument } from '../reports/board-report-document';
import {
  contentDispositionFor,
  makeClassicReportFilename,
} from '../reports/filename';

interface BoardAccessSnapshot {
  board: { id: string; workspaceId: string; title: string };
  permCtx: ReportPermissionCtx;
}

async function resolveBoardForReport(
  db: Database,
  boardId: string,
  userId: string,
): Promise<BoardAccessSnapshot | null> {
  const [board] = await db
    .select({ id: boards.id, workspaceId: boards.workspaceId, title: boards.title })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!board) return null;

  const [wsMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, board.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  const workspaceRole = (wsMembership?.role ?? null) as WorkspaceRole | null;

  const [boardMembership] = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, board.id), eq(boardMembers.userId, userId)))
    .limit(1);
  const boardRole = effectiveBoardRole({
    workspaceRole,
    boardRole: (boardMembership?.role ?? null) as BoardRole | null,
  });

  return {
    board,
    permCtx: { workspace: workspaceRole, board: boardRole },
  };
}

async function renderClassicReport(data: BoardReportData): Promise<Buffer> {
  const element = React.createElement(BoardReportDocument, {
    data,
  }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  if (!buffer || buffer.length === 0) throw new Error('PDF buffer oluşturulamadı');
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as ArrayBuffer);
}

export const boardReportRoute = new Hono();

boardReportRoute.get('/:boardId/report', async (c) => {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch((error: unknown) => {
      console.error('[classic-pdf] session resolve failed:', error);
      return null;
    });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const boardId = c.req.param('boardId');
  const db = getDb();

  let snapshot: BoardAccessSnapshot | null;
  try {
    snapshot = await resolveBoardForReport(db, boardId, userId);
  } catch (error) {
    console.error('[classic-pdf] board access lookup failed:', error);
    return c.json({ error: 'Sunucu hatası' }, 500);
  }
  if (!snapshot) {
    return c.json({ error: 'Pano bulunamadı' }, 404);
  }

  const permission = canPerformReportAction(
    'render',
    { kind: 'board', workspaceId: snapshot.board.workspaceId, boardId: snapshot.board.id },
    snapshot.permCtx,
  );
  if (!permission.allowed) {
    return c.json(
      { error: 'Forbidden', reason: permission.reason ?? 'permission_denied' },
      403,
    );
  }

  let data: BoardReportData | null;
  try {
    data = await loadBoardForClassicReport(db, boardId);
  } catch (error) {
    console.error('[classic-pdf] data fetch failed:', error);
    return c.json({ error: 'Rapor verisi yüklenemedi' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Pano bulunamadı' }, 404);
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderClassicReport(data);
  } catch (error) {
    console.error('[classic-pdf] pdf render failed:', error);
    return c.json({ error: 'Rapor üretilemedi' }, 500);
  }

  const filename = makeClassicReportFilename(data.board.title, new Date());

  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', contentDispositionFor(filename));
  c.header('Content-Length', String(pdfBuffer.length));
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.body(new Uint8Array(pdfBuffer), 200);
});
