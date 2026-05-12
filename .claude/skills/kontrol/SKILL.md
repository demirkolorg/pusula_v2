---
name: kontrol
title: "Pusula Project Skill"
description: Use when building, reviewing, refactoring, planning, or making technology decisions for Pusula, a Trello-like task management product with Next.js web, Hono backend, Expo mobile, tRPC, optimistic UI, realtime board sync, notifications, shadcn/ui, Better Auth, Dokploy, MinIO, Resend, PostgreSQL, Drizzle, Redis, and Pragmatic Drag and Drop. Apply this skill whenever the task touches Pusula architecture, code structure, API design, drag-drop, notifications, realtime, auth, deployment, search, UI components, or implementation rules.
aliases:
  - "Pusula kontrol skill"
  - "Implementation Contract"
tags:
  - "pusula"
  - "skill/claude-code"
  - "process/protocol"
type: "skill"
axis: "process"
status: "active"
parent: "[[CLAUDE|Çalışma Protokolü]]"
updated: 2026-05-12
---

# Pusula Project (skill: `kontrol`)

## Purpose

Use this skill as the implementation contract for Pusula. Keep decisions consistent with the docs; do not reopen settled choices unless the user explicitly asks to revisit them.

Pusula is a Trello-like task management product centered on workspaces, boards, lists, cards, drag-drop, optimistic UI, realtime collaboration, and strong notification behavior. This is the **v2** rewrite of `D:\projects\pusula`: web / mobile / API are now separate layers with shared packages, and the stack moved off Prisma to Drizzle. The legacy web app at `D:\projects\pusula` is a valid reference for UI/UX and domain logic — not for stack choices.

## Where the rules live (design / business / process axes)

The full rules are in `docs/`, split by axis — never mix design and business rules in one file:

- **Design / technical** (`docs/architecture/`) — _how we build it_: stack, monorepo, patterns (optimistic UI, outbox, transactions), infra, transport, deployment, observability, testing. Index: `docs/architecture/README.md`.
- **Business / domain** (`docs/domain/`) — _what the product does, who can do what, what triggers what_: domain model & invariants, authorization rules, ranking/notification/activity/search/attachment rules. Index: `docs/domain/README.md`.
- **Process** (`docs/process/`) — _how we work_: default start guide, Linear workflow, automatic docs ↔ Linear sync protocol, work register, MVP phase plan. Index: `docs/process/README.md`.

Top-level index: `docs/README.md`. Working protocol: `CLAUDE.md`. Default start guide for every new task/session: `docs/process/00-calisma-baslangic-rehberi.md`. Automatic workflow protocol: `docs/process/04-otomatik-is-akisi-protokolu.md`; repo-side work register: `docs/process/05-is-kayit-defteri.md`. This skill is the condensed contract; when a task needs detail, open the matching `docs/` file (and update it before writing code — design rule → `docs/architecture/`, business rule → `docs/domain/`, process rule → `docs/process/`).

The repo is also an Obsidian vault. Keep Markdown docs compatible with `docs/process/06-obsidian-dokumantasyon-kurallari.md`: frontmatter properties, aliases, tags, parent/related links, and MOC/README entries must stay current for every new or intentionally updated `.md` file.

## Fixed Technology Decisions

Use these decisions as defaults:

| Area | Decision |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js App Router |
| Backend | Hono HTTP server |
| API contract | tRPC |
| Client cache | TanStack Query |
| Mobile | Expo + Expo Router |
| Database | PostgreSQL |
| ORM | Drizzle |
| Queue | BullMQ + Redis |
| Realtime | Socket.IO + Redis adapter |
| Push | Expo Notifications |
| Drag-drop | Atlassian Pragmatic Drag and Drop |
| Auth | Better Auth |
| Web UI | shadcn/ui only |
| Icons | lucide-react |
| Deployment | Self-hosted Dokploy |
| Object storage | Self-hosted MinIO through S3-compatible APIs |
| Email | Resend |
| Search | MVP: PostgreSQL full-text search; later: Meilisearch |
| Billing | No billing/subscription |
| Observability | Sentry + OpenTelemetry + structured logs |
| Testing | Vitest, Playwright, React Testing Library |

## Monorepo Shape

Prefer this structure (already scaffolded in Phase 0):

```txt
apps/
  web/        Next.js web app                          → @pusula/web
  api/        Hono server mounting tRPC + Better Auth   → @pusula/api-server
  worker/     queues, notifications, outbox, scheduled  → @pusula/worker
  mobile/     Expo app                                  → (later phase, not yet present)

packages/
  api/        tRPC routers, procedures, context         → @pusula/api
  db/         Drizzle schema, migrations, tx helpers    → @pusula/db
  domain/     Zod schemas, permissions, domain/event types, position helpers → @pusula/domain
  config/     shared tsconfig/eslint config             → @pusula/config
  ui/         shadcn/ui-based web components only        → @pusula/ui
```

