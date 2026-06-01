/**
 * Klasik pano PDF Hono route unit testleri (Faz 14E prod-fix 2026-06-01).
 *
 * Live DB ve gerçek Better Auth çağrısı YERINE bağımlılıklar mock'lanır:
 *   - `@pusula/db` `getDb` → in-memory fake query builder
 *   - `@pusula/api` `loadBoardForClassicReport` → fixture döner
 *   - `@react-pdf/renderer` `renderToBuffer` → fake `%PDF-` byte stream
 *   - `../auth` `auth.api.getSession` → session stub
 *
 * Önceki ortak (route.test.ts apps/web altında) testlerin Hono request flow'una
 * adaptasyonu; permission matrix kapsamı korundu.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getSessionMock = vi.fn();
vi.mock('../auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

const loadBoardForClassicReport = vi.fn();
vi.mock('@pusula/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadBoardForClassicReport: (...args: Parameters<typeof loadBoardForClassicReport>) =>
      loadBoardForClassicReport(...args),
  };
});

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: async () => Buffer.from('%PDF-fake'),
  Font: { register: vi.fn() },
  StyleSheet: { create: (s: unknown) => s },
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
}));

const boardRow = { id: 'b1', workspaceId: 'w1', title: 'Test Board' };
const queryState = {
  board: boardRow as typeof boardRow | null,
  workspaceMember: { role: 'member' } as { role: string } | null,
  boardMember: null as { role: string } | null,
};

function fakeDb() {
  let callIndex = 0;
  // Order: 1) boards, 2) workspaceMembers, 3) boardMembers
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callIndex += 1;
            if (callIndex === 1) return queryState.board ? [queryState.board] : [];
            if (callIndex === 2)
              return queryState.workspaceMember ? [queryState.workspaceMember] : [];
            if (callIndex === 3) return queryState.boardMember ? [queryState.boardMember] : [];
            return [];
          },
        }),
      }),
    }),
  };
}

vi.mock('@pusula/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getDb: () => fakeDb(),
  };
});

import { boardReportRoute } from './board-report';

function request(boardId: string, init?: { cookie?: string }) {
  const headers = new Headers();
  if (init?.cookie) headers.set('cookie', init.cookie);
  return boardReportRoute.request(`/${boardId}/report`, { method: 'GET', headers });
}

beforeEach(() => {
  getSessionMock.mockReset();
  loadBoardForClassicReport.mockReset();
  queryState.board = boardRow;
  queryState.workspaceMember = { role: 'member' };
  queryState.boardMember = null;
});

describe('GET /api/boards/:boardId/report (Hono)', () => {
  it('session yok → 401', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await request('b1');
    expect(res.status).toBe(401);
  });

  it('getSession throw → 401', async () => {
    getSessionMock.mockRejectedValueOnce(new Error('cookie corrupted'));
    const res = await request('b1', { cookie: 'session=garbage' });
    expect(res.status).toBe(401);
  });

  it('pano yok (board lookup boş) → 404', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    queryState.board = null;
    const res = await request('missing', { cookie: 'session=ok' });
    expect(res.status).toBe(404);
  });

  it('workspace üyesi değil → 403', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    queryState.workspaceMember = null;
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(403);
  });

  it('happy path: workspace member → 200 + Content-Type + filename header', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: {
        id: 'b1',
        title: 'Test Board',
        description: null,
        icon: 'i',
        createdAt: new Date().toISOString(),
        archivedAt: null,
      },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });

    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toMatch(/filename="test-board-raporu-\d{4}-\d{2}-\d{2}\.pdf"/);
    expect(disposition).toContain("filename*=UTF-8''");
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('loadBoardForClassicReport null → 404', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    loadBoardForClassicReport.mockResolvedValueOnce(null);
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(404);
  });

  it('loadBoardForClassicReport throw → 500', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    loadBoardForClassicReport.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(500);
  });

  // Permission matrix (canPerformReportAction board scope `render`)
  it('permission matrix — board viewer (workspace member + board viewer) → 200', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    queryState.workspaceMember = { role: 'member' };
    queryState.boardMember = { role: 'viewer' };
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: {
        id: 'b1',
        title: 'Viewer Board',
        description: null,
        icon: 'i',
        createdAt: new Date().toISOString(),
        archivedAt: null,
      },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(200);
  });

  it('permission matrix — board admin (workspace owner inherit) → 200', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    queryState.workspaceMember = { role: 'owner' };
    queryState.boardMember = null;
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: {
        id: 'b1',
        title: 'Admin Board',
        description: null,
        icon: 'i',
        createdAt: new Date().toISOString(),
        archivedAt: null,
      },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(200);
  });

  it('permission matrix — workspace guest + board üyeliği yok → 403', async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    queryState.workspaceMember = { role: 'guest' };
    queryState.boardMember = null;
    const res = await request('b1', { cookie: 'session=ok' });
    expect(res.status).toBe(403);
  });
});
