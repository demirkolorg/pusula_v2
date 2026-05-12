# 04 — Bildirim Kuralları

> Eksen: **iş / domain** — _hangi olay hangi bildirimi üretir, kime, hangi kanaldan, ne zaman
> bastırılır_. Altyapı/mekanizma (outbox, worker, Expo/Resend teslimi) → [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md).

## Kanallar

| Kanal | Açıklama |
| --- | --- |
| In-app notification | `notifications` tablosu; notification center'da gösterilir |
| Realtime badge | Okunmamış sayısı değişince socket ile badge update |
| Mobile push | Expo Notifications (worker üzerinden) |
| Email | Resend — transactional + ileride digest |
| Slack/Teams | Yalnızca açıkça istenirse (ileride) |

## Bildirim kaynakları (event → bildirim)

| Domain olayı | Bildirim kimde? | Varsayılan kanal(lar) |
| --- | --- | --- |
| Karta atanma (assignee eklendi) | atanan kullanıcı | in-app + (tercihse) push/email |
| Mention (`@kullanıcı` yorum/açıklamada) | mention edilen | in-app + push (mention her zaman önceliklidir — "mention-only" mute'ta bile gelir) |
| Yoruma cevap / izlenen kartta yeni yorum | yorum sahibi + kart watcher'ları | in-app + (tercihse) push |
| Due date yaklaşıyor | assignee + watcher'lar | in-app + (tercihse) push |
| Due date geçti (overdue) | assignee + watcher'lar | in-app + (tercihse) push/email |
| Board daveti | davet edilen | in-app + email |
| Workspace daveti | davet edilen | in-app + email |
| İzlenen kart/liste'de aktivite (taşıma, güncelleme) | watcher'lar | in-app + (tercihse) push |
| Checklist item tamamlandı (izlenen kartta) | watcher'lar | in-app |

Notlar:

- Actor'ın kendisine bildirim **gönderilmez** (kendi yaptığın işten bildirim almazsın).
- Aynı domain event'inden aynı alıcıya **tek** bildirim üretilir (dedup, `event_id` üzerinden).
- Bir alıcı birden fazla rolle (örn. hem assignee hem watcher) ilgiliyse en kapsamlı tek bildirim üretilir, çoğaltılmaz.

## Bastırma ve tercihler (`notification_preferences`)

Tercihler workspace / board / card seviyesinde tutulur (`user_id, workspace_id?, board_id?,
card_id?, mute_level, mention_only, push_enabled, email_enabled`). Daha dar kapsam (card) daha
geniş kapsamı (board, workspace) override eder.

- **mute_level:** o kapsamdaki bildirimleri kıs/sustur. Tam mute'ta bile **mention** ve **doğrudan davet** geçer.
- **mention_only:** o kapsamda yalnızca mention bildirimleri gelir.
- **push_enabled / email_enabled:** ilgili kanalı aç/kapat (in-app her zaman üretilir; sadece push/email teslimi tercihe bağlı).
- Watcher'lık otomatik kazanılabilir (örn. karta yorum yapınca veya atanınca) ama kullanıcı kartı "unwatch" edebilir.

## Sıralama / öncelik

`mention` ve `davet` her zaman en yüksek öncelik; mute/mention-only ayarlarından etkilenmez.
Diğer bildirimler tercih kapsamı ve mute seviyesine tabidir.
