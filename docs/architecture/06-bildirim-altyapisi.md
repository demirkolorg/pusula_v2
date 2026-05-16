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
updated: 2026-05-16
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

> **Wired (2026-05-16 — [DEM-154](https://linear.app/demirkol/issue/DEM-154)):** Erişim talebi (`board.requestAccess`) artık bildirim outbox'una ek olarak `realtime_events`'e `board.access_requested` tipi de yazıyor (`bumpBoardVersionForRealtime` + `insertRealtimeEvent`, yalnız genuinely yeni talepte). Client dispatcher (`apps/web/src/lib/realtime/event-handlers.ts`) bu tipi `board.accessRequests.list` query'sini invalidate ederek karşılar — board admin'inin açık board sayfasında "Talepler" sekmesi + bekleyen-talep rozeti sayfa yenilemeden güncellenir. Talep sahibinin board erişimi olmadığından `board:{id}` room'una giremez; event yalnız admin'lere ulaşır.

> **Wired (2026-05-16 — [DEM-152](https://linear.app/demirkol/issue/DEM-152)):** `watched_activity` "çöp kovası" tipi 7 granular `NOTIFICATION_TYPES` değerine bölündü — `card_moved` · `card_archived` · `card_completed` · `card_due_changed` · `card_cover_changed` · `card_member_removed` · `attachment_added` (migration `0028_dem152_notification_types_granular` — `notification_type` pg enum'a 7 `ADD VALUE IF NOT EXISTS`). Saf ayrıştırma: `notification-rules.ts:mapEventToNotificationType` her activity event'i granular tipe yönlendirir; recipient hesabı + kanal seçimi değişmedi (`attachment_added` push opt-in mevcut davranışını korur; `pickChannels` special-case `event.type === 'attachment.added'` yerine `notificationType === 'attachment_added'`'a bağlandı). Worker `notification-templates.ts` email/push/digest switch'leri 7 yeni case (TS `never` exhaustiveness). Web UI her tip için ayrı ikon/renk (`notification-type-icon.tsx`), özet metni (`activity-summary.ts` + `strings.ts`), tercih matrisi satırı (`notifications-shared.ts MATRIX_ROWS`). `watched_activity` enum değeri fallback olarak korunur ama hiçbir olay artık ona yönlenmez. Domain tarafı → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md) "Bildirim tipi taksonomisi".

> **Wired (2026-05-16 — [DEM-154](https://linear.app/demirkol/issue/DEM-154)):** Board erişim talebi artık gerçek bildirim üretir. `NOTIFICATION_TYPES`'a `board_access_requested`, `ACTIVITY_EVENT_TYPES`'a `board.access_requested` append edildi (migration `0029` — `notification_type` + `activity_event_type` pg enum'larına `ADD VALUE IF NOT EXISTS`). `board.accessRequests.request` mutation yeni bir talep yarattığında (idempotent dallar hariç) tx içinde `board.access_requested` activity event insert eder + `dispatchNotificationsForActivity` çağırır + commit sonrası `maybeEnqueueNotificationPublish`. Rule engine: `mapEventToNotificationType` `board.access_requested` → `board_access_requested`; `collectRecipients` yeni dal `board_members.role = 'admin'` satırlarını toplar (talep sahibi actor self-skip ile düşer); `COOLDOWN_BYPASS`'a `board_access_requested` eklendi (her talep ayrı kişi/aksiyon). Kanal in_app + email opt-in (`emailByType`); push yok; mute-bypass değil. Worker `notification-templates.ts` email/push switch'leri `board_access_requested` case (TS `never` exhaustiveness). Web: bildirim zilinde satır + `notification-type-icon` / `activity-summary` / `notification-link` yeni tip; bildirime tıklayınca board'a gider. Domain tarafı → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md) "DEM-154 — board erişim talebi bildirimi".

- **Queue:** `pusula-notifications` (BullMQ, `apps/worker` — `QUEUE.notifications`); `pusula-notifications-email` + `pusula-notifications-push` (Faz 6B kanal kuyrukları — ad ayracı `-`); `pusula-realtime-publish` (Faz 5) + `pusula-compaction` (Faz 3C) yanında.
- **Notification kuralları (`packages/api/src/lib/notification-rules.ts`):** activity event tipine göre recipient(s) + kanal(lar) hesabı (pure function). Input: `{ activityEvent, actor, board, card?, list? }`; output: `Array<{ recipientUserId, type, channels: ['in_app' | 'email' | 'push'], payload }>`. Actor self-skip + permission check (board erişimi olmayan recipient atlanır) + role merge (assignee+watcher tek satır). Detay → `04-bildirim-kurallari.md` "Bildirim kaynakları" tablosu.
- **Cooldown 60s:** insert öncesi son 60s'de aynı `(recipient_id, type)` `notification_outbox` satırı varsa yeni satır eklenmez. İstisnalar: `comment.mentioned` (mute-bypass + her mention önemli), `*_invited` (her davet ayrı token), `board_access_requested` (her talep ayrı kişi/aksiyon — DEM-154), `due_reminder_*` (scheduler zaten dedupe yapıyor).
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

> **Wired (2026-05-15 — Faz 11C / [DEM-149](https://linear.app/demirkol/issue/DEM-149)):** Bu queue canlı. Kuyruk `pusula-attachment-cleanup` (`apps/worker/src/queues.ts:QUEUE.attachmentCleanup` + `attachmentCleanupQueue`). Delete tetik processor `apps/worker/src/jobs/attachment-cleanup.ts` (`processAttachmentCleanupJob` — S3 `DeleteObjectCommand`, `NoSuchKey` ve `404`/`NotFound` HTTP yanıtları idempotent kabul + success damgalanır; diğer hatalar BullMQ retry/backoff'a düşer — `attachmentCleanupQueue` override `attempts: 3` exponential, DEM-149 spec'ine uygun; failed list 7 gün tutar). Orphan sweeper `apps/worker/src/jobs/attachment-cleanup-sweeper.ts` (`sweepOrphanAttachments` — `committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'` partial index `attachments_orphan_sweep_idx`'ten okur, satır başına önce S3 DeleteObject idempotent → sonra DB DELETE `committed_at IS NULL` koruyucu predicate; storage hatası satırı atlatır, sonraki tick yeniden dener). Producer `apps/api/src/attachment-cleanup-queue.ts` (`enqueueAttachmentCleanup({ attachmentId, storageKey })` — `jobId = cleanup-{attachmentId}` debounce, best-effort Redis hatası swallow). Ctx tipi `packages/api/src/lib/attachment-cleanup.ts:EnqueueAttachmentCleanup` ([`context.ts`](../../packages/api/src/context.ts) `enqueueAttachmentCleanup` alanı). Worker `index.ts` queue + 60 dk repeatable sweeper register eder. S3 client `@aws-sdk/client-s3` `apps/worker` deps + `apps/api` ile aynı endpoint/region/credentials env yüzeyini paylaşır. **Kapsam dışı bu turda:** `attachment.delete` mutation gövdesinde `void enqueueAttachmentCleanup(...)` çağrısı — DEM-148 (Faz 11B) ekleyecek; bu tur yalnız sözleşmeyi (`EnqueueAttachmentCleanup` ctx alanı + producer) sağlar.

- **Queue:** `pusula-attachment-cleanup` (BullMQ, `apps/worker` — `QUEUE.attachmentCleanup`); `pusula-notifications` / `pusula-realtime-publish` / `pusula-compaction` yanında. Ad ayracı `-` (Redis anahtar ayıracı `:` reddi disiplini).
- **Tetik 1 — Delete:** `attachment.delete` mutation tx COMMIT sonrası `void enqueueAttachmentCleanup({ attachmentId, storageKey })` (best-effort; Redis hatası response'u düşürmez — sweeper yedek). Job MinIO `DeleteObject({ Bucket, Key: storageKey })` çağırır; başarılıysa job tamamlandı. Idempotent: object zaten yoksa (`NoSuchKey`) success sayılır. Hata → BullMQ retry/backoff (3 attempt, exponential); dead-letter sweeper devralır.
- **Tetik 2 — Orphan sweep:** `pusula-attachment-cleanup-sweeper` (60dk repeatable cron — Faz 5B/6A sweeper pattern simetri ama daha seyrek; 1 saatlik draft window). Sorgu: `SELECT id, storage_key FROM attachments WHERE committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'`. Her satır için: önce `DeleteObject` (idempotent), sonra DB `DELETE FROM attachments WHERE id = ? AND committed_at IS NULL`. Sıralı: önce storage sonra DB — DB silme başarısız olursa job retry'da yeniden dener (object zaten silinmiştir, `NoSuchKey` yutulur).
- **Job payload:** `{ attachmentId: string, storageKey: string }` (delete tetiği) ya da `{}` (sweeper — `job.name` ile ayrılır, Faz 6A `notification-publish` sweeper pattern simetri).
- **Activity / realtime:** Delete tx içinde zaten yazıldı (`activity_events.attachment.removed` + `realtime_events`); cleanup job sadece **fiziksel** silme yapar. Orphan sweep `activity_events` yazmaz (draft'lar kullanıcıya görünmedi).
- **Retention:** Yok — cleanup başarılı olunca satır + obje silinir; başarısız `failed` job BullMQ failed list'inde 7 gün durur (operasyonel debug).
- **Faz kapsamı:** Faz 11C ([DEM-149](https://linear.app/demirkol/issue/DEM-149)). Bağımlılık: Faz 11A ([DEM-147](https://linear.app/demirkol/issue/DEM-147) — migration 0027 `committed_at` kolonu + `attachments_orphan_sweep_idx` partial index). Thumbnail/EXIF temizleme/AV tarama V1 dışı — bu queue'ya değil, ayrı kuyruklara (Faz 11.1 / Faz 8 sertleştirme).

## Notification preferences API (Faz 10B — [DEM-136](https://linear.app/demirkol/issue/DEM-136))

Kullanıcının kendi bildirim tercihini okuyup yazacağı tRPC procedure yüzeyi. Faz 6A tablo + rule engine + outbox + worker hattını teslim etti ama **`notifications.preferences.*` procedure'leri** [`packages/api/src/root.ts`](../../packages/api/src/root.ts)'ten **eksik kaldı** — kullanıcı UI bunun üzerine inşa edilemez. Bu boşluk Faz 10B'de kapanır. UI yerleşimi → [`15-bildirim-ayar-ekrani.md`](15-bildirim-ayar-ekrani.md); domain kuralları (scope hiyerarşisi, mute-bypass tipler) → [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md).

> **Wired (2026-05-15 — Faz 10B / [DEM-136](https://linear.app/demirkol/issue/DEM-136)):** Bu yüzey canlı. Migration `0021_dem136_notification_prefs_unique` (unique scope index `(user_id, COALESCE(workspace_id,''), COALESCE(board_id,''), COALESCE(card_id,''))`) uygulandı. tRPC procedures: `notifications.preferences.list` (workspace/board/card scopeLabel JOIN + hiyerarşi `CASE` ordering global → workspace → board → card) · `.get` (scope erişim kontrolü + null fallback) · `.upsert` (Drizzle insert → 23505 yakalandığında UPDATE fallback — expression-target ON CONFLICT için tek temiz yol; nanoid id Drizzle `$defaultFn` üzerinden korunur) · `.delete` (global default satırı korunur — `BAD_REQUEST`) + `push.tokens.list` (revoked filtreli, `COALESCE(last_used_at, created_at)` DESC, token string'i döndürmez). Zod şeması `packages/domain/src/schemas/notification-preference.ts` (xor-validation refine + `clientMutationId` baked in). Permission helper `canManageNotificationPreference(scope, hasScopeAccess)` `packages/domain/src/permissions.ts` (global her zaman izinli). `packages/api/src/routers/notifications.ts` içinde `assertScopeAccess` workspace member / effective board role / (card watcher-or-assignee OR board access) yolunu çözer. Vitest 25 yeni test PASS: `notifications-preferences.test.ts` 18 · `push-tokens-list.test.ts` 7. `pnpm --filter @pusula/api typecheck` + `@pusula/domain test` (163/163) + `@pusula/db typecheck` temiz.

- **Migration:** [`packages/db/drizzle/0021_dem136_notification_prefs_unique.sql`](../../packages/db/drizzle/0021_dem136_notification_prefs_unique.sql) `notification_preferences` üstüne unique index:

  ```sql
  CREATE UNIQUE INDEX notification_preferences_scope_uq
  ON notification_preferences (
    user_id,
    COALESCE(workspace_id, ''),
    COALESCE(board_id, ''),
    COALESCE(card_id, '')
  );
  ```

  Bu olmadan `upsert` `ON CONFLICT (...) DO UPDATE` çalışmaz; aynı scope'a duplicate satır eklenir. Mevcut şema (Faz 0 migration `0000_nasty_rattler.sql:229-241`) yalnız `notification_preferences_user_idx` BTREE `(user_id)` taşıyor; unique constraint yok.

- **tRPC procedure'leri** (`packages/api/src/routers/notifications.ts` içine `preferences` nested router):

  | Procedure | Tip | Input | Output | Permission |
  |-----------|-----|-------|--------|------------|
  | `notifications.preferences.list` | query | yok | `Array<{ id, workspaceId, boardId, cardId, scopeLabel, muteLevel, mentionOnly, pushEnabled, emailEnabled, updatedAt }>` | session sahibi (`protectedProcedure`) |
  | `notifications.preferences.get` | query | `{ workspaceId?, boardId?, cardId? }` | `{ muteLevel, mentionOnly, pushEnabled, emailEnabled } \| null` | session sahibi |
  | `notifications.preferences.upsert` | mutation | tercih + scope alanları | satır | session sahibi + scope erişimi |
  | `notifications.preferences.delete` | mutation | `{ workspaceId?, boardId?, cardId? }` | `{ deleted: boolean }` | session sahibi + scope erişimi |
  | `push.tokens.list` | query | yok | `Array<{ id, platform, deviceName, lastUsedAt, createdAt }>` (`revoked_at IS NULL`) | session sahibi |

  `list` `scopeLabel`'i workspace/board/card adlarını JOIN ile getirir; UI ağaç render eder. `upsert` xor-validation yapar (`workspaceId`+`boardId`+`cardId`'den en fazla biri dolu — hiyerarşik mantığa uygun). Scope erişimi `@pusula/domain/permissions` helper'larıyla kontrol edilir (workspace member / board member / kart member-watcher).

- **Zod şemaları** (`packages/domain/src/schemas/notification-preference.ts`):
  - `notificationPreferenceScopeSchema` — `{ workspaceId?, boardId?, cardId? }` xor-validation.
  - `notificationPreferenceSchema` — full upsert input.
  - `notificationPreferencePartialSchema` — partial update.

- **Quiet hours / digest / snooze alanları** Faz 10F/G/H'de ayrı migration'larla `notification_preferences` üstüne eklenir (`quiet_from`, `quiet_to`, `quiet_timezone`, `email_mode`, `mute_until`); preferences API input şeması o fazlarda genişler.

## Faz 6 dispatch açıkları (Faz 10A — [DEM-135](https://linear.app/demirkol/issue/DEM-135)'te kapanır)

> **Wired (2026-05-15 — Faz 10A / [DEM-135](https://linear.app/demirkol/issue/DEM-135)):** Beş dispatch açığı kapandı. `card.update` (kapak rengi + kapak fotoğrafı), `card.members.remove`, `board.members.remove`, `board.members.updateRole`, `workspace.removeMember`, `workspace.updateMemberRole` mutation'larının her biri `activity_events` insert'inin yanında `dispatchNotificationsForActivity` çağırıyor (tx içinde, rollback ile birlikte). `@pusula/domain` `NOTIFICATION_TYPES` `'member_removed'` + `'member_role_changed'` ile genişledi (migration `0022_dem135_notification_types_member` — pg enum `notification_type`'a `ADD VALUE IF NOT EXISTS`). Rule engine (`packages/api/src/lib/notification-rules.ts`) yeni event mapping + permission-filter istisnası (`*member_removed` tiplerinde alıcı board/workspace üye olmasa bile geçer) + kanal seçimi (`member_removed` → in_app + email; `member_role_changed` → in_app). Worker template'leri (`apps/worker/src/jobs/notification-templates.ts`) `renderMemberRemoved` + `renderMemberRoleChanged` ekledi (board/workspace scope payload `activityType` üzerinden çözülür). Vitest packages/api: 14/14 notification-rules (yeni 7) + 10/10 board-members (yeni 2) PASS. typecheck + lint temiz.

Faz 6A bazı mutation'larda `activity_events` insert ediyor ama `dispatchNotificationsForActivity(tx, activityEvent)` çağrısı **eksik kaldı**. Rule engine bu activity tiplerini destekliyor ya da kolay desteklenebilir; çağrı düşmediği için kullanıcı için "sessiz" UX yaşanıyor. Faz 10A bu 5 boşluğu kapatır.

| Mutation | Activity tipi | Şu an | Olması gereken (Faz 10A) |
|----------|---------------|-------|--------------------------|
| `card.update` (cover color) | `card.cover_changed` / `card.cover_cleared` | activity var, dispatch yok | watcher'lar → `watched_activity` in-app |
| `card.update` (cover image) | `card.cover_image_changed` / `card.cover_image_cleared` | activity var, dispatch yok | watcher'lar → `watched_activity` in-app |
| `card.members.remove` | `card.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app (karta erişimi kaybetti) |
| `board.members.remove` | `board.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app + email |
| `board.members.updateRole` | `board.member_role_changed` | activity var, dispatch yok | **rolü değişen kişiye** in-app |
| `workspace.removeMember` | `workspace.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app + email |
| `workspace.updateMemberRole` | `workspace.member_role_changed` | activity var, dispatch yok | **rolü değişen kişiye** in-app |

**Permission filter istisnası:** `card.member_removed` ve `board.member_removed` özel — alıcı **artık o kaynağa erişimi yok**. Rule engine permission filter'ı bu kişileri normalde atar (`notification-rules.ts collectRecipients`). 10A'da bu tipler için filter atlamalı: "karttan/board'dan çıkarıldın" bildirimi mantıken **erişim kaybedildikten sonra** gider. Implementation: `notification-rules.ts` permission filter'ında tip kontrolü (`member_removed` tiplerinde recipient board/workspace üye olmasa bile geçer).

**Yeni notification type'lar:** `@pusula/domain` `NOTIFICATION_TYPES`'a `member_removed` + `member_role_changed` eklenir; email template'leri `apps/worker/src/jobs/notification-templates.ts`'e iliştirilir ("{Actor} sizi '{boardName}' panosundan çıkardı" / "{Actor} {boardName} panosundaki rolünüzü '{newRole}' yaptı").

## Quiet hours (sessiz saatler, Faz 10F — [DEM-140](https://linear.app/demirkol/issue/DEM-140))

Bir gün içinde belirli bir aralıkta **push + email** kanalları susturulur; in-app her zaman çalışır. Mention + davet zaten mute-bypass — onlar quiet hours penceresinde de geçer.

> **Wired (2026-05-15 — Faz 10F / [DEM-140](https://linear.app/demirkol/issue/DEM-140)):** Bu katman canlı. Migration [`packages/db/drizzle/0024_dem140_quiet_hours.sql`](../../packages/db/drizzle/0024_dem140_quiet_hours.sql) `notification_preferences` üstüne `quiet_from time` + `quiet_to time` + `quiet_timezone text` ekledi + `notification_preferences_quiet_hours_consistency` CHECK constraint (üçü birden null veya üçü birden dolu). Drizzle schema [`packages/db/src/schema/notifications.ts`](../../packages/db/src/schema/notifications.ts) eşliyor. Zod validator [`packages/domain/src/schemas/notification-preference.ts`](../../packages/domain/src/schemas/notification-preference.ts) `quietHourTimeSchema` (HH:MM regex) + `ianaTimezoneSchema` (ICU `Intl.DateTimeFormat` doğrulamalı) + `validateQuietHoursTriplet` (üçü-birlikte + scope=global zorunluluğu). tRPC `notifications.preferences.upsert/get/list` quiet alanlarını okuyup yazıyor; `time` round-trip'inden gelen `HH:MM:SS`'yi UI için `HH:MM`'e normalize eden `normalizeHHMM` helper'ı egress'te uygulanıyor. Worker helper [`apps/worker/src/lib/quiet-hours.ts`](../../apps/worker/src/lib/quiet-hours.ts) (`isWithinQuietHours` — same-day, overnight ve TZ-aware pencere mantığı + `parseHHMM` saniyeli formatı da kabul eder) + `isQuietHoursBypassType` (`mention` / `board_invitation` / `workspace_invitation`). Email processor [`apps/worker/src/jobs/notification-email.ts`](../../apps/worker/src/jobs/notification-email.ts) `loadEmailDecision` ile preference satırını okur; pencerede non-bypass tip için `stampDead(..., 'quiet_hours_window')` damgalanır + Resend çağrılmaz. Push processor [`apps/worker/src/jobs/notification-push.ts`](../../apps/worker/src/jobs/notification-push.ts) `loadGlobalQuietHours` ile aynı pattern. In-app processor etkilenmez (`notification-publish.ts` quiet-hours okumaz). UI Section 5 [`apps/web/src/app/(app)/account/_components/notifications-quiet-hours-form.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-quiet-hours-form.tsx) — toggle, `<input type="time">` × 2, IANA timezone Select, önizleme + bypass notu; ChannelsForm + TypeMatrix + ScopeTree ile aynı `preferences.get` cache'ini paylaşır, optimistic mutation'larda diğer alanları korur (`effective.*` taşıma pattern'i). Vitest 49 yeni test PASS: domain 13 · worker helper 19 · API integration 5 · email integration 3 · push integration 2 · UI RTL 7. **DEM-141 koordinasyonu:** Migration zincirini açmak için [`packages/db/drizzle/0026_dem141_email_digest.sql`](../../packages/db/drizzle/0026_dem141_email_digest.sql) içindeki `notification_outbox_digest_queued_idx` partial index ifadesi yorum satırına çekildi — aynı transaction'da yeni eklenen `digest_queued` enum değerini WHERE clause'unda kullanmak `unsafe_use_of_new_value` (`55P04`) hatasını veriyor ve enum-to-text cast IMMUTABLE olmadığı için partial index predicate'de kullanılamıyor (`42P17`). 10G digest worker turunda ayrı bir migration'da yaratılmalı; schema referansı (`notifications.ts` index tanımı) yerinde duruyor.

- **Migration** (`packages/db/drizzle/0024_dem140_quiet_hours.sql`): `notification_preferences` üstüne `quiet_from time`, `quiet_to time`, `quiet_timezone text` + CHECK constraint:

  ```sql
  ALTER TABLE notification_preferences
    ADD CONSTRAINT notification_preferences_quiet_hours_consistency
    CHECK (
      (quiet_from IS NULL AND quiet_to IS NULL AND quiet_timezone IS NULL)
      OR
      (quiet_from IS NOT NULL AND quiet_to IS NOT NULL AND quiet_timezone IS NOT NULL)
    );
  ```

  Üçü birden NULL (devre dışı) veya üçü birden dolu (aktif). `quiet_from > quiet_to` farklı gün aralığı (örn. 23:00 → 07:00).

- **Worker filter** (`apps/worker/src/jobs/notification-email.ts` + `notification-push.ts`):
  1. Recipient'in preference satırını yükle.
  2. `quiet_timezone IS NOT NULL` ise o timezone'da `now` `quiet_from`–`quiet_to` aralığındaysa kanal **iptal** (`status='dead'` damgalanır — kuyrukta birikme önlemek için).
  3. Pencere dışında normal işlem.

  In-app processor (`notification-publish.ts`) quiet hours bakmaz — in-app her zaman gönderir.

- **Scope:** Sadece **global** preference satırına bağlı (`workspace_id = NULL, board_id = NULL, card_id = NULL`). Scope-spesifik quiet hours **eklenmez** (sade tutmak için; gerçek talep gelirse sonraki tur).

- **tRPC:** `notifications.preferences.upsert` input genişler (`quietFrom?: string` HH:MM, `quietTo?: string` HH:MM, `quietTimezone?: string` IANA TZ).

## Email digest (Faz 10G — [DEM-141](https://linear.app/demirkol/issue/DEM-141))

Şu an her atama/mention/yorum **transactional** email gönderiyor. Digest modunda kullanıcı **gün içinde transactional yerine 1 toplu özet** alır. Mention + davet **her zaman anlık** (digest moduna girmez — mute-bypass kuralı).

> **Wired (2026-05-15 — Faz 10G / [DEM-141](https://linear.app/demirkol/issue/DEM-141)):** Bu katman canlı. Migration `0026_dem141_email_digest` (`notification_preferences.email_mode text NOT NULL DEFAULT 'instant'` + CHECK + `outbox_status` enum'una `'digest_queued'` ekleme + partial index `notification_outbox_digest_queued_idx`). Outbox helper `packages/api/src/lib/notification-outbox.ts:insertNotificationOutbox` artık channel='email' için recipient'in global `email_mode`'unu okur; `'off'` ise satır insert etmez (`{ inserted: false, reason: 'email_mode_off' }`), digest mod'larda satır `status='digest_queued'` damgalanır, mute-bypass tipler (mention + davetler) `DIGEST_BYPASS` set'inde — her durumda anlık `'pending'` kalır. 6A publish processor (`notification-publish.ts:dispatchOutboxRow`) email kanalında `digest_queued` satırlarını skip eder; sweeper (`notification-publish-sweeper.ts`) bu satırları yeniden enqueue etmez (`status <> 'digest_queued'` filtresi). Yeni worker job `apps/worker/src/jobs/notification-email-digest.ts` BullMQ `pusula-notifications-email-digest` kuyruğunda iki repeatable cron (`notification-email-digest-hourly` = `'0 * * * *'` ve `-daily` = `'0 8 * * *'`); `FOR UPDATE SKIP LOCKED` ile satırları kilitler, recipient bazlı gruplar, güncel `email_mode`'u yeniden okur (kullanıcı arada `instant`'a geçtiyse sessiz skip — orphan temizleyici sonraki tur), `email_enabled=false` veya silinmiş user → audit damgalama, `renderDigestEmail` ile tek özet maili gönderir, başarılıysa tüm bucket'ı `status='sent' + processed_at=NOW()` damgalar. Template `notification-templates.ts:renderDigestEmail` (Map insertion-order grup, en fazla 5 satır + "ve X daha" özet, plain-text mirror, footer `{appUrl}/account?tab=notifications` linki, XSS-safe escape). tRPC `notifications.preferences.upsert/get/list` `emailMode` alanını okuyup yazıyor (Zod `emailDigestModeSchema` + `validateEmailModeScope` superRefine — yalnız global scope'ta `'instant'` haricine izin verir). UI Section 6 `apps/web/src/app/(app)/account/_components/notifications-digest-form.tsx` (4-option RadioGroup + bypassNote, optimistic `setQueryData` + rollback + `invalidateQueries` `get` & `list`). AccountTabs Bildirimler sekmesi sıralaması Channels → Matrix → QuietHours → **Digest** → ScopeTree → Snooze → Devices. Vitest 25+ yeni test (outbox 4 + publish 2 + email-digest 9 + templates 8 + digest-form UI 5) PASS; tüm paketler typecheck + lint temiz.

- **Migration** (`packages/db/drizzle/0016_*`):

  ```sql
  ALTER TABLE notification_preferences
    ADD COLUMN email_mode text NOT NULL DEFAULT 'instant'
    CHECK (email_mode IN ('instant', 'hourly_digest', 'daily_digest', 'off'));
  ```

  `email_mode='off'` → `email_enabled=false` ile aynı, ancak UI'da net seçim için ayrı kolon (`email_enabled` legacy backward-compat olarak korunur; rule engine ikisini AND'ler).

- **Outbox değişikliği** (`packages/api/src/lib/notification-outbox.ts`):
  - Recipient'in `email_mode IN ('hourly_digest', 'daily_digest')` ise `notification_outbox.channel='email'` satırı `status='digest_queued'` damgalanır.
  - 6A processor (`notification-publish.ts`) `digest_queued` satırları **işlemez** — email kanal kuyruğuna push etmez.

- **Yeni worker job:** `apps/worker/src/jobs/notification-email-digest.ts` — BullMQ repeatable cron:
  - Hourly digest: `0 * * * *` (her saat başı)
  - Daily digest: `0 8 * * *` (her gün 08:00 UTC; kullanıcı timezone'a göre değil, başlangıç için sade tutuyor)
  - Sorgu: `SELECT * FROM notification_outbox WHERE status='digest_queued' AND channel='email' GROUP BY recipient_id`.
  - Her recipient için: outbox satırlarını tipe göre grupla, tek "özet" maili gönder, her satırı `status='delivered'` damgala.
  - Mail template: `apps/worker/src/jobs/notification-templates.ts`'e yeni `renderDigestEmail(digest)` fonksiyonu.

- **Mute-bypass tipler digest'e girmez** — `mention`, `board_invitation`, `workspace_invitation` her zaman anlık gönderilir (mute-bypass disiplini bozulmaz).

- **Scope:** Sadece **global** preference satırına bağlı.

## Snooze (Faz 10H — [DEM-142](https://linear.app/demirkol/issue/DEM-142))

Kullanıcı geçici bir süre (örn. 1 saat, 1 gün, hafta sonu) belirli bir kartın bildirimlerini susturmak isteyebilir. Mevcut `mute_level='all'` kalıcıdır; snooze otomatik süresi dolunca açılır.

> **Wired (2026-05-15 — Faz 10H / [DEM-142](https://linear.app/demirkol/issue/DEM-142)):** Bu özellik canlı. Migration [`packages/db/drizzle/0025_dem142_snooze.sql`](../../packages/db/drizzle/0025_dem142_snooze.sql) `notification_preferences.mute_until` (`timestamp with timezone`, nullable) + partial index `notification_preferences_mute_until_idx ON (mute_until) WHERE mute_until IS NOT NULL`. Drizzle schema `muteUntil` kolonunu okur. Rule engine [`packages/api/src/lib/notification-rules.ts:pickChannels`](../../packages/api/src/lib/notification-rules.ts) mute kontrolü genişledi — `muteLevel === 'all'` **VEYA** (`muteUntil > Date.now()`) → mute aktif (mute-bypass tipler `mention` + `*_invitation` hâlâ geçer); `loadPreference` `muteUntil`'i scope satırından okuyor (narrowest-scope-wins kart-scope'u seçer). Yeni tRPC procedure'leri [`packages/api/src/routers/notifications.ts`](../../packages/api/src/routers/notifications.ts) `preferences.snooze({ cardId, duration: '1h'|'4h'|'1d'|'1w'|'until_date', untilDate? })` (server-side `Date.now()` ile timestamp hesabı; `until_date` için gelecek + max 1 yıl iş kuralı + INSERT → 23505 yakalanırsa UPDATE fallback) + `preferences.unsnooze({ cardId })` (mute_until=null, satır yoksa `unsnoozed: false`). Zod şemaları [`packages/domain/src/schemas/notification-preference.ts`](../../packages/domain/src/schemas/notification-preference.ts) `snoozeInput` (refine: `until_date` ↔ `untilDate` zorunluluk) + `unsnoozeInput`. UI: kart detay header'ında [`apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-snooze.tsx`](../../apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-snooze.tsx) `BellIcon`/`BellOffIcon` toggle + DropdownMenu (5 duration + "Susturmayı kaldır") + native `<input type="datetime-local">` Dialog (until_date için); aktif snooze listesi [`apps/web/src/app/(app)/account/_components/notifications-snooze-list.tsx`](../../apps/web/src/app/(app)/account/_components/notifications-snooze-list.tsx) `preferences.list()` üzerinden `cardId IS NOT NULL AND mute_until > now` filtreler, AccountTabs Bildirimler sekmesinde Section 7 olarak render eder. Optimistic UI: snooze/unsnooze her ikisi `setQueryData` snapshot + rollback + invalidate (hem `preferences.get({ cardId })` hem `preferences.list`). i18n `strings.account.notifications.snooze.*` (Türkçe diakritikli — `durations.{1h,4h,1d,1w,untilDate}` + `unsnooze` + `untilDate*` dialog metinleri). Vitest 12+ yeni test: rule engine 4 (snooze active + comment.created → boş; snooze + mention → bypass; süresi dolmuş → normal akış; snooze + mute_level=all → her iki yol da mute, mention bypass) + router 8 (insert / update tek satır / FORBIDDEN outsider / past date / 1 yıl üstü / until_date eksik refine / unsnooze idempotent / unsnooze no-op) + UI 13 (CardDetailSnooze 7 + NotificationsSnoozeList 6). `pnpm typecheck + test + lint` tüm paketler temiz. Kapsam dışı (V1): workspace/board scope snooze, bulk snooze, recurring snooze, "snooze bitti" tetikleyici, snooze geçmişi/audit log.

- **Migration** (`packages/db/drizzle/0025_dem142_snooze.sql`):

  ```sql
  ALTER TABLE notification_preferences
    ADD COLUMN mute_until timestamptz;

  CREATE INDEX notification_preferences_mute_until_idx
    ON notification_preferences (mute_until)
    WHERE mute_until IS NOT NULL;
  ```

- **Rule engine değişikliği** (`packages/api/src/lib/notification-rules.ts`):
  - `pickChannels` mute kontrolü: `preference.muteLevel === 'all'` **VEYA** (`preference.muteUntil IS NOT NULL AND preference.muteUntil > NOW()`) → mute-bypass yoksa boş dizi (hiçbir kanal yok).
  - Süresi dolmuş satır (`mute_until < now`) görmezden gelinir; satır otomatik temizlenmesin (audit için kalır).

- **tRPC:** Yeni ayrı endpoint'ler (UI hızı için):
  - `notifications.preferences.snooze({ cardId, duration: '1h'|'4h'|'1d'|'1w'|'until_date', untilDate? })` → cardId scope satırını upsert, `mute_until = now() + duration`.
  - `notifications.preferences.unsnooze({ cardId })` → `mute_until = null`.

- **UI:** Kart detay modal header'ında "🔔 Bildirimleri sustur" dropdown (1h/4h/1d/1w/belirli tarihe kadar). Snooze aktif iken icon değişir (`🔕 1g 4s kaldı`). Account/Bildirimler sekmesinde aktif snooze'lar listesi (kart adı + kalan süre + "Kaldır").

- **Scope:** Sadece **card-level**.

## Worker job'ları (özet — güncel)

notification outbox tüketme · notification-email (Resend) · **notification-email-digest (Faz 10G — Wired 2026-05-15 / DEM-141)** · notification-push (Expo) · realtime-publish (Faz 5B) · realtime-publish-sweeper (Faz 5B) · notification-publish-sweeper (Faz 6A) · due-date scheduler (Faz 6A) · **attachment-cleanup (Faz 11C — Wired 2026-05-15 / [DEM-149](https://linear.app/demirkol/issue/DEM-149)) · attachment-cleanup-sweeper (Faz 11C — Wired 2026-05-15)** · failed job retry · dead-letter job kaydı · position compaction (Faz 3C). Queue: BullMQ + Redis. Bkz. [`10-platform.md`](10-platform.md).
