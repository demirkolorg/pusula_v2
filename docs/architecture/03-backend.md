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

### Faz 2 — board / list / card procedure'leri

> Faz 2 = **statik CRUD** (create sona ekler, alan günceller, arşivler). `move`/reorder ve drag-drop **Faz 3** kapsamı ([DEM-26](https://linear.app/demirkol/issue/DEM-26) — [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.1); optimistic UI **Faz 4** ([DEM-27](https://linear.app/demirkol/issue/DEM-27)); realtime yayın **Faz 5** ([DEM-28](https://linear.app/demirkol/issue/DEM-28)); bildirim outbox **Faz 6** ([DEM-29](https://linear.app/demirkol/issue/DEM-29)). Procedure → rol haritası: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / List / Card procedure haritası).

| Router | Procedure | Middleware | Not |
| --- | --- | --- | --- |
| `board` | `list` | `workspaceProcedure` | Kullanıcının erişebildiği board'lar (workspace owner/admin tüm board'lar; guest yalnızca davetli) |
| `board` | `create` | `workspaceProcedure` | workspace `member+`; oluşturan board `admin` üye olur; `activity_events` (`board.created`) |
| `board` | `get` | `boardProcedure` | Board + listeleri + kartları (board ekranının ilk yükü) |
| `board` | `update` | `boardProcedure` | board `admin`; başlık vb.; `activity_events` (`board.updated`) |
| `board` | `archive` | `boardProcedure` | board `admin`; `archived_at`; arşivli board salt-okunur; `activity_events` (`board.archived`) |
| `list` | `create` | `boardProcedure` | board `member+`; board sonuna `position` (`@pusula/domain/position`); `activity_events` (`list.created`) |
| `list` | `update` | `boardProcedure` | board `member+`; yeniden adlandırma; `activity_events` (`list.updated`) |
| `list` | `archive` | `boardProcedure` | board `member+`; `archived_at`; arşivli liste aktif kart almaz; `activity_events` (`list.archived`) |
| `card` | `create` | `boardProcedure` (+ listeyi doğrula) | board `member+`; liste sonuna `position`; kart `board_id` = listenin board'u; arşivli listeye eklenemez; `activity_events` (`card.created`) |
| `card` | `get` | `cardProcedure` | Kart detayı |
| `card` | `update` | `cardProcedure` | board `member+`; başlık/açıklama/`due_at`; `activity_events` (`card.updated`) |
| `card` | `archive` | `cardProcedure` | board `member+`; `archived_at`; `activity_events` (`card.archived`) |

Faz 2 dışı (ileri faz): `list.move` / `card.move` (`moveCardInput` — Faz 3); `board.members.*`, `label.*`, `card.members.*`, `checklist.*`, `comment.*`, `attachment.*` (ilgili fazlar). Tüm mutation procedure'leri yukarıdaki **mutation iskeleti**ni izler — Faz 2'de transaction yalnızca `domain mutasyonu + activity_events insert` içerir; `realtime_events` / `notification_outbox` insert'leri Faz 5/6'da devreye girer. Yeni `board.*` / `list.*` / `card.*` activity tipleri `ACTIVITY_EVENT_TYPES`'a eklenir (bkz. [`../domain/05-aktivite-kurallari.md`](../domain/05-aktivite-kurallari.md)).

## Worker (background job)

`apps/worker` ayrı uygulama (API ile aynı image, farklı command olabilir; ama ayrı process):
notification processor, outbox processor, due-date scheduler, digest email job, cleanup jobs,
position compaction jobs. Queue: BullMQ + Redis.

API request içinde **yapılmaz**: push gönderimi, email gönderimi, ağır activity aggregation,
digest üretimi, uzun süren attachment processing.
