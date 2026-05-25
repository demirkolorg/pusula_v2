/**
 * Faz 14E route handler unit tests (DEM-295) — `GET /api/boards/[boardId]/report`.
 *
 * Live PG ve gerçek Better Auth çağrısı YERINE bağımlılıklar mock'lanır:
 *   - `@pusula/db` `getDb` → in-memory fake query builder (board + workspace + board members)
 *   - `@pusula/api` `loadBoardForClassicReport` → fixture döner
 *   - `@react-pdf/renderer` `pdf` → fake `.toBuffer()`
 *   - global `fetch` → Better Auth session response stub
 *
 * E2E `pdf().toBuffer()` doğrulaması Faz 14G (DEM-297) Playwright suite'inde.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://api.test',
    NEXT_PUBLIC_SENTRY_DSN: undefined,
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
            if (callIndex === 2) return queryState.workspaceMember ? [queryState.workspaceMember] : [];
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

import { GET } from './route';

function makeRequest(cookie?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'cookie' ? (cookie ?? null) : null,
    },
  } as unknown as Parameters<typeof GET>[0];
}

function sessionResponse(userId: string | null) {
  return {
    ok: userId !== null,
    json: async () => (userId ? { user: { id: userId } } : null),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  loadBoardForClassicReport.mockReset();
  queryState.board = boardRow;
  queryState.workspaceMember = { role: 'member' };
  queryState.boardMember = null;
});

describe('GET /api/boards/[boardId]/report', () => {
  it('cookie yok → 401', async () => {
    const res = await GET(makeRequest(undefined), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(401);
  });

  it('apps/api session resolve fail → 401', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse(null));
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(401);
  });

  it('pano yok (board lookup boş) → 404', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    queryState.board = null;
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('workspace üyesi değil → 403 (canPerformReportAction not_workspace_member)', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    queryState.workspaceMember = null;
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(403);
  });

  it('happy path: workspace member → 200 + Content-Type application/pdf + filename header', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: { id: 'b1', title: 'Test Board', description: null, icon: 'i', createdAt: new Date().toISOString(), archivedAt: null },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });

    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toMatch(/filename="test-board-raporu-\d{4}-\d{2}-\d{2}\.pdf"/);
    expect(disposition).toContain("filename*=UTF-8''");
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('loadBoardForClassicReport null döner (race: lookup sonrası silinmiş) → 404', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    loadBoardForClassicReport.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(404);
  });

  it('loadBoardForClassicReport throw → 500', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    loadBoardForClassicReport.mockRejectedValueOnce(new Error('DB fail'));
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(500);
  });

  // Faz 14G — 14A karar 6 permission matrix (board scope `render`).
  // §9.5: workspace member + board viewer/member/admin → ALLOW; workspace
  // guest + board üyeliği yok → DENY (effective board rolü null).

  it('permission matrix — board viewer (workspace member + board viewer) → 200', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    queryState.workspaceMember = { role: 'member' };
    queryState.boardMember = { role: 'viewer' };
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: { id: 'b1', title: 'Viewer Board', description: null, icon: 'i', createdAt: new Date().toISOString(), archivedAt: null },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(200);
  });

  it('permission matrix — board admin (workspace owner inherit) → 200', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    queryState.workspaceMember = { role: 'owner' };
    queryState.boardMember = null; // owner workspace → inherited admin board
    loadBoardForClassicReport.mockResolvedValueOnce({
      board: { id: 'b1', title: 'Admin Board', description: null, icon: 'i', createdAt: new Date().toISOString(), archivedAt: null },
      workspace: { id: 'w1', name: 'WS' },
      members: [],
      lists: [],
      stats: { totalCards: 0, completedCards: 0, openCards: 0, progressPercent: 0 },
      generatedAt: new Date().toISOString(),
    });
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(200);
  });

  it('permission matrix — workspace guest + board üyeliği yok → 403 (effective board null)', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('u1'));
    queryState.workspaceMember = { role: 'guest' };
    queryState.boardMember = null;
    const res = await GET(makeRequest('cookie-val'), {
      params: Promise.resolve({ boardId: 'b1' }),
    });
    expect(res.status).toBe(403);
  });
});
