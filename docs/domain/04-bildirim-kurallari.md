---
title: '04 — Bildirim Kuralları'
description: 'Bildirim kanalları, event kaynakları, tercih ve bastırma kuralları.'
aliases:
  - 'Bildirim Kuralları'
  - 'Notification Rules'
tags:
  - 'pusula'
  - 'domain/notifications'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-05-13
---

# 04 — Bildirim Kuralları

> Eksen: **iş / domain** — _hangi olay hangi bildirimi üretir, kime, hangi kanaldan, ne zaman
> bastırılır_. Altyapı/mekanizma (outbox, worker, Expo/Resend teslimi) → [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md).

## Kanallar

| Kanal               | Açıklama                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| In-app notification | `notifications` tablosu; notification center'da gösterilir                                                          |
| Realtime badge      | Okunmamış sayısı değişince Socket.IO `user:{userId}` room'una `notification.created` event yayını (Faz 5 altyapısı) |
| Mobile push         | Expo Notifications (worker üzerinden); backend Faz 6, mobile aktivasyon Faz 7                                       |
| Email               | Resend — transactional (DEM-68 auth e-postalarıyla aynı kanal) + ileride digest                                     |
| Slack/Teams         | Yalnızca açıkça istenirse (ileride)                                                                                 |

## Bildirim kaynakları (activity event → bildirim)

`activity_events` tablosundaki her olay için bildirim kuralı `packages/api/src/lib/notification-rules.ts`'te tanımlıdır (Faz 6A — [DEM-90](https://linear.app/demirkol/issue/DEM-90)). Tablo: olay tipi → kimin bildirim alacağı → varsayılan kanal(lar).

| Activity event tipi                            | Bildirim kimde?                           | Varsayılan kanal(lar)                          | Not                                                                              |
| ---------------------------------------------- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `card.member_added`                            | Atanan kullanıcı                          | in-app + email (opt-in)                        | Faz 2.5C; en yaygın                                                              |
| `comment.mentioned`                            | Mention edilen kullanıcı(lar)             | in-app + push + email (her zaman; mute-bypass) | Yüksek öncelik                                                                   |
| `comment.created`                              | Kart watcher'ları (assignee/watcher rolü) | in-app + (tercihse) push                       | Actor hariç                                                                      |
| `card.due_changed`                             | Kart üyeleri + watcher'lar                | in-app + (tercihse) push                       | Yeni due/yeni tarih                                                              |
| `card.completed` / `uncompleted`               | Kart üyeleri (actor hariç)                | in-app                                         | Görünür ama düşük gürültü                                                        |
| `card.moved` (cross-list)                      | Kart üyeleri                              | in-app                                         | Faz 3A; aynı liste içi reorder bildirim üretmez                                  |
| `card.movedToList` (cross-board)               | Kart üyeleri                              | in-app                                         | Faz 3E; board değişimi belirtilir                                                |
| `card.archived`                                | Kart üyeleri                              | in-app                                         | Actor hariç                                                                      |
| `checklist.item_checked` (watch edilen kartta) | Kart watcher'ları                         | in-app                                         | Düşük gürültü; checklist tamamlandığında bir kez özet üretilebilir (sonraki tur) |
| `board.member_invited`                         | Davet edilen e-posta                      | email (+ in-app kabul sonrası)                 | Faz 2.5C; davet token + accept/decline link                                      |
| `board.member_added`                           | Eklenen kullanıcı                         | in-app + email                                 |                                                                                  |
| `workspace.member_invited`                     | Davet edilen e-posta                      | email                                          | Faz 1.3                                                                          |
| `due_reminder_1d`                              | Kart üyeleri                              | in-app + push (opt-in)                         | Due-date scheduler (Faz 6A, 5dk cron — 24 saat içinde)                           |
| `due_reminder_1h`                              | Kart üyeleri                              | in-app + push (opt-in)                         | Due-date scheduler (1 saat içinde)                                               |
| `due_overdue`                                  | Kart üyeleri                              | in-app + push + email (opt-in)                 | Due-date scheduler (geçmiş; bir kez)                                             |

## Genel kurallar

- **Actor self-skip:** Actor'ın kendisine bildirim **gönderilmez** (kendi yaptığın işten bildirim almazsın).
- **Dedupe (event_id):** Aynı domain event'inden aynı alıcıya **tek** bildirim üretilir (`notification_outbox.event_id` üzerinden).
- **Rol birleşimi:** Bir alıcı birden fazla rolle ilgiliyse (örn. hem assignee hem watcher) en kapsamlı tek bildirim üretilir, çoğaltılmaz (recipient + event_id unique).
- **Mute-bypass:** `mention` ve doğrudan `davet` her zaman geçer (mute / mention-only ayarları görmez).
- **Permission check:** Bildirim alıcısı olay anında ilgili kaynağa erişebilmelidir (board üyesi değilse / silinmişse → bildirim üretilmez).

## Cooldown (Faz 6A — DEM-90)

**Aynı kullanıcı + aynı bildirim tipi + 60 saniye penceresi** içinde birden fazla bildirim üretilmez. Mekanik: `notification_outbox` insert öncesi kontrol — son 60s'de aynı `(recipient_id, type)` satırı varsa yeni satır eklenmez (silently skipped).

