---
title: "06 — Bildirim Altyapısı"
description: "Outbox, worker, push ve email teslim mimarisi."
aliases:
  - "Bildirim Altyapısı"
  - "Outbox Worker"
tags:
  - "pusula"
  - "architecture/notifications"
  - "worker"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-13
---
# 06 — Bildirim Altyapısı (Outbox + Worker)

> Eksen: **tasarım / teknik** — bildirimin _mekanizması_ (outbox, worker, teslim). Hangi event
> hangi bildirimi üretir, mute seviyeleri, tercih kapsamı = **iş kuralı** → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md).

## İlke

Bildirim sistemi ürünün merkezindedir: in-app notification, realtime badge, mobile push (Expo),
email (Resend), ileride Slack/Teams (yalnızca açıkça istenirse). Push ve email **asla** API
request döngüsü içinde gönderilmez.

## Outbox akışı

```txt
domain event (transaction içinde)
  → activity_events insert
  → notification_outbox insert
worker
  → notifications tablosu insert
  → socket badge update (Socket.IO)
  → Expo push (gerekiyorsa)
  → Resend email (gerekiyorsa)
```

`notification_outbox` tablosu (`@pusula/worker` tüketir): `id, event_id, channel, recipient_id,
payload, status, attempts, scheduled_at, processed_at, created_at`.

Neden outbox zorunlu: DB update başarılı ama bildirim başarısız olabilir; push provider geçici
hata verebilir; retry + dead-letter ihtiyacı var; aynı event'ten duplicate bildirim üretmemek
gerekir (idempotency — `event_id` üzerinden).

## Push tarafı

- Expo Notifications; push token cihaz bazlı saklanır (`push_tokens`).
- Kullanıcı logout olunca token pasifleştirilir.
- Push doğrudan API request içinde gönderilmez; worker üzerinden retry edilebilir şekilde.
- Deep link ile kart açma: payload mobil tarafın çözebileceği route bilgisini taşır (bkz. [`08-web-ve-mobil.md`](08-web-ve-mobil.md)).

## Email tarafı

- Resend; transactional email + ileride digest.
- Digest üretimi ve gönderimi worker job'u; request-path'te değil.

## Worker job'ları (özet)

notification outbox tüketme · Expo push gönderme · email gönderme · realtime event publish ·
due-date reminder üretme · failed job retry · dead-letter job kaydı · board/list/card position
compaction. Queue: BullMQ + Redis. Bkz. [`10-platform.md`](10-platform.md).

## Position compaction (Faz 3C — [DEM-44](https://linear.app/demirkol/issue/DEM-44))

Fractional `position` string'leri ardışık taşımalarla uzar (`a4 → a44 → a444 …`). Bir liste/board için pozisyonlar belirli bir uzunluğu aştığında **background compaction**: o kapsamın satırları sırayı koruyarak `positionsBetween(null, null, n)` ile kısa, eşit aralıklı pozisyonlara yeniden yazılır. Sıralamanın iş anlamı + tetik kuralı → [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md) "Compaction".

