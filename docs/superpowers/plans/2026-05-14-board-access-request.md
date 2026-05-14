# Board Access Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Trello-style board access request screen for signed-in users who open a board link without access, and let board admins approve the request in one atomic action.

**Architecture:** Keep `board.get` protected by `boardProcedure`. Add a separate `board.accessRequests` router with a safe context query, a requester-side `request` mutation, and admin-only `list` / `approve` / `reject` mutations. Persist requests in `board_access_requests`; approval creates a workspace `guest` membership when needed, then creates the selected board membership in the same transaction.

**Tech Stack:** Drizzle + PostgreSQL, tRPC, `@pusula/domain` Zod schemas, Next.js App Router, TanStack Query, shadcn/ui, Vitest.

---

### Task 1: Schema And API Contract

**Files:**

- Modify: `packages/db/src/schema/boards.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/domain/src/schemas/board.ts`
- Create: `packages/api/src/routers/board-access-requests.ts`
- Modify: `packages/api/src/routers/board.ts`
- Test: `packages/api/src/routers/board-access-requests.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests for:

- context returns board/workspace names and requester account while `board.get` still rejects outsiders.
- request is idempotent for the same pending `(boardId, requesterId)`.
- approve inserts workspace `guest` when missing and inserts selected `board_members.role`.
- reject closes the pending request and prevents later approval.

Run:
`$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'; pnpm.cmd --filter @pusula/api test -- src/routers/board-access-requests.test.ts`

Expected: fail because router/schema/table do not exist.

- [ ] **Step 2: Add table and domain inputs**

Create `boardAccessRequests` in `boards.ts` with:

- `id`, `boardId`, `requesterId`, `status`, `message`, `resolvedById`, `resolvedAt`, timestamps.
- check constraint for `status IN ('pending','approved','rejected')`.
- partial unique index on `(board_id, requester_id) WHERE status = 'pending'`.

Add inputs:

- `boardAccessContextInput = { boardId }`
- `requestBoardAccessInput = { boardId, message?, clientMutationId? }`
- `listBoardAccessRequestsInput = { boardId }`
- `approveBoardAccessRequestInput = { boardId, requestId, role: 'member' | 'viewer', clientMutationId? }`
- `rejectBoardAccessRequestInput = { boardId, requestId, clientMutationId? }`

- [ ] **Step 3: Implement router**

Implement `board.accessRequests.context/request/list/approve/reject`.

Approval rules:

- Requires `canManageBoard`.
- Locks pending request row with `.for('update')`.
- If requester has no workspace membership, insert `workspace_members` as `guest` and write `workspace.member_added`.
- If requester has no explicit board membership, insert `board_members` with selected role and write `board.member_added`.
- Mark request `approved`, stamp resolver fields, bump board version.

- [ ] **Step 4: Generate migration**

Run:
`pnpm.cmd db:generate`

Review migration for `board_access_requests`, indexes, and check constraint only.

- [ ] **Step 5: Verify API tests pass**

Run:
`$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'; pnpm.cmd --filter @pusula/api test -- src/routers/board-access-requests.test.ts`

Expected: pass.

### Task 2: Board Route Access Screen

**Files:**

- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-access-request-screen.tsx`
- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.tsx`
- Modify: `apps/web/src/lib/realtime/use-board-realtime.ts`
- Modify: `apps/web/src/lib/strings.ts`

- [ ] **Step 1: Write failing web tests**

Add tests that:

- render access request screen when context says `hasAccess: false`.
- show current user name/email and target board/workspace names.
- clicking request calls `board.accessRequests.request`.
- no `board.get` query is enabled while access is false.

Run:
`pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx"`

Expected: fail because component/flow do not exist.

- [ ] **Step 2: Gate board loading by safe context**

`page.tsx` first queries `board.accessRequests.context`. It enables `board.get` and realtime only when `hasAccess === true`; otherwise renders the request screen.

- [ ] **Step 3: Add request screen**

Use compact, centered product UI:

- shield/lock icon.
- title: board is private / access required.
- target board + workspace names.
- signed-in account name/email.
- request button with pending/sent states.
- no account-switch action.

- [ ] **Step 4: Add enabled flag to realtime hook**

`useBoardRealtime(boardId, { enabled })` should skip socket join/listeners when disabled and return `connected: true` so no disconnect banner appears on the request screen.

### Task 3: Admin Review UI

**Files:**

- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-access-requests-section.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-invitations-section.tsx`
- Modify: `apps/web/src/lib/strings.ts`
- Test: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-access-requests-section.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test pending request rendering, member/viewer approve action, reject action, and admin-only visibility.

- [ ] **Step 2: Implement section**

Render pending requests below board invitations. Use a role select constrained to `member` / `viewer`, `Onayla`, and `Reddet`.

- [ ] **Step 3: Invalidate caches**

On approve/reject invalidate `board.accessRequests.list`, `board.members.list`, and `board.get`.

### Task 4: Docs And Verification

**Files:**

- Modify: `docs/domain/02-yetkilendirme-kurallari.md`
- Modify: `docs/architecture/03-backend.md`
- Modify: `docs/architecture/08-web-ve-mobil.md`
- Modify: `docs/process/05-is-kayit-defteri.md`

- [ ] **Step 1: Document board-only request flow**

State that board links are the only request trigger, requests are board-scoped, and approval provisions workspace `guest` automatically when needed.

- [ ] **Step 2: Run focused tests**

Run:
`$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'; pnpm.cmd --filter @pusula/api test -- src/routers/board-access-requests.test.ts`
`pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx"`
`pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-access-requests-section.test.tsx"`

- [ ] **Step 3: Run full verification**

Run:
`$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'; $env:REDIS_URL='redis://localhost:6380'; $env:AUTH_SECRET='change-me-in-local-and-prod'; $env:APP_URL='http://localhost:3000'; $env:API_URL='http://localhost:3001'; $env:NEXT_PUBLIC_API_URL='http://localhost:3001'; pnpm.cmd test`

Expected: all tests pass.