Note: the tRPC package is `@pusula/api` (in `packages/api`); the Hono server app is `@pusula/api-server` (in `apps/api`). Keep the main API outside Next.js. Next.js route handlers may be used for web-specific BFF or callbacks, but the shared web/mobile API source of truth is `apps/api` + `packages/api`.

## Hard Rules

- Use TypeScript strict mode.
- Use tRPC as the primary API contract; do not create a parallel main API with Hono RPC.
- Use Hono for HTTP concerns: CORS, request id, logging, rate limit, auth context, healthcheck, metrics, webhooks, and tRPC mounting.
- Use PostgreSQL as the transactional source of truth.
- Use Drizzle for schema, migrations, and transactions. The shared Drizzle instance uses `casing: 'snake_case'` — write camelCase column keys in TS; the DB columns are snake_case.
- Use shadcn/ui as the only web component system.
- Do not add MUI, Chakra UI, Ant Design, Mantine, Headless UI, or another web component library.
- Use Radix primitives only as part of shadcn/ui components.
- Build custom web components on top of shadcn/ui, Tailwind CSS, and lucide-react. Shared web components live in `@pusula/ui`; design tokens live in `@pusula/ui/theme.css`.
- Use Better Auth for authentication; it owns `${API_URL}/api/auth/*` on the Hono server. Its tables (`users`, `sessions`, `accounts`, `verifications`) live in `@pusula/db`.
- Keep authorization separate from authentication; implement workspace/board/card permission checks in domain/API code (`@pusula/domain/permissions`, tRPC procedures).
- Use Socket.IO for realtime board events and presence; do not treat sockets as persistent state.
- Use outbox tables and workers for notifications, realtime event publishing, search indexing, and email/push delivery.
- Use Expo Notifications for push; never use Socket.IO as a push notification substitute.
- Use Resend for transactional email and digest email.
- Use MinIO through S3-compatible SDKs; do not bind application logic to MinIO-only APIs.
- Do not implement billing or subscription logic.

## Domain Model

Design around these entities (schema lives in `packages/db/src/schema`):

- Workspace, Workspace member
- Board, Board member, Label
- List
- Card, Card member, Card label, Checklist, Checklist item
- Comment, Attachment
- Activity event, Realtime event
- Notification, Notification preference, Notification outbox, Push token
- Search document
- (Better Auth) User, Session, Account, Verification

Core invariants:

- A card belongs to exactly one list at a time.
- A list belongs to exactly one board.
- A card belongs to the same board as its list.
- Archived lists should not receive active card moves unless an explicit restore flow exists.
- Permission checks must happen server-side for every procedure.
- Realtime room access must be derived from server-side board/workspace permission.
- Activity, notification outbox, realtime event records, and domain mutations should be created in the same transaction where practical.

## Ordering and Drag-Drop

Use Atlassian Pragmatic Drag and Drop for web board/list/card drag-drop.

Do not use integer `order` fields that require renumbering whole lists. Positions are LexoRank-like strings; use the helpers in `@pusula/domain/position` (`positionBetween`, `positionsBetween`, `firstPosition` — backed by `fractional-indexing`):

```txt
card A position = "a0"
card B position = "a8"
inserted card position = "a4"
```

Drag-drop rules:

- Never send backend mutations continuously during drag.
- Update local state during drag.
- Run the mutation only on `onDragEnd`.
- Make move mutations optimistic.
- Roll back on mutation failure.
- Keep card/list dimensions stable to prevent layout shift.
- Use `clientMutationId` so realtime echo events from the same client are ignored (`@pusula/domain` exposes `clientMutationIdSchema` / `withClientMutationId`).
- Add Playwright tests for same-list move, cross-list move, list reorder, failure rollback, and concurrent users.

Preferred move mutation shape (see `moveCardInput` in `@pusula/domain`):

```ts
moveCard({
  cardId,
  fromListId,
  toListId,
  beforeCardId,
  afterCardId,
  newPosition,
  clientMutationId,
});
```

Server move flow:

1. Check edit permission on the board.
2. Validate current card/list state.
3. Compute or validate the new position.
4. Update card in a transaction.
5. Insert activity event.
6. Insert realtime event.
7. Insert notification outbox records.

## Optimistic UI

Use TanStack Query with tRPC (`@trpc/tanstack-react-query`; web client in `apps/web/src/trpc`).

For mutations:

- `onMutate`: cancel relevant queries, snapshot current cache, apply optimistic update, return rollback context.
- `onError`: restore the snapshot and show a low-noise error.
- `onSuccess`: reconcile with server result.
- `onSettled`: invalidate board/card queries as needed.

Mutation protocol rules:

