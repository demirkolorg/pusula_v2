/**
 * Faz 14E — Klasik pano PDF route handler (DEM-295).
 *
 * `GET /api/boards/[boardId]/report` (14A karar 5) — senkron deep-fetch +
 * `pdf(<BoardReportDocument data={...}/>).toBuffer()` → attachment stream.
 * Composer/queue/MinIO yok; Faz 13 raporlama subsystem'inden bağımsız.
 *
 * Hata yolu: 401 (session yok) · 403 (permission) · 404 (board yok) · 500
 * (deep-fetch / pdf render / unexpected). Sentry breadcrumb 14G'de hardening.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.18.3 +
 * `docs/process/08-faz-14-klasik-pdf-plani.md` §8.4 satır 14E.
 */
import { and, eq, getDb, type Database } from '@pusula/db';
import { boardMembers, boards, workspaceMembers } from '@pusula/db';
import {
  loadBoardForClassicReport,
  type BoardReportData,
} from '@pusula/api';
import { effectiveBoardRole } from '@pusula/domain';
import type { BoardRole, WorkspaceRole } from '@pusula/domain';
import {
  canPerformReportAction,
  type ReportPermissionCtx,
} from '@pusula/domain/reports';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { NextResponse, type NextRequest } from 'next/server';
import React from 'react';

import { BoardReportDocument } from '@/components/reports/classic-pdf/board-report-document';
import { env } from '@/env';
import {
  contentDispositionFor,
  makeClassicReportFilename,
} from '@/lib/pdf/filename';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BoardAccessSnapshot {
  board: { id: string; workspaceId: string; title: string };
  permCtx: ReportPermissionCtx;
}

/**
 * Session resolver — cookie'leri `apps/api`'deki Better Auth `get-session`
 * endpoint'ine forward eder. Web ile API farklı subdomain'lerde olabilir;
 * tarayıcı session cookie'sini iletmek için header'ı manuel kopyala.
 */
async function resolveSessionUserId(request: NextRequest): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/auth/get-session`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: { id?: string } } | null;
    return data?.user?.id ?? null;
  } catch (error) {
    console.error('[classic-pdf] session resolve failed:', error);
    return null;
  }
}

/**
 * Board + workspace/board membership lookup + permission ctx hazırlama
 * (Faz 13F `resolveReportPermissionCtx` deseninin tRPC bağımsız hali).
 *
 * Dönüş `null` ise board bulunamamış (404). `permCtx.workspace` null ise
 * çağırıcı caller workspace üyesi değil → permission helper FORBIDDEN üretir.
 */
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
  // `@react-pdf/renderer` v4'te `pdf(...).toBuffer()` PDFDocument döner;
  // server-side Buffer için `renderToBuffer()` API'si kullanılır (v3 → v4
  // breaking change). `BoardReportDocument` `<Document>` root döner;
  // generic uyumsuzluğu için cast minimal.
  const element = React.createElement(BoardReportDocument, {
    data,
  }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  if (!buffer || buffer.length === 0) throw new Error('PDF buffer oluşturulamadı');
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as ArrayBuffer);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
): Promise<Response> {
  const { boardId } = await params;

  const userId = await resolveSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  let snapshot: BoardAccessSnapshot | null;
  try {
    snapshot = await resolveBoardForReport(db, boardId, userId);
  } catch (error) {
    console.error('[classic-pdf] board access lookup failed:', error);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
  if (!snapshot) {
    return NextResponse.json({ error: 'Pano bulunamadı' }, { status: 404 });
  }

  const permission = canPerformReportAction(
    'render',
    { kind: 'board', workspaceId: snapshot.board.workspaceId, boardId: snapshot.board.id },
    snapshot.permCtx,
  );
  if (!permission.allowed) {
    return NextResponse.json(
      { error: 'Forbidden', reason: permission.reason ?? 'permission_denied' },
      { status: 403 },
    );
  }

  let data: BoardReportData | null;
  try {
    data = await loadBoardForClassicReport(db, boardId);
  } catch (error) {
    console.error('[classic-pdf] data fetch failed:', error);
    return NextResponse.json({ error: 'Rapor verisi yüklenemedi' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Pano bulunamadı' }, { status: 404 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderClassicReport(data);
  } catch (error) {
    console.error('[classic-pdf] pdf render failed:', error);
    return NextResponse.json({ error: 'Rapor üretilemedi' }, { status: 500 });
  }

  const filename = makeClassicReportFilename(data.board.title, new Date());

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDispositionFor(filename),
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
