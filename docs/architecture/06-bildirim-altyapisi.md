---
title: '06 — Bildirim Altyapısı'
description: 'Outbox, worker, push ve email teslim mimarisi.'
aliases:
  - 'Bildirim Altyapısı'
  - 'Outbox Worker'
tags:
  - 'pusula'
  - 'architecture/notifications'
  - 'worker'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-15
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

- **Queue:** `pusula-compaction` (BullMQ, [`apps/worker`](10-platform.md) — `QUEUE.compaction`); `notification_outbox`'tan bağımsız ayrı kuyruk. BullMQ kuyruk adında ve custom job id'de `:` kabul etmez (Redis anahtar ayıracı) — tüm `pusula-*` kuyruk adları ve job id prefix'leri `-` ayraçlı; advisory lock key'i (`compaction:{list|board}:{id}`) DB içinde kalır.
- **Tetik (enqueue):** `list.move` / `card.move` (Faz 3A — [`03-backend.md`](03-backend.md)) bir hareket sonucu **uzun** bir `position` ürettiğinde — üretilen herhangi bir key uzunluğu `POSITION_COMPACTION_MAX_LEN` (öneri default **50** karakter; `@pusula/domain` sabiti — `shouldCompact(positions)` helper'ı; gerekirse ileride env'e taşınır) ≥ ise — ilgili scope için job enqueue edilir (`apps/api` boot'unda kurulan ve tRPC context'ine inject edilen queue ile; transaction commit'inden sonra, request'i bloklamadan — `void enqueue(...)`; **best-effort** — Redis hatası response'u düşürmez, sadece loglanır). Job `jobId = compaction-{list|board}-{id}` ile **debounce**: aynı scope için bekleyen job varken tekrar enqueue no-op. Testlerde context'e queue inject edilmez → enqueue no-op. İkincil/periyodik tetik (scope satır sayısı çok büyürse) ileri faz — şimdilik yalnız move-tetikli.
- **Job payload:** `{ scope: { kind: 'list', listId } | { kind: 'board', boardId } }` — `list` → o listedeki kartlar (aktif **ve** arşivli — pozisyon tek sıralı dizi), `board` → o board'un listeleri.
- **Job davranışı:** kısa transaction; scope satırlarını `position` artan oku; ≤1 satırsa no-op; `positionsBetween(null, null, n)` ile yeni pozisyonlar; satır sırası **korunur**; her satırın `position`'ı güncellenir; `boards.version + 1` (client stale pozisyonları yenilesin — Faz 5+ realtime ile de reconcile). **`activity_events` üretmez** (salt teknik bakım — kullanıcıya görünmez). Eşzamanlı `move` ile yarış: scope üzerinde `pg_advisory_xact_lock` (`hashtext(scopeId)`) — job ile move sıraya girer; her ikisi de tutarlı kalır (sonuç her durumda geçerli bir toplam sıralama). Idempotent: job tekrar çalışırsa aynı kompakt pozisyonları üretir; başarısız job BullMQ retry/backoff (queue defaults) + dead-letter.
- **Faz kapsamı:** Faz 3A move procedure'leri enqueue çağrısını içerir (DEM-42'deki `// TODO(DEM-44)` stub'ı bu fazda gerçek enqueue ile değişir); Faz 3C job'un kendisi + queue + worker processor + `@pusula/domain` eşik sabiti/helper'ı + (gerekiyorsa) `apps/worker` test harness'ı. Compaction sonrası realtime publish Faz 5'e ertelenir — şimdilik `boards.version` bump + client'ın bir sonraki `board.get` refetch'i yeterli. Etkilenen katmanlar: `apps/worker`, `packages/domain`, `packages/api` (enqueue), `apps/api` (queue boot + context inject), (gerekirse) `packages/db`.

## Realtime event yayın katmanı (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28))

Board/list/card mutation'larından gelen collaborative event'lerin **outbox pattern** ile Socket.IO server'a yayını. **Karar (2026-05-13):** worker queue + `realtime_events` outbox tablosu — direct in-process emit **değil** ([`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı). Gerekçe: replay garantisi (Redis blip / API restart) + Faz 6 `notification_outbox` ile simetri + audit trail. Event envelope + reconciliation → [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.3; tablo şeması → [`04-veri-katmani.md`](04-veri-katmani.md) (`realtime_events`); Socket.IO server → [`03-backend.md`](03-backend.md) "Faz 5 — Socket.IO server".

> **Wired (2026-05-13 — Faz 5B / [DEM-84](https://linear.app/demirkol/issue/DEM-84)):** Bu katman canlı. Mutation tx içinde `realtime_events` insert helper'ı `packages/api/src/lib/realtime-publish.ts` (`insertRealtimeEvent`). Producer `apps/api/src/realtime-publish-queue.ts` (BullMQ `pusula-realtime-publish`, `jobId = publish-{eventId}` debounce; `:` kullanılmaz çünkü BullMQ custom job id içinde Redis ayırıcısını reddeder). Worker processor `apps/worker/src/jobs/realtime-publish.ts` (`FOR UPDATE SKIP LOCKED` + envelope + Redis pub/sub `pusula:realtime:envelope`); sweeper `apps/worker/src/jobs/realtime-publish-sweeper.ts` (60s repeatable, 30s grace). API bridge `apps/api/src/socket/realtime-bridge.ts` (subscriber → `io.local.to(room).emit('realtime:event', envelope)` — `.local` Redis adapter cross-node relay'ini bypass ediyor; her replica kendi locally connected client'larına gönderdiği için multi-instance'ta her client tek mesaj alır). Migration `0008_aromatic_leo`: partial pending index (`WHERE published_at IS NULL`) + retention index. 14 mutation outbox üretiyor (list × 4 + board × 2 + card × 8 — idempotent no-op dallarında atlanıyor). Vitest packages/api 163/163 + apps/worker 13/13 PASS.

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

## Notification processor (Faz 6 — [DEM-29](https://linear.app/demirkol/issue/DEM-29))

Activity event'lerinden bildirim üretimi + worker processor + kanal fan-out. **Karar (2026-05-13):** Faz 5 `realtime_events` outbox pattern'iyle simetrik — mutation tx içinde `notification_outbox` insert (kural-tabanlı; `notification-rules.ts` recipient + kanal hesabı yapar) → worker tüketir → in-app/email/push kanallarına fan-out. Domain kuralları (kim ne için bildirim alır) → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md); tablo şemaları → [`04-veri-katmani.md`](04-veri-katmani.md) (`notifications` + `notification_outbox` + `notification_preferences`).

> **Wired (2026-05-13 — Faz 6A / [DEM-90](https://linear.app/demirkol/issue/DEM-90)):** Bu katman canlı. Rule engine `packages/api/src/lib/notification-rules.ts` (activity → recipient × channel, actor self-skip + permission filter + role merge + mute-bypass + narrowest-scope-wins preference lookup). Outbox helper `packages/api/src/lib/notification-outbox.ts` (60 s cooldown — `ne(eventId, current)` ile multi-channel fan-out korunur; bypass tipleri `mention`/`*_invitation`/`due_*`). Dispatcher `dispatchNotificationsForActivity(tx, activityEvent)` 10 mutation gövdesinde çağrılıyor (card.member.add · comment.create · card.update due · card.complete/uncomplete/archive/move (cross-list)/moveToList · checklist.item.toggle (checked) · board.members.add direct). Producer `apps/api/src/notification-queue.ts` (BullMQ `pusula-notifications`, `jobId notify-{eventId}` debounce, best-effort; `:` kullanılmaz). Worker processor `apps/worker/src/jobs/notification-publish.ts` (`FOR UPDATE SKIP LOCKED` + post-commit Redis pub/sub `pusula:notifications:user`); sweeper `notification-publish-sweeper.ts` (60 s repeatable, 30 s grace, `DISTINCT event_id`). Migration `0009_glorious_mercury` (partial unread + cooldown composite + partial pending) + `0011_eager_punisher` (UNIQUE partial scheduler dedupe `(payload->>'dedupeKey') WHERE event_id IS NULL`). tRPC `notifications.list`/`markRead`/`markAllRead`/`unreadCount` (cursor pagination + single-statement markRead). Vitest 16 yeni (rules 6 · outbox 3 · router 7) + worker 6 yeni (publish 3 · scheduler 3). Commit `5df3bd5`.

> **Wired (2026-05-14 — Faz 6C / [DEM-92](https://linear.app/demirkol/issue/DEM-92)):** Mention zinciri canlı: `comment.create` → `packages/api/src/lib/mention-parser.ts` → `activity_events.type='comment.mentioned'` (migration `0012_groovy_freak`) → `notification-rules.ts` mention recipient hesabı → 6A `notification_outbox` → in-app processor → `emitToUser(notification.created)`. Parser `users.name` üzerinden `@username` eşleştirir, board/workspace erişimi olmayan kullanıcıları sessiz atlar ve aynı yorumdaki tekrarları dedupe eder.

- **Queue:** `pusula-notifications` (BullMQ, `apps/worker` — `QUEUE.notifications`); `pusula-notifications-email` + `pusula-notifications-push` (Faz 6B kanal kuyrukları — ad ayracı `-`); `pusula-realtime-publish` (Faz 5) + `pusula-compaction` (Faz 3C) yanında.
- **Notification kuralları (`packages/api/src/lib/notification-rules.ts`):** activity event tipine göre recipient(s) + kanal(lar) hesabı (pure function). Input: `{ activityEvent, actor, board, card?, list? }`; output: `Array<{ recipientUserId, type, channels: ['in_app' | 'email' | 'push'], payload }>`. Actor self-skip + permission check (board erişimi olmayan recipient atlanır) + role merge (assignee+watcher tek satır). Detay → `04-bildirim-kurallari.md` "Bildirim kaynakları" tablosu.
- **Cooldown 60s:** insert öncesi son 60s'de aynı `(recipient_id, type)` `notification_outbox` satırı varsa yeni satır eklenmez. İstisnalar: `comment.mentioned` (mute-bypass + her mention önemli), `*_invited` (her davet ayrı token), `due_reminder_*` (scheduler zaten dedupe yapıyor).
- **Tetik (enqueue):** mutation tx içinde `activity_events` insert'in yanına notification-rules sonucu için her recipient için `notification_outbox` insert (`id`, `event_id` [= activity_events.id], `recipient_id`, `type`, `channel`, `payload`, `status='pending'`, `attempts=0`, `created_at`, `processed_at=NULL`). tx COMMIT sonrası `void ctx.notifications.enqueue({ eventId })` best-effort.
- **Worker processor (`apps/worker/src/jobs/notification-publish.ts`):**
  1. `notification_outbox` satırını oku (`SELECT ... WHERE id = $1 AND processed_at IS NULL FOR UPDATE SKIP LOCKED`).
  2. Yoksa → return.
  3. Channel'a göre fan-out:
     - `in_app` → `notifications` tablosuna INSERT (`user_id`, `type`, `payload`, `read_at=NULL`) + Faz 5 `emitToUser(userId, { type: 'notification.created', payload })` (badge realtime push) → `processed_at = NOW()` + `status='sent'`.
     - `email` → `pusula-notifications-email` kuyruğuna ileri (6B processor — Resend send). 6A processor **damgalamaz**; satır `processed_at IS NULL` kalır ve email processor gerçek gönderim/skip sonrası `status='sent'` damgalar.
     - `push` → `pusula-notifications-push` kuyruğuna ileri (6B processor — Expo Push API). 6A processor **damgalamaz**; satır `processed_at IS NULL` kalır ve push processor gerçek gönderim/no-op sonrası `status='sent'` damgalar.
  4. Email/push enqueuer eksik veya geçici olarak hatalıysa satır başarılı sayılmaz: `processed_at` boş, `status='pending'`, `last_error` dolu ve `attempts+1` kalır; 60 s sweeper doğru wiring geldikten sonra yeniden enqueue eder.
  5. In-app hatası → BullMQ retry (queue default attempt/backoff); nonsensical `in_app` satırları (recipient yok) `status='dead'` ile kapatılır.
- **Periyodik sweeper (`pusula-notifications-sweeper`):** `processed_at IS NULL AND created_at < NOW() - INTERVAL '30 seconds'` satırları yeniden enqueue eder (60s aralıklı cron — Faz 5B sweeper pattern'iyle simetrik).
- **Retention:** `processed_at IS NOT NULL AND created_at < NOW() - INTERVAL '30 days'` satırları periyodik cleanup (sonraki tur / Faz 8).
- **Faz kapsamı:** Faz 6A ([DEM-90](https://linear.app/demirkol/issue/DEM-90)) `notification-rules.ts` + mutation gövdelerinde `notification_outbox` insert + worker processor + sweeper + `notifications.*` procedure'leri + due-date scheduler. Faz 6B ([DEM-91](https://linear.app/demirkol/issue/DEM-91)) email + push kanal processor'ları. Faz 6C ([DEM-92](https://linear.app/demirkol/issue/DEM-92)) mention parser + comment/checklist realtime. Faz 6D ([DEM-93](https://linear.app/demirkol/issue/DEM-93)) web notification center UI.

## Email kanalı (Resend, Faz 6B — [DEM-91](https://linear.app/demirkol/issue/DEM-91))

DEM-68 (şifre sıfırlama) auth e-postalarıyla aynı Resend kanalı; notification e-postaları transactional olarak gönderilir (digest sonraki tur).

- **Worker processor (`apps/worker/src/jobs/notification-email.ts`):**
  1. Input job: `{ outboxId }` (`pusula-notifications-email` kuyruğundan; 6A processor channel='email' için bu kuyruğa push eder).
  2. `notification_outbox` satırını oku → recipient + payload.
  3. Recipient'in e-postası `users` tablosundan çekilir (audit-safe — `email_enabled` tercih kontrolü; varsayılan açık).
  4. Template seç (notification type'ına göre — atama / mention / yorum / due / davet). HTML template `packages/email/templates/` veya inline JSX.
  5. `resend.emails.send({ from: EMAIL_FROM, to, subject, html })`.
  6. `notification_outbox.processed_at = NOW()` + `status='delivered'`.
  7. Hata (Resend rate limit / network) → BullMQ retry (3 attempt); dead-letter.
- **Template'ler (Faz 6B kapsamı):**
  - `card.member_added` → "{Actor} sizi '{cardTitle}' kartına atadı" + kart linki
  - `comment.mentioned` → "{Actor} bir yorumda sizden bahsetti" + yorum içeriği preview + kart linki
  - `comment.created` (watcher) → "{Actor} '{cardTitle}' kartında yeni bir yorum bıraktı"
  - `due_reminder_*` → "'{cardTitle}' kartının teslim tarihi yaklaşıyor" / "geçti"
  - `board.member_invited` → "{Actor} sizi '{boardName}' panosuna davet etti" + accept/decline link (token ile)
- **Env:** `RESEND_API_KEY` + `EMAIL_FROM` (zaten DEM-68'de eklendi, paylaşılır).
- **Faz kapsamı:** Faz 6B. Digest (saatlik/günlük özet) sonraki tur — Faz 8 sertleştirme.

## Push kanalı (Expo, Faz 6B — [DEM-91](https://linear.app/demirkol/issue/DEM-91))

Expo Push API üzerinden mobile push gönderimi. **Backend Faz 6'da kurulur; gerçek mobile push aktivasyonu Faz 7** ([DEM-30](https://linear.app/demirkol/issue/DEM-30)) — `apps/mobile` Expo Notifications token'ı kayıt edince processor aktif olur.

- **Push token modeli:** `push_tokens` tablosu (Faz 6B migration — [`04-veri-katmani.md`](04-veri-katmani.md)): `id, user_id, token (uniq), platform (ios/android/web), device_name?, created_at, last_used_at, revoked_at?`. Partial index `WHERE revoked_at IS NULL` (aktif token sorgusu için).
- **Token yönetimi:** tRPC `push.tokens.register({ token, platform, deviceName? })` + `push.tokens.revoke({ token })` (`protectedProcedure` — bkz. [`03-backend.md`](03-backend.md) "Faz 6 — notification & push procedure'leri"). Mobile client (Faz 7) Expo Notifications token alır → `push.tokens.register` çağırır.
- **Worker processor (`apps/worker/src/jobs/notification-push.ts`):**
  1. Input job: `{ outboxId }` (`pusula-notifications-push` kuyruğu; 6A channel='push' için push eder).
  2. `notification_outbox` satırını oku → recipient + payload.
  3. Recipient'in aktif `push_tokens` listesini çek (`WHERE user_id = ? AND revoked_at IS NULL`).
  4. Token=[] → no-op (apps/mobile yokken; log warn `push tokens empty for user X`).
  5. Token VAR → Expo Push API'ye batch request (`https://exp.host/--/api/v2/push/send`; `expo-server-sdk` Node.js client). Payload: `{ to: token, title, body, data: { type, cardId?, boardId? } }`.
  6. Response: `DeviceNotRegistered` / `InvalidCredentials` hata → `push_tokens.revoked_at = NOW()` damgalanır (audit; silinmez).
  7. `notification_outbox.processed_at = NOW()` + `status='delivered'`.
  8. Hata → BullMQ retry (3 attempt); dead-letter.
- **Deep link:** mobile tarafın çözebileceği route bilgisi payload'da (`data.type='card.member_added'`, `data.cardId='...'`). [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.2 (mobile) Faz 7'de işler.
- **Dependency:** `expo-server-sdk` (Node.js Expo Push API client) — `apps/worker` deps'e eklenir.
- **Env:** `EXPO_PUSH_ACCESS_TOKEN` opsiyonel (Expo enhanced security; ileri faz).
- **Faz kapsamı:** Faz 6B backend hazırlık (tablo + API + processor iskeleti); Faz 7 mobile token registration ile gerçek gönderim aktive olur.

## Due-date scheduler (Faz 6A — [DEM-90](https://linear.app/demirkol/issue/DEM-90))

Yaklaşan/geçmiş due tarihler için periyodik bildirim üretimi.

- **Queue:** `pusula-due-date-scheduler` (BullMQ repeatable job — cron 5dk aralıklı, `apps/worker`).
- **Sorgu:** `SELECT ... FROM cards WHERE due_at IS NOT NULL AND archived_at IS NULL AND completed = false`.
- **Reminder tipleri:**
  - `due_reminder_1d` — `due_at < NOW() + INTERVAL '24 hours' AND due_at > NOW() + INTERVAL '1 hour'` (24 saat içinde, henüz 1 saat eşiğine değil) + henüz aynı kart için bu tip notification gönderilmemiş.
  - `due_reminder_1h` — `due_at < NOW() + INTERVAL '1 hour' AND due_at > NOW()` (1 saat içinde) + henüz aynı kart için gönderilmemiş.
  - `due_overdue` — `due_at < NOW()` (geçmiş) + henüz aynı kart için gönderilmemiş.
- **Dedupe:** `notification_outbox` `WHERE event_id = card_id AND type = 'due_reminder_*'` ile aynı kart + aynı tip için 2 kez bildirim gitmez. Reminder tipleri sıralı: 1d → 1h → overdue (her tip yalnız bir kez).
- **Recipient hesabı:** Kart üyeleri (`card_members` — assignee + watcher; `notification-rules.ts`'in `due_reminder_*` kuralı).
- **Cron sıklığı:** 5dk — daha sık scheduler load'u artırır, daha seyrek precision düşer (1h reminder 5dk gecikmeli gidebilir, kabul edilebilir).
- **Faz kapsamı:** Faz 6A. Recurring task'lar (tekrarlayan kartlar) sonraki tur.

## Attachment cleanup queue (Faz 11 — kart eki)

Two-phase attachment akışının (initiate → upload → commit) **delete tetiği** ve **orphan sweep** kuyruğu. Detay akış → [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md) §9.1; iş kuralları → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md); procedure'ler → [`03-backend.md`](03-backend.md) "Faz 11 — Attachment".

- **Queue:** `pusula-attachment-cleanup` (BullMQ, `apps/worker` — `QUEUE.attachmentCleanup`); `pusula-notifications` / `pusula-realtime-publish` / `pusula-compaction` yanında. Ad ayracı `-` (Redis anahtar ayıracı `:` reddi disiplini).
- **Tetik 1 — Delete:** `attachment.delete` mutation tx COMMIT sonrası `void enqueueAttachmentCleanup({ attachmentId, storageKey })` (best-effort; Redis hatası response'u düşürmez — sweeper yedek). Job MinIO `DeleteObject({ Bucket, Key: storageKey })` çağırır; başarılıysa job tamamlandı. Idempotent: object zaten yoksa (`NoSuchKey`) success sayılır. Hata → BullMQ retry/backoff (3 attempt, exponential); dead-letter sweeper devralır.
- **Tetik 2 — Orphan sweep:** `pusula-attachment-cleanup-sweeper` (60dk repeatable cron — Faz 5B/6A sweeper pattern simetri ama daha seyrek; 1 saatlik draft window). Sorgu: `SELECT id, storage_key FROM attachments WHERE committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'`. Her satır için: önce `DeleteObject` (idempotent), sonra DB `DELETE FROM attachments WHERE id = ? AND committed_at IS NULL`. Sıralı: önce storage sonra DB — DB silme başarısız olursa job retry'da yeniden dener (object zaten silinmiştir, `NoSuchKey` yutulur).
- **Job payload:** `{ attachmentId: string, storageKey: string }` (delete tetiği) ya da `{ orphanSweep: true }` (sweeper).
- **Activity / realtime:** Delete tx içinde zaten yazıldı (`activity_events.attachment.removed` + `realtime_events`); cleanup job sadece **fiziksel** silme yapar. Orphan sweep `activity_events` yazmaz (draft'lar kullanıcıya görünmedi).
- **Retention:** Yok — cleanup başarılı olunca satır + obje silinir; başarısız `failed` job BullMQ failed list'inde 7 gün durur (operasyonel debug).
- **Faz kapsamı:** Faz 11C ([DEM-faz11C](https://linear.app/demirkol/issue/)). Bağımlılık: Faz 11A (DB migration `committed_at` kolonu eklenmiş olmalı). Thumbnail/EXIF temizleme/AV tarama V1 dışı — bu queue'ya değil, ayrı kuyruklara (Faz 11.1 / Faz 8 sertleştirme).

## Worker job'ları (özet — güncel)

notification outbox tüketme · notification-email (Resend) · notification-push (Expo) · realtime-publish (Faz 5B) · realtime-publish-sweeper (Faz 5B) · notification-publish-sweeper (Faz 6A) · due-date scheduler (Faz 6A) · **attachment-cleanup (Faz 11) · attachment-cleanup-sweeper (Faz 11)** · failed job retry · dead-letter job kaydı · position compaction (Faz 3C). Queue: BullMQ + Redis. Bkz. [`10-platform.md`](10-platform.md).