- Every mutation that changes collaborative state must carry `clientMutationId`.
- Mutations should be idempotent where practical.
- Duplicate mutation delivery must not create duplicate activity or notifications.
- Realtime events must not double-apply optimistic updates from the same client.

## Realtime

Use Socket.IO + Redis adapter.

Use realtime for: card created/moved/updated, list created/moved/updated, comments, mentions, notification badge updates, presence.

Do not use realtime for: push notifications, email, durable event storage, source-of-truth conflict resolution.

Realtime source of truth:

```txt
DB transaction
  -> activity_events
  -> realtime_events
  -> notification_outbox

worker or after-commit publisher
  -> Socket.IO room publish
```

Room model (`@pusula/domain/events` exposes `roomName(kind, id)`):

```txt
workspace:{workspaceId}
board:{boardId}
card:{cardId}
user:{userId}
```

Event envelope (`RealtimeEventEnvelope` / `realtimeEventEnvelopeSchema` in `@pusula/domain`):

```ts
type RealtimeEventEnvelope<TPayload> = {
  id: string;
  workspaceId: string;
  boardId?: string;
  cardId?: string;
  actorId: string;
  type: string;
  payload: TPayload;
  clientMutationId?: string;
  boardVersion?: number;
  sequence: number;
  createdAt: string;
};
```

Use `sequence` (global, from `realtime_events.sequence`) or `boards.version` so clients can detect missed events and refetch. If multiple API instances are deployed, use the Redis adapter. If Socket.IO long-polling remains enabled behind Dokploy/Traefik, test sticky sessions.

## Notifications

Build notifications as a first-class subsystem.

Channels: in-app notification, realtime badge update, Expo mobile push, Resend email, future Slack/Teams integration only if explicitly requested.

Sources: card assignment, mention, comment reply, due date approaching, due date overdue, board invitation, workspace invitation, watched card/list activity, checklist item completed.

Use outbox (`notification_outbox` table, `@pusula/worker` consumes it):

```txt
domain event
  -> activity_events
  -> notification_outbox
  -> worker
  -> notifications table
  -> socket badge update
  -> Expo push
  -> Resend email when applicable
```

Never send push or email directly inside the API request path.

## Auth and Authorization

Use Better Auth (instance: `apps/api/src/auth.ts`; web client: `apps/web/src/lib/auth-client.ts`).

Keep permission logic separate (`@pusula/domain/permissions`):

```txt
protectedProcedure
  -> session check
  -> workspace access
  -> board access
  -> card/list permission
  -> mutation/query
```

Permission roles (literal arrays + helpers in `@pusula/domain`):

```txt
Workspace: owner, admin, member, guest
Board: admin, member, viewer
Card: assignee, watcher
```

Use server-side checks for every tRPC procedure. Do not trust frontend state for authorization. `protectedProcedure` (in `@pusula/api`) guarantees a non-null session; layer workspace/board checks on top per the doc.

## Web Rules

Use Next.js App Router. App lives in `apps/web/src/app`; `@/*` → `apps/web/src/*`.

Board screens are client-heavy and must prioritize:

- stable layout
- horizontal scrolling
- no drag layout shift
- keyboard accessibility
- drag overlay
- multi-list reorder
- optimistic cache updates
- realtime reconciliation

Use shadcn/ui for all web UI components. Use Tailwind CSS (v4) for styling and lucide-react for icons. Do not introduce another component library. Add shadcn components into `@pusula/ui` (`components.json` is configured there).

## Mobile Rules

Use Expo + Expo Router. **Not yet scaffolded** — explicitly out of scope until a later phase; do not create `apps/mobile` unless the user asks.

When it lands, mobile must support: auth session, board list, board viewing, card detail, card create/update, notification center, push notification deep links, cache persistence where useful. Do not prioritize mobile drag-drop in the first implementation — prefer a "move to list" picker.

## Attachments

Use MinIO as self-hosted S3-compatible storage.

Flow: API validates permission + requested file metadata → API creates a presigned upload URL → client uploads directly to MinIO → API persists attachment metadata (`attachments` table) → worker handles thumbnail/preview or scanning if needed.

## Search

Start with PostgreSQL full-text search. Use the denormalized `search_documents` table (already in the schema); the `tsvector` column + GIN index + maintenance trigger are added in a dedicated migration during the search phase. Move to self-hosted Meilisearch when typo tolerance / instant search / facets / ranking / load demand it. Do not start with OpenSearch/Elasticsearch unless the user explicitly requires heavy search analytics.

## Deployment

Deploy self-hosted with Dokploy. Treat these as separate services: web (Next.js container), api (Hono Node container), worker (background jobs), postgres, redis, minio, meilisearch (later). API and worker may share an image with different commands, but run as separate processes. Define backup/volume strategy for PostgreSQL, Redis persistence, MinIO, and Meilisearch before production. Local infra: `docker-compose.yml` at the repo root (`pnpm infra:up`).

