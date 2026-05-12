---
title: "03 — Backend"
description: "Hono HTTP kabuğu, tRPC sözleşmesi ve worker sorumlulukları."
aliases:
  - "Backend"
  - "Hono tRPC Worker"
tags:
  - "pusula"
  - "architecture/backend"
  - "backend"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 03 — Backend (Hono + tRPC + Worker)

> Eksen: **tasarım / teknik**. Yetkilendirme **kuralları** (kim ne yapabilir) için
> [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md); enforcement noktası burada/[`07-auth.md`](07-auth.md).

## İki ana parça

- `apps/api` (`@pusula/api-server`): HTTP server, tRPC endpoint, webhook, Better Auth callback, healthcheck, metrics, Socket.IO.
- `apps/worker` (`@pusula/worker`): Bildirim, outbox, scheduled job, retry, background task. Bkz. [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md), [`10-platform.md`](10-platform.md).

## Akış

```txt
Client → tRPC client → Hono server → tRPC router → service/domain layer → Drizzle transaction → PostgreSQL
```

## Hono'nun işi (HTTP concerns)

CORS · request id · logging · rate limiting · auth context hazırlığı · webhook endpoint'leri ·
healthcheck · metrics endpoint'leri · tRPC handler mount · Better Auth (`${API_URL}/api/auth/*`) ·
Socket.IO mount. Hono burada **kabuk**tur; iş mantığı taşımaz.

## tRPC'nin işi (API sözleşmesi)

Type-safe query & mutation · client-side inference · web + mobil ortak sözleşme ·
procedure-level auth & permission · TanStack Query entegrasyonu.

- tRPC paketi: `@pusula/api` (`packages/api`) — root router, board/list/card/comment/notification router'ları, auth context, rate-limit & permission middleware'leri.
- `protectedProcedure` (in `@pusula/api`) non-null session garantiler; üzerine workspace → board → card/list permission kontrollerini katmanla.
- **Hono RPC ile tRPC aynı anda ana API sözleşmesi yapılmaz.** Source of truth tek: tRPC.

### Bir mutation procedure'ün iskeleti

```txt
protectedProcedure (session check)
  → workspace access kontrolü
  → board access kontrolü
  → card/list permission kontrolü
  → input validasyonu (Zod, @pusula/domain)
  → Drizzle transaction:
      - domain mutasyonu
      - activity_events insert
      - realtime_events insert
      - notification_outbox insert
  → sonuç (clientMutationId ile reconcile için)
```

Permission kontrolü her procedure'de **server-side**; frontend state'e güvenilmez. Realtime room
erişimi de server-side board/workspace permission'dan türetilir.

### Scoped procedure middleware'leri

Yukarıdaki zincir (`session → workspace → board → card/list`) her procedure'de elle tekrarlanmaz;
katmanlı procedure tipleriyle DRY tutulur. Permission **kuralları** (kim ne yapabilir) `@pusula/domain`
ve [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)'da kalır; bu
middleware'ler yalnızca **enforcement** noktasıdır — "üye mi?" kapısını açar, ince yetki kontrolünü
(`canManageWorkspace`, `canEditBoardContent`, …) procedure gövdesi yapar.

- `workspaceProcedure` = `protectedProcedure` + `workspaceId`'yi input'tan okuyup kullanıcının `workspace_members` kaydını çözen middleware. Workspace yoksa `NOT_FOUND`, üyelik yoksa `FORBIDDEN`; varsa `ctx.workspace = { id, role }` eklenir. (Faz 1)
- `boardProcedure` = board'u çözer ve `effectiveBoardRole` sonucunu (workspace + board üyeliğinden, `@pusula/domain/permissions`) hesaplar; `ctx.board = { id, workspaceId, role }` ekler. (Faz 2)
- `cardProcedure` = board context + kullanıcının kart ilişkisi (`assignee`/`watcher`); `ctx.card` ekler. (İlgili faz)

`@pusula/api` içindeki `permission middleware`'leri bu katmanı uygular; rate-limit middleware'i de aynı
zincirde yer alır (bkz. [`10-platform.md`](10-platform.md)).

## Worker (background job)

`apps/worker` ayrı uygulama (API ile aynı image, farklı command olabilir; ama ayrı process):
notification processor, outbox processor, due-date scheduler, digest email job, cleanup jobs,
position compaction jobs. Queue: BullMQ + Redis.

API request içinde **yapılmaz**: push gönderimi, email gönderimi, ağır activity aggregation,
digest üretimi, uzun süren attachment processing.
