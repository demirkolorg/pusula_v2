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

- **Queue:** `pusula:compaction` (BullMQ, [`apps/worker`](10-platform.md) — `QUEUE.compaction`); `notification_outbox`'tan bağımsız ayrı kuyruk.
- **Tetik (enqueue):** `list.move` / `card.move` (Faz 3A — [`03-backend.md`](03-backend.md)) bir hareket sonucu **uzun** bir `position` ürettiğinde — üretilen herhangi bir key uzunluğu `POSITION_COMPACTION_MAX_LEN` (öneri default **50** karakter; `@pusula/domain` sabiti — `shouldCompact(positions)` helper'ı; gerekirse ileride env'e taşınır) ≥ ise — ilgili scope için job enqueue edilir (`apps/api` boot'unda kurulan ve tRPC context'ine inject edilen queue ile; transaction commit'inden sonra, request'i bloklamadan — `void enqueue(...)`; **best-effort** — Redis hatası response'u düşürmez, sadece loglanır). Job `jobId = compaction:{list|board}:{id}` ile **debounce**: aynı scope için bekleyen job varken tekrar enqueue no-op. Testlerde context'e queue inject edilmez → enqueue no-op. İkincil/periyodik tetik (scope satır sayısı çok büyürse) ileri faz — şimdilik yalnız move-tetikli.
- **Job payload:** `{ scope: { kind: 'list', listId } | { kind: 'board', boardId } }` — `list` → o listedeki kartlar (aktif **ve** arşivli — pozisyon tek sıralı dizi), `board` → o board'un listeleri.
- **Job davranışı:** kısa transaction; scope satırlarını `position` artan oku; ≤1 satırsa no-op; `positionsBetween(null, null, n)` ile yeni pozisyonlar; satır sırası **korunur**; her satırın `position`'ı güncellenir; `boards.version + 1` (client stale pozisyonları yenilesin — Faz 5+ realtime ile de reconcile). **`activity_events` üretmez** (salt teknik bakım — kullanıcıya görünmez). Eşzamanlı `move` ile yarış: scope üzerinde `pg_advisory_xact_lock` (`hashtext(scopeId)`) — job ile move sıraya girer; her ikisi de tutarlı kalır (sonuç her durumda geçerli bir toplam sıralama). Idempotent: job tekrar çalışırsa aynı kompakt pozisyonları üretir; başarısız job BullMQ retry/backoff (queue defaults) + dead-letter.
- **Faz kapsamı:** Faz 3A move procedure'leri enqueue çağrısını içerir (DEM-42'deki `// TODO(DEM-44)` stub'ı bu fazda gerçek enqueue ile değişir); Faz 3C job'un kendisi + queue + worker processor + `@pusula/domain` eşik sabiti/helper'ı + (gerekiyorsa) `apps/worker` test harness'ı. Compaction sonrası realtime publish Faz 5'e ertelenir — şimdilik `boards.version` bump + client'ın bir sonraki `board.get` refetch'i yeterli. Etkilenen katmanlar: `apps/worker`, `packages/domain`, `packages/api` (enqueue), `apps/api` (queue boot + context inject), (gerekirse) `packages/db`.
