---
title: '08 — Kart Paylaşım Linki Kuralları'
description: 'Kart için zaman sınırlı, hesap gerektirmeyen paylaşım linki davranışı; misafir izleyici/yorum kuralları.'
aliases:
  - 'Paylaşım Linki Kuralları'
  - 'Card Share Link Rules'
  - 'Misafir Erişim Kuralları'
tags:
  - 'pusula'
  - 'domain/share-links'
type: 'domain'
axis: 'domain'
status: 'draft'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-05-15
---

# 08 — Kart Paylaşım Linki Kuralları

> Eksen: **iş / domain** — _kim link oluşturabilir, link sahibi ne görür/yapar, hangi olay ne tetikler_. Teknik mimari (token üretimi, tablo, public endpoint, rate limit) → [`../architecture/14-paylasim-linki-mimarisi.md`](../architecture/14-paylasim-linki-mimarisi.md).

## Amaç

Pusula'da yetkilendirme **workspace + board** seviyesinde tutulur ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md)). Bazı durumlarda dış bir paydaşa (müşteri, danışman, tedarikçi) **tek bir karta** erişim verilmek istenir; paydaşın Pusula hesabı yoktur ve workspace üyesi olarak eklenmesi orantısızdır.

Bu kural seti, kart-bazlı ACL açmadan ve paydaşa hesap zorunluluğu getirmeden bu ihtiyacı karşılar.

## Kapsam

- **Sadece kart** paylaşılabilir. Liste veya board paylaşımı bu sürümde yoktur.
- Cross-workspace paylaşım yoktur; link, kartın bulunduğu workspace bağlamında üretilir.
- Bu kural, mevcut **kart bazlı ACL eklenmeyecek** kararını ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) — Yetki kademeleri) bozmaz; misafir kullanıcı sistemde **user** olarak görünmez.

## Kim oluşturabilir / iptal edebilir

- **Oluşturma:** Kartın bulunduğu board'da **admin** veya **member** olan kullanıcı paylaşım linki üretebilir; **viewer** üretemez. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).
- **İptal (revoke):** Linki oluşturan kullanıcı veya kartın bulunduğu board'da **admin** olan herkes iptal edebilir.
- **Listeleme:** Bir kart için aktif/pasif linkler kartın board'unda member+ olan herkes tarafından görülür (kim oluşturdu, ne zaman dolar, kaç kez açıldı).

## Link davranışı

