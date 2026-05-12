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
updated: 2026-05-12
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
