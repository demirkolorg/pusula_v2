---
title: '10 — Bot ve API Key Kuralları'
description: 'API key ile kimliklenen bot aktörü: kim key üretebilir, botun rolü ve yetkileri, revoke/expiry semantiği, bota bildirim gitmez kuralı.'
aliases:
  - 'Bot ve API Key Kuralları'
  - 'Bot Actor Rules'
  - 'API Key Domain Rules'
tags:
  - 'pusula'
  - 'domain/bot-api-key'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-07-13
---

# 10 — Bot ve API Key Kuralları

> Eksen: **iş / domain** — _kim API key üretebilir, bot ne yapabilir/yapamaz, hangi olay ne tetikler_. Teknik mimari (token üretimi, `api_keys` tablosu, `/api/v1` REST yüzeyi, rate limit) → [`../architecture/21-public-api-ve-bot-erisimi.md`](../architecture/21-public-api-ve-bot-erisimi.md).

## Amaç

Bir panonun sahibi, panonun içerik işlemlerini programatik bir aktöre (AI ajanı, otomasyon servisi) açmak ister. Pusula bunu, panoya **üye olan bir bot** ile çözer: bot bir API key ile kimliklenen bir servis hesabıdır. Kart-bazlı ACL açılmaz, yeni bir yetki modeli getirilmez — bot yalnızca panoya eklenmiş, `member` veya `viewer` rollü bir kullanıcıdır ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md)).

## Kim üretebilir / iptal edebilir

- **Üretme:** Yalnızca **board admin** bir pano için API key üretebilir. Board `member`/`viewer` ve workspace `member`/`guest` üretemez. (Workspace `owner`/`admin`, effective board admin oldukları için üretebilir.)
- **İptal (revoke):** Board admin herhangi bir key'i iptal edebilir.
- **Listeleme:** Bir panonun API key'leri (ad, prefix, rol, son kullanım, geçerlilik) board admin tarafından görülür; plain token hiçbir listede gösterilmez (yalnız üretim anında bir kez).
- **Aktif key sınırı:** Bir pano en fazla **20 aktif** (iptal edilmemiş) API key'e sahip olabilir. Her key bir bot kullanıcı + üyelik satırı doğurduğundan sınırsız üretim üyelik tablolarını şişirir; sınıra ulaşınca yeni üretim reddedilir. Bir key iptal edilince sınırdan düşer ve yer yeniden açılır.
- **Bot üyeliği yalnız key yönetiminden:** Bir botun pano/workspace üyeliği ve rolü **yalnızca** API key yönetimiyle (üretme/iptal) kurulur ve kaldırılır. İnsan üye yönetimi bir bota **dokunamaz**: bir botu `board.members.updateRole`/`remove` veya `workspace.members.updateRole`/`remove` ile rolünü değiştirmek/çıkarmak reddedilir (`FORBIDDEN`), ve bot **workspace üye listesinde görünmez** (yalnız pano API anahtarları bölümünde listelenir).

## Key rolleri

- Key oluşturulurken bir rol seçilir: **`member`** (varsayılan) veya **`viewer`**.
- **`admin` rolü yoktur** — bota pano yönetimi (ayar, üye, silme) verilmez; bu insan sorumluluğunda kalır. `admin` istenirse reddedilir.
- Botun **effective rolü = key rolü**. Botun panodaki tüm yetkisi bu rolden gelir; tüm yetki matrisi ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) Board tablosu) bot için de aynen geçerlidir.

## Bot aktörünün kimliği

- Her API key **1:1 bir bot kullanıcısına** bağlıdır. Bot, sistemde gerçek bir kullanıcı satırıdır (misafir/paylaşım linki gibi `NULL` aktör değil).
- Bot, hedef **panoya üye** (`board_members`) ve panonun **workspace'ine `guest` üye** (`workspace_members`) olarak eklenir. `guest` üyeliği yalnızca bu panoya erişimi açar; aynı workspace'teki diğer panolara erişim vermez.
- **Key başına tek pano:** bir key yalnız bir panoya kilitlidir. Birden çok pano isteyen kullanıcı pano başına ayrı key üretir; workspace-geneli key yoktur.
- Bot, aktivite akışında ve yorumlarda **kendi adıyla** (key oluşturulurken verilen ad) görünür. UI'da bot kullanıcının yanında **"Bot" rozeti** gösterilir (web). Bot adı normal `user.name`'den geldiği için mevcut aktivite/yorum render'ı kırılmaz.
- **Bilinen sınırlama (rozet ↔ revoke):** "Bot" rozeti üyelik-türevlidir. Key iptal edilince botun `board_members` satırı silindiği için, botun **geçmiş yorumları** üyelik-türevli rozeti kaybedebilir (yorum metni ve aktör adı korunur; yalnız rozet düşer). v1'de kabul edilen bir sınırlamadır.

## Botun yapabildikleri

Botun yetkisi rolünün ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md)) yetki matrisiyle **birebir aynıdır** — ayrı bir "bot yetkisi" kavramı yoktur.

- **`member` key** panonun tüm içerik işlemlerini yapabilir: liste ve kart CRUD + taşıma, checklist + madde (toggle/reorder dahil), yorum ekleme, etiket CRUD ve karta etiket/üye atama, ek yükleme, aktivite okuma.
- **`viewer` key** yalnızca **okuma** yapabilir: pano/kart/checklist/yorum/etiket/aktivite görüntüleme, ek indirme. Hiçbir mutasyon yapamaz.

