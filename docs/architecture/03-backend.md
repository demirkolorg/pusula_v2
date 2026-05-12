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

## Worker (background job)

`apps/worker` ayrı uygulama (API ile aynı image, farklı command olabilir; ama ayrı process):
notification processor, outbox processor, due-date scheduler, digest email job, cleanup jobs,
position compaction jobs. Queue: BullMQ + Redis.

API request içinde **yapılmaz**: push gönderimi, email gönderimi, ağır activity aggregation,
digest üretimi, uzun süren attachment processing.
