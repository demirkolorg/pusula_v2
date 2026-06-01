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
updated: 2026-06-01
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

> **Not (2026-06-01 revize):** Aşağıdaki tabloda "kanal" kolonu artık **push'ı varsayılan olarak içerir** — `push = hepsi default ON` (opt-out) kararı sonrası. Tabloya `+ push (opt-out)` etiketi her satıra eklendi; email kolonu değişmedi (yalnız heavy-touch tipler email'e gider). Detay → "Push kanalı kapsamı" bölümü.

| Activity event tipi                            | Bildirim kimde?                           | Varsayılan kanal(lar)                                       | Not                                                                              |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `card.member_added`                            | Atanan kullanıcı                          | in-app + push (opt-out) + email (opt-in)                    | Faz 2.5C; en yaygın                                                              |
| `comment.mentioned`                            | Mention edilen kullanıcı(lar)             | in-app + push + email (her zaman; mute-bypass)              | Yüksek öncelik                                                                   |
| `comment.created`                              | Kart watcher'ları (assignee/watcher rolü) | in-app + push (opt-out)                                     | Actor hariç; push 2026-06-01 expansion ile açık                                  |
| `card.due_changed`                             | Kart üyeleri + watcher'lar                | in-app + push (opt-out)                                     | Yeni due/yeni tarih; push 2026-06-01 expansion ile açık                          |
| `card.completed` / `uncompleted`               | Kart üyeleri (actor hariç)                | in-app + push (opt-out)                                     | Push 2026-06-01 expansion ile açık                                               |
| `card.moved` (cross-list)                      | Kart üyeleri                              | in-app + push (opt-out)                                     | Faz 3A; aynı liste içi reorder bildirim üretmez                                  |
| `card.movedToList` (cross-board)               | Kart üyeleri                              | in-app + push (opt-out)                                     | Faz 3E; board değişimi belirtilir                                                |
| `card.archived`                                | Kart üyeleri                              | in-app + push (opt-out)                                     | Actor hariç                                                                      |
| `checklist.item_checked` (watch edilen kartta) | Kart watcher'ları                         | in-app + push (opt-out)                                     | Push 2026-06-01 expansion ile açık                                               |
| `board.member_invited`                         | Davet edilen e-posta                      | email + push (opt-out, kabul sonrası in-app)                | Faz 2.5C; davet token + accept/decline link                                      |
| `board.member_added`                           | Eklenen kullanıcı                         | in-app + push (opt-out) + email (opt-in)                    | DEM-175; "davet" değil "eklendi" (mute-bypass değil)                              |
| `workspace.member_invited`                     | Davet edilen e-posta                      | email + push (opt-out)                                      | Faz 1.3                                                                          |
| `board.access_requested`                       | Board admin'leri (talep sahibi hariç)     | in-app + push (opt-out) + email (opt-in)                    | DEM-154; board linkinden erişim talebi                                            |
| `due_reminder_1d`                              | Kart üyeleri                              | in-app + push (opt-in)                                      | Due-date scheduler (Faz 6A, 5dk cron — 24 saat içinde)                           |
| `due_reminder_1h`                              | Kart üyeleri                              | in-app + push (opt-in)                                      | Due-date scheduler (1 saat içinde)                                               |
| `due_overdue`                                  | Kart üyeleri                              | in-app + push + email (opt-in)                              | Due-date scheduler (geçmiş; bir kez)                                             |
| `attachment.added`                             | Kart watcher'ları (assignee/watcher rolü) | in-app + push (opt-in)                                      | Faz 11; actor hariç; cooldown 60s                                                |
| `card.renamed`                                 | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153; kart başlığı değişimi                                                   |
| `card.description_changed`                     | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153                                                                          |
| `card.label_added` / `card.label_removed`      | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153                                                                          |
| `comment.updated` / `comment.deleted`          | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153; yorum düzenleme / silme                                                 |
| `checklist.created`                            | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153                                                                          |
| `checklist.item_added` / `checklist.item_removed` | Kart watcher'ları                      | in-app + push (opt-out)                                     | DEM-153                                                                          |
| `checklist.item_unchecked`                     | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153; `checklist_item_completed` tipine bağlanır (`activityType` ayırır)        |
| `attachment.removed`                           | Kart watcher'ları                         | in-app + push (opt-out)                                     | DEM-153; eski "düşük sinyal" istisnası kalktı, 2026-06-01 expansion ile push'a açık |
| `board.member_removed` / `workspace.member_removed` | Çıkarılan kişi                       | in-app + push (opt-out) + email (opt-in)                    | DEM-135 (Faz 10A); permission filter atlar (alıcı artık kaynağa erişemez)         |
| `board.member_role_changed` / `workspace.member_role_changed` | Rolü değişen kişi          | in-app + push (opt-out)                                     | DEM-135 (Faz 10A); kullanıcı zaten üye                                            |