- Link, tahmin edilemez bir **token** içerir; token URL'in parçasıdır. Link sahibi ek bir kimlik doğrulaması yapmaz.
- **Süre:** Default geçerlilik **90 gün**. Daha kısa süre seçilebilir; süresiz link verilmez.
- **Tek-tip yetki:** Sürümde tek rol vardır — **misafir izleyici (guest viewer)**. İleride `commenter` ayrımı yapılırsa bu dosya güncellenir; **anonim yorum** ([§ Misafir yorum yapma](#misafir-yorum-yapma)) viewer rolünün doğal parçasıdır, ayrı rol değildir.
- **İptal anında geçerlidir.** Revoke edilmiş link bir daha açılamaz.
- **Otomatik geçersiz olma durumları:**
  - Kart silinirse → link 410 davranışı.
  - Kart arşivlenirse → link 410 davranışı (arşiv sırasında misafir göremez).
  - Kart başka workspace'e taşınırsa (post-MVP cross-workspace move) → link iptal edilir.
  - Linkin oluşturulduğu kullanıcı workspace'ten çıkarılırsa → linkler iptal edilir.
- **Parola yoktur.** Token tek başına yeterlidir (karar 2026-05-15).

## Misafir görme yetkisi

Misafir, açtığı kart bağlamında şunları **görür**:

- Kartın başlığı, açıklaması (Tiptap), due date, completed durumu, kapak rengi/görseli.
- Checklist'ler ve item'ları (read-only).
- Yorumlar (kendi misafir yorumları dahil).
- Attachment listesi ve indirme (kısa süreli presigned URL ile, bkz. [`07-ek-kurallari.md`](07-ek-kurallari.md)).
- Etiket adları ve renkleri (kart üzerine eklenmiş olanlar).
- Kart üyeleri **adı + avatarı** (assignee/watcher listesi); e-posta veya başka iletişim bilgisi gösterilmez.

Misafir, açtığı kart bağlamında şunları **görmez**:

- Board'un kendisi, board'daki diğer kartlar, listeler.
- Workspace adı dışındaki workspace içeriği.
- Activity feed (kart geçmişi misafire gösterilmez).
- Kart üyelerinin e-posta adresleri veya profil ayrıntıları.
- Aynı kartın diğer paylaşım linkleri.

## Misafir yorum yapma

- Misafir, kartta **yorum bırakabilir**.
- Yorumun yazarı her zaman sabit "**Misafir**" etiketiyle gösterilir; misafir kendi adını giremez.
- Yorum içinde **mention çalışmaz**: misafir `@kullanıcı` yazabilir ama bu ne parse edilir, ne notification üretir; düz metin olarak kalır (karar 2026-05-15).
- Misafir, **var olan yorumları silemez veya düzenleyemez**, kendi yazdığı yorumu da düzenleyemez/silemez.
- Misafir checklist toggling, etiket atama, üye atama, due date değişikliği yapamaz; yalnızca yorum bırakabilir.

## Activity yazımı

Misafir bir yorum bıraktığında activity event üretilir ([`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) — `comment.created`):

- Event'in `actor` referansı **NULL user** olur (misafir Pusula kullanıcısı değildir).
- Event, hangi paylaşım linki üzerinden geldiğini takip etmek için **`shareLinkId`** referansı taşır.
- Aktivite akışı UI'sında bu event "**Misafir** yorum yazdı" olarak gösterilir; gerekiyorsa link sahibinin adı tooltip ile verilir ("Ahmet'in paylaşım linkinden").

Activity satırı silinmez; link iptal edilse bile geçmiş yorumlar ve activity korunur.

## Bildirim davranışı

Misafir yorumu, **kart üyelerine (assignee/watcher) normal yorum bildirim akışını** tetikler ([`04-bildirim-kurallari.md`](04-bildirim-kurallari.md)):

- Aktör NULL olduğu için `actor self-skip` uygulanmaz; tüm assignee/watcher havuzu adaydır.
- Bildirim metninde aktör "**Misafir**" olarak görünür ("Misafir, X kartına yorum yazdı").
- Mention notification yoktur ([§ Misafir yorum yapma](#misafir-yorum-yapma)).
- Misafir hiçbir bildirim almaz (linki kim açtı diye iz tutulmaz; bkz. [`../architecture/14-paylasim-linki-mimarisi.md`](../architecture/14-paylasim-linki-mimarisi.md)).
- Linki oluşturan kullanıcı, kendi link'inden gelen yorumlar için ek bir özel bildirim almaz; sadece normal watcher/assignee ise normal kuralla alır.

Notification preference hiyerarşisi (workspace > board > kart) misafir yorumlarına da uygulanır; kullanıcı kendi tercihiyle bu yorumları sessize alabilir.

## Realtime davranışı

- Misafir, Socket.IO board/card room'larına **katılmaz**. Bkz. [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md). Görüntü güncellemesi için sayfayı yenilemesi gerekir; UI bunu açıkça belirtir.
- Misafir yorumu, normal kart yorumu gibi `card:{cardId}` ve `board:{boardId}` room'larına publish edilir; mevcut üyeler canlı görür.

## Etkileşim sınırları (özet)

| Aksiyon | Misafir |
|---|---|
| Kart içeriğini görme | ✅ |
| Yorum bırakma | ✅ (yazar = "Misafir") |
| Mention | ❌ (parse edilmez, notification üretmez) |
| Yorum silme/düzenleme | ❌ |
| Checklist toggle | ❌ |
| Etiket / üye / due date değişikliği | ❌ |
| Attachment indirme | ✅ (presigned URL) |
| Attachment yükleme | ❌ |
| Realtime canlı güncelleme | ❌ (manuel refresh) |
| Activity feed görüntüleme | ❌ |

## Yan etki & invariant'lar

- Bir kartın aynı anda birden fazla aktif paylaşım linki olabilir; her biri ayrı izlenir, ayrı iptal edilebilir.
- Link iptal edildikten sonra önceki misafir yorumları silinmez; yazar "Misafir" olarak kalır.
- Paylaşım linki oluşturma/iptal/görüntülenme **kart paylaşım** kapsamına ait activity event üretmez (gürültü azaltma kararı 2026-05-15); audit ihtiyacı `share_links` tablosunun kendi alanları (`createdAt`/`createdById`/`revokedAt`/`revokedById`/erişim sayacı) üzerinden karşılanır.
- Misafir, mevcut **kart bazlı ACL yok** prensibini bozmaz; misafir bir kullanıcı değil, bir token sahibidir.