## Environment Variables

Validate runtime env with Zod (each app has `src/env.ts`; `@pusula/db` validates `DATABASE_URL`). The repo root `.env` (copy from `env.example`) feeds docker compose + the db tooling; apps load it best-effort in dev. Web reads `NEXT_PUBLIC_API_URL` from `apps/web/.env.local` (defaults to `http://localhost:3001` in code). Expected keys include:

```txt
DATABASE_URL  REDIS_URL  AUTH_SECRET  APP_URL  API_URL  API_PORT  WEB_PORT
NEXT_PUBLIC_API_URL  EXPO_PUBLIC_API_URL  EXPO_ACCESS_TOKEN  SENTRY_DSN
S3_ENDPOINT  S3_REGION  S3_BUCKET  S3_ACCESS_KEY_ID  S3_SECRET_ACCESS_KEY
RESEND_API_KEY  EMAIL_FROM  MEILISEARCH_URL  MEILISEARCH_API_KEY
```

Keep secrets server-side only. Use explicit public env prefixes (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`) only where client exposure is intended.

## Testing Requirements

Use Vitest (domain/unit), React Testing Library (component behavior), Playwright (web e2e + drag-drop), integration tests for tRPC procedures and DB transactions.

Always test: permission edge cases, position/ranking calculations, optimistic rollback, realtime reconciliation, notification outbox generation, duplicate mutation/idempotency behavior, drag-drop same-list and cross-list moves.

## Workflow Sync Requirements

- Before non-trivial development, create or reuse a Linear MCP issue and mirror it in `docs/process/05-is-kayit-defteri.md`.
- Start from `docs/process/00-calisma-baslangic-rehberi.md` for task selection and source priority; use `docs/process/03-faz-0-devir-notu.md` only as Phase 0 historical handoff context.
- Keep status values in sync across Linear and the work register: `Todo`, `In Progress`, `Blocked`, `Review`, `Done`, `Canceled`.
- If Linear MCP is not reachable, record `MCP bekliyor` in the work register and state the sync debt in the final response.
- Update affected `docs/architecture/*`, `docs/domain/*`, or `docs/process/*` before code when the task changes decisions, rules, schemas, procedures, or workflow.
- For Markdown changes, preserve the Obsidian vault standard: frontmatter, tags, aliases, parent/related links, `updated`, and parent MOC entries.
- At closeout, comment on the Linear issue with summary, updated docs, verification result, and follow-up risk; then update the work register in the same status.

## Avoid

- Splitting the main API contract between tRPC and another primary RPC system.
- Storing list/card ordering as simple contiguous integers.
- Sending backend mutations while dragging.
- Publishing realtime events without a DB-backed recovery/refetch story.
- Sending push/email directly in request handlers.
- Adding a second web component library besides shadcn/ui.
- Putting auth provider concerns inside domain permission logic.
- Making one huge board query that carries every card detail, comment, attachment, and activity.
- Treating Socket.IO as an alternative to push notifications.
- Adding billing/subscription implementation.
- Scaffolding `apps/mobile` before the user asks.
- Mixing design/technical rules with business/domain rules in the same doc — design rule → `docs/architecture/`, business rule → `docs/domain/`, process → `docs/process/`.
- Creating orphan Markdown docs that are missing frontmatter, tags, parent links, or MOC/README entries.
- Duplicating domain rules into `apps/*` / `packages/api` / `packages/db` — the source is `@pusula/domain`.
- Using a package manager other than `pnpm` (no npm/yarn/bun/npx).

## Implementation Order

Default start guide: `docs/process/00-calisma-baslangic-rehberi.md`. Source of truth for phase status: `docs/process/02-mvp-faz-plani.md`. Source for task-level workflow sync: `docs/process/04-otomatik-is-akisi-protokolu.md` + `docs/process/05-is-kayit-defteri.md`. Phase 0 (monorepo, packages, web/api/worker skeletons, Drizzle schema, Better Auth wiring, docker-compose) is **done**. Continue:

1. ✅ Monorepo, tooling, local Docker Compose for PostgreSQL/Redis/MinIO.
2. Better Auth sign-in/up/out flows, session handling, workspace model + member model, permission helpers wired into procedures.
3. Board/list/card CRUD via tRPC + Drizzle.
4. Pragmatic Drag and Drop for web board interactions.
5. TanStack Query optimistic mutations and rollback.
6. Socket.IO board rooms, user rooms, event envelope, reconciliation.
7. Activity events, notification outbox, worker processors, in-app notifications.
8. Expo mobile basics and push notifications.
9. PostgreSQL full-text search and MinIO attachments.
10. Dokploy deployment hardening, observability, backups, e2e coverage.
