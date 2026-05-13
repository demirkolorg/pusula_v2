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
  /** List titles in `position` order. */
  listTitles: ['Liste 1', 'Liste 2', 'Liste 3'] as const,
  /** Card titles per list index (0-based), in `position` order. */
  cards: [
    ['Kart A', 'Kart B', 'Kart C'],
    ['Kart D', 'Kart E'],
    ['Kart F', 'Kart G'],
  ] as const,
} as const;

/** The board page URL for the seeded board. */
export const boardPath = `/workspaces/${E2E.workspaceId}/boards/${E2E.boardId}`;