- **Queue:** `pusula-compaction` (BullMQ, [`apps/worker`](10-platform.md) — `QUEUE.compaction`); `notification_outbox`'tan bağımsız ayrı kuyruk. BullMQ kuyruk adında `:` kabul etmez (Redis anahtar ayıracı) — tüm `pusula-*` kuyruk adları `-` ayraçlı; `jobId` (`compaction:{list|board}:{id}`) `:` taşıyabilir.
- **Tetik (enqueue):** `list.move` / `card.move` (Faz 3A — [`03-backend.md`](03-backend.md)) bir hareket sonucu **uzun** bir `position` ürettiğinde — üretilen herhangi bir key uzunluğu `POSITION_COMPACTION_MAX_LEN` (öneri default **50** karakter; `@pusula/domain` sabiti — `shouldCompact(positions)` helper'ı; gerekirse ileride env'e taşınır) ≥ ise — ilgili scope için job enqueue edilir (`apps/api` boot'unda kurulan ve tRPC context'ine inject edilen queue ile; transaction commit'inden sonra, request'i bloklamadan — `void enqueue(...)`; **best-effort** — Redis hatası response'u düşürmez, sadece loglanır). Job `jobId = compaction:{list|board}:{id}` ile **debounce**: aynı scope için bekleyen job varken tekrar enqueue no-op. Testlerde context'e queue inject edilmez → enqueue no-op. İkincil/periyodik tetik (scope satır sayısı çok büyürse) ileri faz — şimdilik yalnız move-tetikli.
- **Job payload:** `{ scope: { kind: 'list', listId } | { kind: 'board', boardId } }` — `list` → o listedeki kartlar (aktif **ve** arşivli — pozisyon tek sıralı dizi), `board` → o board'un listeleri.
- **Job davranışı:** kısa transaction; scope satırlarını `position` artan oku; ≤1 satırsa no-op; `positionsBetween(null, null, n)` ile yeni pozisyonlar; satır sırası **korunur**; her satırın `position`'ı güncellenir; `boards.version + 1` (client stale pozisyonları yenilesin — Faz 5+ realtime ile de reconcile). **`activity_events` üretmez** (salt teknik bakım — kullanıcıya görünmez). Eşzamanlı `move` ile yarış: scope üzerinde `pg_advisory_xact_lock` (`hashtext(scopeId)`) — job ile move sıraya girer; her ikisi de tutarlı kalır (sonuç her durumda geçerli bir toplam sıralama). Idempotent: job tekrar çalışırsa aynı kompakt pozisyonları üretir; başarısız job BullMQ retry/backoff (queue defaults) + dead-letter.
- **Faz kapsamı:** Faz 3A move procedure'leri enqueue çağrısını içerir (DEM-42'deki `// TODO(DEM-44)` stub'ı bu fazda gerçek enqueue ile değişir); Faz 3C job'un kendisi + queue + worker processor + `@pusula/domain` eşik sabiti/helper'ı + (gerekiyorsa) `apps/worker` test harness'ı. Compaction sonrası realtime publish Faz 5'e ertelenir — şimdilik `boards.version` bump + client'ın bir sonraki `board.get` refetch'i yeterli. Etkilenen katmanlar: `apps/worker`, `packages/domain`, `packages/api` (enqueue), `apps/api` (queue boot + context inject), (gerekirse) `packages/db`.

## Realtime event yayın katmanı (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28))

Board/list/card mutation'larından gelen collaborative event'lerin **outbox pattern** ile Socket.IO server'a yayını. **Karar (2026-05-13):** worker queue + `realtime_events` outbox tablosu — direct in-process emit **değil** ([`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı). Gerekçe: replay garantisi (Redis blip / API restart) + Faz 6 `notification_outbox` ile simetri + audit trail. Event envelope + reconciliation → [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.3; tablo şeması → [`04-veri-katmani.md`](04-veri-katmani.md) (`realtime_events`); Socket.IO server → [`03-backend.md`](03-backend.md) "Faz 5 — Socket.IO server".

> **Wired (2026-05-13 — Faz 5B / [DEM-84](https://linear.app/demirkol/issue/DEM-84)):** Bu katman canlı. Mutation tx içinde `realtime_events` insert helper'ı `packages/api/src/lib/realtime-publish.ts` (`insertRealtimeEvent`). Producer `apps/api/src/realtime-publish-queue.ts` (BullMQ `pusula-realtime-publish`, `jobId = publish:{eventId}` debounce). Worker processor `apps/worker/src/jobs/realtime-publish.ts` (`FOR UPDATE SKIP LOCKED` + envelope + Redis pub/sub `pusula:realtime:envelope`); sweeper `apps/worker/src/jobs/realtime-publish-sweeper.ts` (60s repeatable, 30s grace). API bridge `apps/api/src/socket/realtime-bridge.ts` (subscriber → `io.local.to(room).emit('realtime:event', envelope)` — `.local` Redis adapter cross-node relay'ini bypass ediyor; her replica kendi locally connected client'larına gönderdiği için multi-instance'ta her client tek mesaj alır). Migration `0008_aromatic_leo`: partial pending index (`WHERE published_at IS NULL`) + retention index. 14 mutation outbox üretiyor (list × 4 + board × 2 + card × 8 — idempotent no-op dallarında atlanıyor). Vitest packages/api 163/163 + apps/worker 13/13 PASS.

- **Queue:** `pusula-realtime-publish` (BullMQ, `apps/worker` — `QUEUE.realtimePublish`); `pusula-notifications` (Faz 6) + `pusula-compaction` (Faz 3C) yanında üçüncü kuyruk. Aynı disiplin: ad ayracı `-` (BullMQ Redis anahtar ayıracı `:` reddi).
- **Tetik (enqueue):** mutation tx içinde `realtime_events` satırı INSERT (`id`, `type`, `workspaceId`, `boardId`, `cardId`, `actorUserId`, `clientMutationId`, `seq` = `boards.version`, `payload`, `createdAt`, `published_at = NULL`) → tx COMMIT → `void enqueue({ eventId })` (best-effort; Redis hatası response'u düşürmez, sadece loglanır — periyodik sweeper aşağıda yakalar). Mutation tipleri: `card.moved` · `created` · `updated` · `archived` · `completed` · `uncompleted` · `movedToList` · `copied` · `list.moved` · `created` · `updated` · `archived` · `board.updated` · `archived`.
- **Job payload:** `{ eventId }` — minimum (worker `realtime_events`'ten okur, payload'ı oradan alır). Idempotent: aynı `eventId` iki kez işlenebilir, worker `published_at IS NULL` kontrolüyle skip eder.
- **Worker job davranışı (`apps/worker/src/jobs/realtime-publish.ts`):**
  1. `realtime_events` satırını oku (`SELECT ... WHERE id = $1 AND published_at IS NULL FOR UPDATE SKIP LOCKED`).
  2. Yoksa (zaten publish edilmiş veya silinmiş) → job tamamlandı işaretle, return.
  3. Envelope hazırla (`RealtimeEventEnvelope` Zod şeması, `@pusula/domain/events`).
  4. Socket.IO server'a publish: `apps/api` Redis pub/sub kanalı üzerinden (Socket.IO Redis adapter zaten cross-instance pub/sub kullanıyor — worker da aynı kanala publish eder; veya worker doğrudan `apps/api`'ye HTTP webhook çağırır — 5.0/5B turunda netleşir). **Önerilen:** Redis pub/sub (worker ek HTTP route gerektirmez; tek round-trip).
  5. Başarılı → `UPDATE realtime_events SET published_at = NOW() WHERE id = $1`.
  6. Hata (Redis down, socket cluster offline) → BullMQ retry/backoff (3 attempt, exponential); 3 fail sonrası dead-letter; periyodik sweeper devralır.
- **Periyodik sweeper (`pusula-realtime-publish-sweeper`):** `published_at IS NULL AND created_at < NOW() - INTERVAL '30 seconds'` satırları yeniden enqueue eder (60s aralıklı cron). Garanti: hiçbir event 90s'ten fazla yayılmamış kalmaz.
- **Retention:** `realtime_events.published_at IS NOT NULL AND created_at < NOW() - INTERVAL '7 days'` satırları periyodik cleanup job ile silinir (7 gün audit/debug window'u). Sonraki tur — Faz 8 sertleştirme.
- **Faz kapsamı:** Faz 5B ([DEM-84](https://linear.app/demirkol/issue/DEM-84)) `realtime_events` insert (mutation gövdelerinde) + producer enqueue + worker processor + envelope üretimi. Faz 5A ([DEM-83](https://linear.app/demirkol/issue/DEM-83)) Socket.IO server + emit helper'ları + Redis pub/sub kanalı. Etkilenen katmanlar: `apps/worker` (processor + sweeper), `packages/api` (mutation gövdesinde outbox insert + enqueue), `apps/api` (queue boot + context inject + Socket.IO server), `packages/db` (`realtime_events` Drizzle şeması — migration), `packages/domain` (envelope tipi + helper'lar).
- **Kapsam dışı:** comment / mention / due reminder event'leri → Faz 6 (notification kanalı + outbox); presence event'leri → Faz 6/7 (özel taşıma — outbox'a yazmaz, in-memory).