## Botun yapamadıkları

Bot, rolü ne olursa olsun şunları **yapamaz**:

| Aksiyon | Neden |
| --- | --- |
| Pano yönetimi (ayar/arşiv değiştirme, üye ekle/çıkar, rol değiştir) | `admin` rolü yok; bot en fazla `member`. |
| Davet gönderme / erişim talebi | Davet/erişim yolları bot kullanıcıya kapalı. |
| Kalıcı silme (`list.delete`, `card.delete`, board silme) | Admin gerektirir; bota açılmaz (yalnızca arşivleme yapabilir). |
| Çapraz board copy/move (başka panoya kart kopyalama/taşıma) | Key tek panoya kilitli; hedef başka panoysa reddedilir. |
| Kendini karta ekleme | Self-add yasağı (DEM-298) bota da uygulanır — kart üyeliği başkası tarafından verilir. |
| Başkasının yorumunu düzenleme/silme | Yalnız kendi yorumunu düzenleyebilir/silebilir (insan `member` ile aynı). |
| Oturum açma / davet edilme / şifre sıfırlama | Bot bir makine kimliğidir; login/reset/davet yolları kapalı. |

## Bildirim davranışı

- **Bota bildirim gönderilmez.** Bir bot karta assignee/watcher yapılsa bile, alıcı bir bot ise `notification_outbox` satırı üretilmez (in-app/push/email yok). Bot bildirimleri **polling** ile takip eder (aktivite/pano okuma uçları) — bu ayrım [`../architecture/21-public-api-ve-bot-erisimi.md`](../architecture/21-public-api-ve-bot-erisimi.md)'de teknik olarak enforce edilir.
- Botun **yaptığı** aksiyonlar normal bildirim akışını tetikler: bot bir insana kart atarsa veya insanın izlediği bir kartı değiştirirse, o **insanlar** normal kuralla ([`04-bildirim-kurallari.md`](04-bildirim-kurallari.md)) bildirim alır. Bildirim metninde aktör botun adıyla görünür.
- Bildirim tercih hiyerarşisi (workspace > board > kart) değişmez; kullanıcı bot aktivitesini kendi tercihiyle sessize alabilir.

## Aktivite ve realtime yazımı

Botun her mutasyonu, normal kullanıcı mutasyonuyla **aynı** disipline uyar: domain mutasyonu + `activity_events` + `realtime_events` + (gerekiyorsa) `notification_outbox` **aynı transaction'da** yazılır ([`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)). Bot için ayrı bir "hafif yol" yoktur.

- Aktivite satırının `actor` referansı **botun kullanıcı kimliğidir** (paylaşım linkindeki `NULL actor` deseninden farklı). Aktivite akışı botun adını gösterir.
- Bota özel yeni bir activity event tipi açılmaz; bot mevcut taksonomiyi kullanır.
- Pano açık olan diğer kullanıcılar botun değişikliklerini realtime olarak görür (bot Socket.IO'ya bağlanmaz — yalnızca REST ile yazar).

## Yaşam döngüsü ve iptal (revoke)

- **Geçerlilik (expiry):** Key oluşturulurken opsiyonel bir son kullanma tarihi verilebilir; verilmezse süresizdir. Süresi dolan key **anında** reddedilir; kullanıcı yeni key üretir.
- **İptal (revoke):** Board admin bir key'i iptal edince:
  - Key **anında** erişimini kaybeder (sonraki istek reddedilir; gecikme/cache yoktur).
  - Botun `board_members` **ve** `workspace_members` üyelikleri **silinir** — bot pano/workspace üye listelerinden düşer.
  - Botun **aktivite geçmişi ve yorumları korunur**; bot kullanıcı satırı silinmez, geçmiş atıflar "bot adı" olarak kalır.
- İptal geri alınamaz; aynı key yeniden etkinleştirilemez. Kullanıcı yeni bir key üretir.

## Etkileşim sınırları (özet)

| Aksiyon | `member` bot | `viewer` bot |
| --- | --- | --- |
| Pano/kart/yorum/aktivite görüntüleme | ✅ | ✅ |
| Liste/kart oluştur/düzenle/taşı/arşivle | ✅ | ❌ |
| Checklist + madde, yorum, etiket, ek | ✅ | ❌ |
| Karta üye/etiket atama | ✅ | ❌ |
| Kendini karta ekleme | ❌ (DEM-298) | ❌ |
| Pano yönetimi / davet / kalıcı silme | ❌ | ❌ |
| Çapraz board copy/move | ❌ | ❌ |
| Bildirim alma | ❌ | ❌ |
| Oturum açma / davet edilme | ❌ | ❌ |

## Yan etki & invariant'lar

- Bot, mevcut **kart bazlı ACL yok** prensibini bozmaz; bot bir kullanıcıdır, key ise onun kimlik aracıdır.
- Tüm mevcut yetki invariant'ları bota da uygulanır: self-add yasağı (DEM-298), son board admin düşürülemez/çıkarılamaz (bot zaten admin olamaz), arşivli board/liste salt-okunur, kart ⊆ liste.board.
- Bir panonun birden fazla aktif key'i olabilir (her biri ayrı bot, ayrı izlenir, ayrı iptal edilir).
- Pano silinirse ona bağlı key'ler ve bot üyelikleri de temizlenir (cascade); bot kullanıcı satırının aktivite atıfları genel silme kurallarına tabidir.