## Bildirim tipi taksonomisi (DEM-152)

Activity event taksonomisi ince tanelidir; bildirim tipi taksonomisi (`NOTIFICATION_TYPES`,
`@pusula/domain/constants.ts`) onu **alıcının önemsediği** kadar gruplar. Her tip UI'da
kendi ikonu/rengi/özet metniyle görünür; `payload.activityType` her zaman taşınır
(worker e-posta/push template'i + UI tam metni bunu kullanır).

Faz 6A'da kart üzerindeki tüm hareketler tek `watched_activity` "çöp kovası" tipindeydi —
kart taşıma, arşivleme, tamamlama, tarih, kapak, ek hepsi tek gri ikon + tek metinle
gösteriliyordu. DEM-152 bunu **7 granular tipe** böldü (saf ayrıştırma — yeni tetikleyici
veya kanal eklenmedi):

| Bildirim tipi          | Üreten activity event(ler)i                                       | Kanal                          |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------ |
| `card_moved`           | `card.moved`                                                      | in-app                         |
| `card_archived`        | `card.archived`                                                   | in-app                         |
| `card_completed`       | `card.completed` / `card.uncompleted`                             | in-app                         |
| `card_due_changed`     | `card.due_set` / `card.due_cleared`                               | in-app                         |
| `card_cover_changed`   | `card.cover_changed/cleared` + `card.cover_image_changed/cleared` | in-app                         |
| `card_member_removed`  | `card.member_removed` (alıcı = karttan çıkarılan kişi)            | in-app                         |
| `attachment_added`     | `attachment.added`                                                | in-app + push (opt-in)         |

`watched_activity` enum değeri **silinmez** (Postgres enum append-only) ama artık hiçbir
olay ona yönlenmez — yalnız geriye dönük/fallback değer olarak kalır. Atama, mention,
yorum, due reminder, davet ve `member_removed`/`member_role_changed` tipleri DEM-152'den
etkilenmez.

### DEM-153 — kart aksiyonlarının tamamı bildirim üretir

DEM-152 sonrası bile kartla ilgili birçok aksiyon (başlık/açıklama değişimi, etiket,
yorum düzenleme/silme, checklist ekle/sil, ek kaldırma) **hiç** bildirim üretmiyordu.
DEM-153 bu boşluğu kapatır: kartla ilgili akla gelebilecek tüm aksiyonlar bildirim üretir
ve kullanıcı her birini bildirim ayarları ekranından **tek tek** kapatabilir (matris "tam
ayrıntılı" — her aksiyon kendi satırı). `NOTIFICATION_TYPES`'a **10 yeni granular tip**
append edilir:

| Bildirim tipi              | Üreten activity event           | Kanal  |
| -------------------------- | ------------------------------- | ------ |
| `card_renamed`             | `card.renamed`                  | in-app |
| `card_description_changed` | `card.description_changed`      | in-app |
| `card_label_added`         | `card.label_added`              | in-app |
| `card_label_removed`       | `card.label_removed`            | in-app |
| `comment_updated`          | `comment.updated`               | in-app |
| `comment_deleted`          | `comment.deleted`               | in-app |
| `checklist_created`        | `checklist.created`             | in-app |
| `checklist_item_added`     | `checklist.item_added`          | in-app |
| `checklist_item_removed`   | `checklist.item_removed`        | in-app |
| `attachment_removed`       | `attachment.removed`            | in-app |

`checklist.item_unchecked` yeni tip açmaz — mevcut `checklist_item_completed` tipine
bağlanır (`card.completed`/`uncompleted` → `card_completed` paterniyle aynı;
`payload.activityType` checked/unchecked'i UI'da ayırır). 10 yeni tip de **yalnız in-app**
(düşük gürültü), alıcı kart watcher pool (actor hariç), 60 sn cooldown'a tabi. `attachment.removed`
artık bildirim üretir (eski "düşük sinyal" istisnası kaldırıldı). E-posta/push opt-in
listelerine eklenmez.

### DEM-154 — board erişim talebi bildirimi

Board erişim talepleri (DEM-102) Faz 6 bildirim altyapısına bağlı değildi: bir kullanıcı
paylaşılan board linkinden erişim talep edince (`board.accessRequests.request`) yalnızca
`board_access_requests` satırı yazılıyordu — board admin'i talebi ancak "Üyeler → Talepler"
sekmesini açarsa görüyordu. DEM-154 talebi gerçek bir bildirime dönüştürür:
`NOTIFICATION_TYPES`'a `board_access_requested`, `ACTIVITY_EVENT_TYPES`'a
`board.access_requested` append edilir.

| Bildirim tipi             | Üreten activity event     | Alıcı                                | Kanal                   |
| ------------------------- | ------------------------- | ------------------------------------ | ----------------------- |
| `board_access_requested`  | `board.access_requested`  | Board admin'leri (talep sahibi ≠ üye) | in-app + email (opt-in) |

Kurallar:

- **Alıcı = board admin'leri.** Talep sahibi (actor) board üyesi değildir; rule engine'in
  recipient toplayıcısı `board_members.role = 'admin'` satırlarını seçer, actor self-skip
  zaten talep sahibini düşürür (admin olsa bile).
- **Sadece yeni talep tetikler.** `request` mutation idempotenttir — zaten bekleyen talep
  veya zaten üye dallarında activity/bildirim üretilmez (tekrarlanan talep gürültü yapmaz).
- **Cooldown bypass.** Her talep ayrı bir kişi + ayrı bir aksiyondur; `board_invitation`
  ile aynı gerekçeyle 60 sn `(recipient, type)` cooldown'undan muaftır (aşağıdaki
  "İstisnalar"). Aksi halde 60 sn içinde gelen ikinci talep sahibi görünmez olurdu.
- **Kanal.** in-app her zaman; e-posta opt-in default (admin posta kutusunda da görsün —
  `board_invitation` ile aynı seviye). Push yok. Mute ayarlarına tabidir (mute-bypass
  **değil** — board'u susturmuş admin talep pingi almak istemeyebilir).

### DEM-175 — doğrudan board üyeliği bildirimi

Bir kullanıcı board'a **doğrudan eklendiğinde** (`board.member_added` — hesabı zaten olan
biri, davet/token akışı yok) bildirim Faz 2.5'ten beri `board_invitation` tipiyle
gönderiliyordu. Sonuç yanıltıcıydı: kullanıcı "Pano daveti / …davet etti" metni + davet
kabul/reddet beklentisi alıyordu, oysa zaten üyeydi. Ayrıca `board_invitation` mute-bypass
olduğundan board'u susturmuş kullanıcı yine de anlık e-posta alıyordu.

DEM-175 doğrudan eklemeyi kendi tipine ayırır: `NOTIFICATION_TYPES`'a `board_member_added`
append edilir (`ACTIVITY_EVENT_TYPES` değişmez — `board.member_added` activity zaten var).

| Bildirim tipi        | Üreten activity event | Alıcı               | Kanal                   |
| -------------------- | --------------------- | ------------------- | ----------------------- |
| `board_member_added` | `board.member_added`  | Panoya eklenen kişi | in-app + email (opt-in) |

Kurallar:

- **Mute-bypass DEĞİL.** `board_invitation` (token'lı, tek-kullanımlık gerçek davet)
  mute-bypass kalır; doğrudan ekleme normal mute/snooze ayarlarına tabidir — board'u
  susturmuş kullanıcı anlık e-posta almaz.
- **Kanal.** in-app her zaman; e-posta opt-in default (yeni board erişimi posta kutusunda
  da görünsün). Push yok.
- **Metin.** "davet etti" değil "ekledi" — kullanıcı zaten üye, kabul/reddet adımı yok.
- **Davet kabulü ayrımı.** Board davetini kabul etmek de `board.member_added` activity
  üretir; o durumda actor = yeni üyenin kendisi olduğundan actor self-skip bildirim
  üretmez — yalnız bir admin'in doğrudan eklemesi `board_member_added` bildirimi doğurur.

## Push kanalı kapsamı — `push = hepsi default ON` (2026-06-01 revize)

Faz 6A'da push kanalı yalnız beş "yüksek değer" tipte default açıktı: `card_assigned`, `mention`, `due_approaching`, `due_overdue`, `attachment_added`. Diğer tüm tipler (member değişimleri, board/workspace davetleri, kart move/archive/complete, granular kart aksiyonları, checklist, comment edit/delete, vb.) push'a hiç gitmiyordu — kullanıcı bildirim merkezini açmadıkça olayı kaçırıyordu.

**2026-06-01 revize (kullanıcı kararı `AskUserQuestion`):** Push'a giden tip listesi **tüm `NOTIFICATION_TYPES`** kapsamına genişletildi (30+ tip). Default davranış **opt-out**: her tip default push çağrısı üretir; kullanıcı kapatmak isterse [`notification_preferences`](`../architecture/15-bildirim-ayar-ekrani.md`) matris ekranından scope (workspace/board/card) bazında veya `push_enabled=false` ile tüm push'u kapatır.

| Önceki davranış | Yeni davranış |
|---|---|
| `pushByType` listesi 5 tip explicit kontrol (`card_assigned`, `mention`, `due_approaching`, `due_overdue`, `attachment_added`) | `pushByType = true` her tip için (sade — açık alt-küme yok) |
| Kapsam dışı tipler hiç push üretmez | Tüm tipler default push üretir, `push_enabled` (preference) opt-out kapısı |
| `member_removed` / `board_invitation` / `workspace_invitation` / `board_access_requested` / `board_member_added` push'sız | Bu beşi de push'a gider |
| Granular kart aksiyonları (`card_moved` / `_archived` / `_completed` / `_due_changed` / `_cover_changed` / `_member_removed` / `_renamed` / `_description_changed` / `_label_added` / `_label_removed`) yalnız in-app | Push'a da gider |
| Checklist aksiyonları (`checklist_created` / `_item_added` / `_item_removed` / `_item_completed`) yalnız in-app | Push'a da gider |
| `comment_reply` / `comment_updated` / `comment_deleted` yalnız in-app | Push'a da gider |
| `attachment_removed` yalnız in-app | Push'a da gider |

Gerekçe: Kullanıcı şikayeti "iPhone bildirim merkezinde sadece atama + mention + son tarih görüyorum; oysa karta yapılan diğer aksiyonları (move, label, complete, member değişimi) anında görmek istiyorum". Bildirim ayar matrisi (Faz 10C-D-E, [DEM-133](https://linear.app/demirkol/issue/DEM-133)) zaten her tipi tek tek toggle eden satıra sahip — opt-out yolu açık. Gürültü artışı endişesi: kullanıcı tek tıkla scope susturabilir ([`docs/architecture/15-bildirim-ayar-ekrani.md`](../architecture/15-bildirim-ayar-ekrani.md) matris UI).

**Push'sız kalanlar (mantıken anlamlı değil):**
- `watched_activity` — DEM-152 sonrası hiç üretilmiyor (fallback enum değeri), pickChannels'tan asla geçmez.
- `report_scheduled_ready` — worker direkt outbox'a yazar, pickChannels devrede değil; kendi kanal seti var (in_app + push).

**Email davranışı değişmedi** — heavy-touch tipler (`card_assigned`, `mention`, `due_overdue`, davetler, `member_removed`, `board_access_requested`, `board_member_added`) opt-in default; diğerleri email'e gitmez. Email kapsamı genişletmek istenseydi ayrı tartışma — bu revizyon **yalnız push**.

**Mute-bypass değişmedi:** `mention` + `board_invitation` + `workspace_invitation` her zaman geçer (kullanıcı tam mute'ta olsa bile). Diğer tipler `mute_level=all` veya `mention_only` ayarına tabidir.

**Mobile değişikliği yok:** Push expansion backend-only (`packages/api/src/lib/notification-rules.ts`). Mevcut mobile push handler tüm tipleri gösterir; yeni `eas build` veya OTA gerekmez — yalnız API + worker Dokploy redeploy.

## Genel kurallar

- **Actor self-skip:** Actor'ın kendisine bildirim **gönderilmez** (kendi yaptığın işten bildirim almazsın).
- **Sistem (aktörsüz) bildirimler:** Due-date scheduler kaynaklı `due_reminder_1d` / `due_reminder_1h` / `due_overdue` bildirimlerini bir kullanıcı tetiklemez — bunların **aktörü yoktur**. `notification_outbox` payload'ları `actorName` taşımaz; in-app bildirim merkezi bu satırlarda aktör adı **prefix'i** veya kullanıcı avatarı göstermez (avatar yerine tipin saat ikonlu sistem rozeti çizilir). Push/e-posta şablonları da aktörsüz cümle kurar. Karşılaştırma: davet/atama/yorum gibi olaylar aktörlüdür ve satır `<aktör adı> <özet>` kalıbıyla çizilir. Sistem bildiriminin payload'u kart başlığını (`cardTitle`) taşımalıdır — aksi halde özet "bu kart" fallback'ine düşer.
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
- `board.access_requested` — cooldown'a tabi değil (DEM-154; her talep ayrı kişi + ayrı aksiyon, collapse edilmemeli).
- `board.member_added` — cooldown'a tabi değil (DEM-175; her ekleme ayrı pano erişimi, 60 sn içinde ikinci ekleme collapse edilmemeli).
- `due_reminder_*` — scheduler zaten dedupe yapıyor (`scheduled_at` + tip + card_id).

## Tercihler ve bastırma (`notification_preferences`)

Tercihler workspace / board / card seviyesinde tutulur (`user_id, workspace_id?, board_id?, card_id?, mute_level, mention_only, push_enabled, email_enabled`). Daha dar kapsam (card) daha geniş kapsamı (board, workspace) override eder.

- **mute_level:** o kapsamdaki bildirimleri kıs/sustur. Tam mute'ta bile **mention** ve **doğrudan davet** geçer.
- **mention_only:** o kapsamda yalnızca mention bildirimleri gelir.
- **push_enabled / email_enabled:** ilgili kanalı aç/kapat (in-app her zaman üretilir; sadece push/email teslimi tercihe bağlı).
- **mute_until** (Faz 10H — DEM-142): kart-scope satırında geçici snooze. `> NOW()` iken `mute_level='all'` davranışı uygulanır (mute-bypass tipler hâlâ geçer); süresi dolunca otomatik açılır, satır audit için silinmez. Yalnız kart kapsamında set edilir; üst kapsam satırlarında değer tutulsa bile rule engine yalnız kart kapsamı dahilinde dikkate alır (narrowest-scope-wins kart satırını seçer).
- Watcher'lık otomatik kazanılabilir (örn. karta yorum yapınca veya atanınca) ama kullanıcı kartı "unwatch" edebilir.

**Faz 6 kapsamı:** tablo + rule engine + outbox + worker hattı hazır; **kullanıcı arayüzü (tercih ekranı) Faz 6'da yok** — varsayılan tercihler (in-app her zaman + push/email opt-in + global default açık) ile çalışır. **Faz 10'da implement edilir** ([DEM-133](https://linear.app/demirkol/issue/DEM-133); `notifications.preferences.*` tRPC procedure'leri Faz 10B, UI Faz 10C-10E, gelişmiş özellikler 10F/G/H). Tasarım anatomisi → [`../architecture/15-bildirim-ayar-ekrani.md`](../architecture/15-bildirim-ayar-ekrani.md); backend procedure imzaları → [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) "Notification preferences API".

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

**Bu fazda implement edilmez (sonraki turlara aktarıldı):**

- **Notification tercih/ayarlar ekranı UI** → **Faz 10** ([DEM-133](https://linear.app/demirkol/issue/DEM-133)). Tablo + rule engine + outbox + worker hattı Faz 6'da hazır; `notifications.preferences.*` tRPC procedure'leri Faz 10B, UI Faz 10C-10E. Tasarım → [`../architecture/15-bildirim-ayar-ekrani.md`](../architecture/15-bildirim-ayar-ekrani.md).
- **Email digest (saatlik/günlük özet)** → Faz 10G ([DEM-141](https://linear.app/demirkol/issue/DEM-141)). `notification_preferences.email_mode` enum + `notification-email-digest` worker job.
- **Quiet hours (sessiz saatler)** → Faz 10F ([DEM-140](https://linear.app/demirkol/issue/DEM-140)). `notification_preferences` üstüne `quiet_from`/`quiet_to`/`quiet_timezone` + worker filter.
- **Snooze (kart bazında geçici sustur)** → Faz 10H ([DEM-142](https://linear.app/demirkol/issue/DEM-142)). `notification_preferences.mute_until` + kart detay UI dropdown.
- **Yeni cihazda oturum güvenlik maili** → Faz 10I ([DEM-143](https://linear.app/demirkol/issue/DEM-143)). Notification outbox'tan bağımsız (Better Auth login hook).
- Slack/Teams entegrasyonu — açıkça istenmeden açılmaz.
- Notification rich content (action buttons, deep link payload zenginleştirme) — Faz 11+ / ayrı iş.
- Mobile push gerçek cihaz testi — Faz 7.
- Search index notification (kim hangi içerikte arama yapabilir?) — Faz 6.5.

## Bilinen açıklar (Faz 10A — DEM-135'te kapanır)

Faz 6A bazı mutation'larda `activity_events` insert ediyor ama `dispatchNotificationsForActivity(tx, activityEvent)` çağrısı **eksik kaldı**. Rule engine bu activity tiplerini destekliyor ya da kolay desteklenebilir; çağrı düşmediği için kullanıcı için "sessiz" UX yaşanıyor. Faz 10A bu 5 boşluğu kapatır.

| Mutation | Activity tipi | Şu an | Olması gereken (Faz 10A) | Notification tipi |
|----------|---------------|-------|--------------------------|-------------------|
| `card.update` (cover color) | `card.cover_changed` / `card.cover_cleared` | activity var, dispatch yok | watcher'lar in-app | `watched_activity` |
| `card.update` (cover image) | `card.cover_image_changed` / `card.cover_image_cleared` | activity var, dispatch yok | watcher'lar in-app | `watched_activity` |
| `card.members.remove` | `card.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app (karta erişimi kaybetti) | `watched_activity` |
| `board.members.remove` | `board.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app + email | yeni `member_removed` |
| `board.members.updateRole` | `board.member_role_changed` | activity var, dispatch yok | **rolü değişen kişiye** in-app | yeni `member_role_changed` |
| `workspace.removeMember` | `workspace.member_removed` | activity var, dispatch yok | **çıkarılan kişiye** in-app + email | yeni `member_removed` |
| `workspace.updateMemberRole` | `workspace.member_role_changed` | activity var, dispatch yok | **rolü değişen kişiye** in-app | yeni `member_role_changed` |

**Permission filter istisnası:** `card.member_removed` ve `board.member_removed` özel — alıcı **artık o kaynağa erişimi yok**. Rule engine permission filter'ı (`notification-rules.ts collectRecipients`) bu kişileri normalde atar. 10A bu tipler için filter atlamalı: "karttan/board'dan çıkarıldın" bildirimi mantıken **erişim kaybedildikten sonra** gider. Implementation: tip kontrolü (`member_removed` tiplerinde recipient board/workspace üye olmasa bile geçer).

Detay akış + email template'leri → [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) "Faz 6 dispatch açıkları" bölümü.

## Test stratejisi (özet — detay Faz 6E / DEM-94)

- Notification kuralları: her activity tipi için doğru recipient + kanal mapping (Vitest unit).
- Cooldown: 60s penceresinde 2 atama → 1 notification.
- Permission: alıcı board'a erişimi yoksa bildirim üretilmez.
- Mention parser: `@user` match; `email@x` skip; aynı yorum aynı user → tek; yetkisiz user → skip.
- Due-date scheduler: mock kart + tarih → doğru reminder tipi.
- E2E (Playwright): alice/bob fixture; atama → bob bell badge artar → tıkla → mark-read.