Niçin: Alice aynı kişiye 5 saniye içinde 4 kart atarsa Bob'a 4 ayrı "atandın" bildirimi yerine **tek** bildirim gider. Toplu işlemlerde gürültü azalır.

İstisnalar:

- `comment.mentioned` — cooldown'a tabi değil (her mention ayrı önemli).
- `board.member_invited` / `workspace.member_invited` — cooldown'a tabi değil (her davet farklı token + e-posta).
- `due_reminder_*` — scheduler zaten dedupe yapıyor (`scheduled_at` + tip + card_id).

## Tercihler ve bastırma (`notification_preferences`)

Tercihler workspace / board / card seviyesinde tutulur (`user_id, workspace_id?, board_id?, card_id?, mute_level, mention_only, push_enabled, email_enabled`). Daha dar kapsam (card) daha geniş kapsamı (board, workspace) override eder.

- **mute_level:** o kapsamdaki bildirimleri kıs/sustur. Tam mute'ta bile **mention** ve **doğrudan davet** geçer.
- **mention_only:** o kapsamda yalnızca mention bildirimleri gelir.
- **push_enabled / email_enabled:** ilgili kanalı aç/kapat (in-app her zaman üretilir; sadece push/email teslimi tercihe bağlı).
- Watcher'lık otomatik kazanılabilir (örn. karta yorum yapınca veya atanınca) ama kullanıcı kartı "unwatch" edebilir.

**Faz 6 kapsamı:** tablo + API hazır; **kullanıcı arayüzü (tercih ekranı) Faz 6'da yok** — varsayılan tercihler (in-app her zaman + push/email opt-in) ile çalışır. Tercih ekranı sonraki tur (Faz 7/8) veya kullanıcı talebiyle.

## Sıralama / öncelik

`mention` ve `davet` her zaman en yüksek öncelik; mute/mention-only ayarlarından etkilenmez. Diğer bildirimler tercih kapsamı ve mute seviyesine tabidir.

UI'da (Faz 6D notification center) öncelik:

1. Mention + Davet (üstte, vurgulu)
2. Atama + Due overdue
3. Yorum (watcher) + Due reminder
4. Kart move/archive + Checklist activity

Tüm liste `notifications.created_at desc` ile sıralı (en yeni üstte); öncelik yalnız görsel vurgu (badge/ikon rengi).

## Mention parsing (Faz 6C — DEM-92)

`comment.body` Tiptap JSON içinde `@username` mention'ları parse edilir:

- `@` karakteri + ardından `[a-zA-Z0-9_-]+` regex match (case-insensitive).
- Match edilen username'ler `users` tablosunda aranır (kart'ın board'una erişimi olanlar arasında — yetkisiz mention bildirim üretmez).
- Her geçerli mention için `activity_events` `comment.mentioned` satırı (payload: `{ commentId, mentionedUserId }`).
- Notification-rules `comment.mentioned` olayını görür → mention edilen kullanıcıya bildirim (mute-bypass).

Edge case'ler:

- `email@domain.com` formatı match edilmez (`@` öncesi non-alphanumeric karakter olmalı veya başlangıçta).
- Aynı yorumda aynı kullanıcıyı iki kez mention etmek → tek bildirim (dedupe).
- Mention edilen ama kart'ın board'una erişimi olmayan kullanıcı → bildirim üretilmez (silently skipped).

## Faz 6 kapsamı (implementasyon)

**Bu fazda implement edilir:**

- In-app notification kanalı (notification center + bell + badge)
- Email kanalı (Resend transactional — atama/mention/yorum/due/davet template'leri)
- Push kanalı backend (Expo Push API; `push_tokens` tablo + API + worker processor) — gerçek gönderim mobile aktivasyonuyla
- Due-date scheduler (5dk cron — 1d/1h/overdue reminder)
- Cooldown 60s
- Mention parser
- Faz 5 outbox pattern'i comment/checklist/label/member mutation'larına genişletme (realtime kart detay sync)

**Bu fazda implement edilmez (sonraki tur):**

- Notification tercih/ayarlar ekranı UI (varsayılan tercihlerle çalışır)
- Email digest (saatlik/günlük özet)
- Slack/Teams entegrasyonu
- Notification rich content (action buttons, deep link payload zenginleştirme)
- Mobile push gerçek cihaz testi — Faz 7
- Search index notification (kim hangi içerikte arama yapabilir?) — Faz 6.5

## Test stratejisi (özet — detay Faz 6E / DEM-94)

- Notification kuralları: her activity tipi için doğru recipient + kanal mapping (Vitest unit).
- Cooldown: 60s penceresinde 2 atama → 1 notification.
- Permission: alıcı board'a erişimi yoksa bildirim üretilmez.
- Mention parser: `@user` match; `email@x` skip; aynı yorum aynı user → tek; yetkisiz user → skip.
- Due-date scheduler: mock kart + tarih → doğru reminder tipi.
- E2E (Playwright): alice/bob fixture; atama → bob bell badge artar → tıkla → mark-read.
