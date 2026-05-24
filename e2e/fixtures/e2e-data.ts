/**
 * Fixed e2e fixture data — IDs, credentials, seeded titles (Faz 3D — DEM-45).
 *
 * Pure data, **no imports** (no `@pusula/db`, no `better-auth`, no Node APIs):
 * this module is imported both by the Playwright-transpiled fixtures/specs (which
 * resolve deps from the repo root) and by `seed.ts` (which runs under `tsx` and
 * can resolve the workspace packages). Keeping it dependency-free is what makes
 * that work.
 */
export const E2E = {
  workspaceId: 'e2e-workspace',
  workspaceSlug: 'e2e-workspace',
  boardId: 'e2e-board',
  boardTitle: 'E2E Pano',
  user: {
    id: 'e2e-user',
    name: 'E2E Kullanıcı',
    email: 'e2e-user@pusula.test',
    password: 'e2e-password-1234',
  },
  viewer: {
    id: 'e2e-viewer',
    name: 'E2E İzleyici',
    email: 'e2e-viewer@pusula.test',
    password: 'e2e-password-1234',
  },
  /** alice + bob: workspace `member` + board `member` (DEM-86 realtime pair). */
  alice: {
    id: 'e2e-alice',
    name: 'Alice',
    email: 'e2e-alice@pusula.test',
    password: 'e2e-password-1234',
  },
  bob: {
    id: 'e2e-bob',
    name: 'Bob',
    email: 'e2e-bob@pusula.test',
    password: 'e2e-password-1234',
  },
  /** Fixed card ids used by the notification e2e suite (DEM-94). */
  cardIds: {
    assignment: 'e2e-card-1-1',
    watched: 'e2e-card-1-2',
    mention: 'e2e-card-1-3',
  },
  /** Fixed search terms used by the DEM-108 Playwright search suite. */
  search: {
    cardTerm: 'maas destek dosyasi',
    commentTerm: 'yorum takip imzasi',
    labelName: 'E2E Arama Etiketi',
    labelId: 'e2e-search-label',
    commentId: 'e2e-search-comment',
    hiddenWorkspaceId: 'e2e-hidden-search-workspace',
    hiddenBoardId: 'e2e-hidden-search-board',
    hiddenTerm: 'gizli arama hazinesi',
  },
  /** List titles in `position` order. */
  listTitles: ['Liste 1', 'Liste 2', 'Liste 3'] as const,
  /** Card titles per list index (0-based), in `position` order. */
  cards: [
    ['Kart A', 'Kart B', 'Kart C'],
    ['Kart D', 'Kart E'],
    ['Kart F', 'Kart G'],
  ] as const,
  /**
   * Faz 13R (DEM-274) — Raporlama E2E için ek pano kümesi. Mevcut tek
   * `e2e-board` üzerinde rapor preset'lerinin (workspace.executive-summary,
   * status-breakdown vb.) anlamlı sayılar üretebilmesi için 4 ek pano
   * + her birinde 1-2 liste + ~5 kart (overdue/completed varyetesi).
   *
   * Üyelik haritası:
   *   - `e2e-user` (workspace owner): tüm panolarda `board:admin`.
   *   - `e2e-viewer` (workspace guest): yalnız `e2e-board`'ta `board:viewer`.
   *   - `e2e-alice` (workspace member): `e2e-board` + ilk 2 ek panoda
   *     (`-2`, `-3`) `board:member`. `-4` ve `-5` panolara erişimi yok →
   *     workspace.executive-summary açtığında §9.4 "restricted scope"
   *     rozeti görünür (2 pano dışlanır).
   *   - `e2e-bob` (workspace member): yalnız `e2e-board`'ta `board:member`
   *     (mevcut Faz 5D realtime pair); ek panolarda erişimi yok.
   */
  reports: {
    /** Ek pano ID'leri ve başlıkları — toplam 5 pano (mevcut 1 + 4 yeni). */
    extraBoards: [
      { id: 'e2e-board-2', title: 'E2E Pano 2' },
      { id: 'e2e-board-3', title: 'E2E Pano 3' },
      { id: 'e2e-board-4', title: 'E2E Pano 4' },
      { id: 'e2e-board-5', title: 'E2E Pano 5' },
    ] as const,
    /**
     * Senaryo 4 (restricted scope): alice'in workspace.executive-summary
     * raporunda dışlanan pano sayısı (board-4 + board-5 = 2).
     */
    expectedRestrictedBoardCount: 2,
  },
} as const;

/** The board page URL for the seeded board. */
export const boardPath = `/workspaces/${E2E.workspaceId}/boards/${E2E.boardId}`;

/** Workspace `/reports` merkez sayfası URL'i (DEM-264). */
export const reportsPath = `/workspaces/${E2E.workspaceId}/reports`;
