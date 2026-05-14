# Pusula e2e (Playwright)

End-to-end tests. The first pass was Faz 3D ([DEM-45](https://linear.app/demirkol/issue/DEM-45))
for board drag-drop; later passes add focused flows such as notifications
([DEM-94](https://linear.app/demirkol/issue/DEM-94)) and search
([DEM-108](https://linear.app/demirkol/issue/DEM-108)). The wide e2e suite
(auth / board / card / all flows) is Faz 8 ([DEM-31](https://linear.app/demirkol/issue/DEM-31)).

Harness layout (repo-root `e2e/`, not a workspace package — see
[`docs/architecture/10-platform.md`](../docs/architecture/10-platform.md) §10.1):

```
playwright.config.ts           # repo root — webServer (api + web), globalSetup, projects
e2e/
  global-setup.ts              # pnpm db:migrate + run the e2e seed
  board-drag-drop.spec.ts      # the drag-drop specs
  search.spec.ts               # global/board search + permission + card deep-link specs
  fixtures/
    seed.ts                    # deterministic reset-then-seed; also runnable as `tsx e2e/fixtures/seed.ts`
    auth.fixture.ts            # `test.authedPage` / `test.viewerPage` — sign in via Better Auth HTTP
    board.fixture.ts           # BoardPage — accessible locators for columns/cards
  helpers/
    dnd.ts                     # `dragElement(...)` — Playwright mouse steps (Pragmatic DnD uses native drag events)
  tsconfig.json                # for editor / lint / typecheck only
```

## Run locally

1. Start the local infra (repo-root docker-compose Postgres/Redis):

   ```bash
   pnpm infra:up
   ```

2. Apply DB migrations (the e2e `globalSetup` also does this, but doing it once
   up front is fine):

   ```bash
   pnpm db:migrate
   ```

3. Install the Chromium browser Playwright drives:

   ```bash
   pnpm exec playwright install --with-deps chromium   # `--with-deps` is Linux/CI; on macOS/Windows just `playwright install chromium`
   ```

4. Run the suite (boots `apps/api` + `apps/web` via `webServer`, seeds, then runs):

   ```bash
   pnpm test:e2e            # headless
   pnpm test:e2e:ui         # Playwright UI mode
   pnpm exec playwright test --list   # just enumerate the tests (no run)
   ```

   Artifacts on failure: `playwright-report/` (HTML), `test-results/` (traces /
   videos / screenshots), `playwright-results.xml` (JUnit). All git-ignored.

`pnpm test:e2e` is **not** part of `turbo run test` — e2e is heavier and needs the
stack + a DB; keep it a separate script.

## Test user

Seeded by `e2e/fixtures/seed.ts` (fixed ids/credentials in `E2E`):

| Who    | Email                    | Password            | Roles                                  |
| ------ | ------------------------ | ------------------- | -------------------------------------- |
| user   | `e2e-user@pusula.test`   | `e2e-password-1234` | workspace `owner`, board `admin`       |
| viewer | `e2e-viewer@pusula.test` | `e2e-password-1234` | workspace `guest`, board `viewer` (RO) |
| alice  | `e2e-alice@pusula.test`  | `e2e-password-1234` | workspace `member`, board `member`     |
| bob    | `e2e-bob@pusula.test`    | `e2e-password-1234` | workspace `member`, board `member`     |

`alice` + `bob` are the two-user pair the realtime board sync specs (Faz 5D —
[DEM-86](https://linear.app/demirkol/issue/DEM-86)) sign in side-by-side; either
can edit the shared board and the other receives the realtime echo.

Seeded data: one visible workspace (`e2e-workspace`), one board (`e2e-board`,
"E2E Pano") with 3 lists ("Liste 1/2/3") — Liste 1 has cards A/B/C, Liste 2 has
D/E, Liste 3 has F/G — all at known fractional positions. DEM-108 also seeds
search-only metadata without changing card titles: a unique card description, a
unique comment, a unique label, populated `search_documents`, and one hidden
Bob-owned workspace/board for permission-leak checks. The seed is
**reset-then-seed**, run once in `globalSetup` and again in each test's
`beforeEach`, so tests are order-independent.

## CI

No CI workflow is wired for e2e yet. When one is added, the job needs: Postgres +
Redis service containers (or docker-compose), `pnpm install`, `pnpm db:migrate`,
`pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`, and an
upload of `playwright-report/` on failure.
