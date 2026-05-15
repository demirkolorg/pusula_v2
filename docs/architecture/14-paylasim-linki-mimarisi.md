---
title: '14 — Kart Paylaşım Linki Mimarisi'
description: 'Token tabanlı, hesap gerektirmeyen kart paylaşım linki için veri modeli, API yüzeyi, public endpoint, misafir yorum akışı ve güvenlik kontrolleri.'
aliases:
  - 'Paylaşım Linki Mimarisi'
  - 'Card Share Link Architecture'
  - 'Misafir Erişim Mimarisi'
tags:
  - 'pusula'
  - 'architecture/share-links'
  - 'security'
type: 'architecture'
axis: 'architecture'
status: 'draft'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-15
---

# 14 — Kart Paylaşım Linki Mimarisi

> Eksen: **tasarım / teknik** — token üretimi, tablo şeması, public HTTP endpoint, misafir yorum yazımı, rate limit. İş kuralları (kim oluşturabilir, misafir ne görür, mention davranışı, bildirim) → [`../domain/08-paylasim-linki-kurallari.md`](../domain/08-paylasim-linki-kurallari.md).

## Yerleştirme

Paylaşım linki iki katmanda yaşar:

```txt
yönetim (admin/member)
  → tRPC: share.create / share.revoke / share.list  (cardProcedure üstünde)

misafir (anonim)
  → Hono public endpoint: GET /share/:token, POST /share/:token/comments
  (tRPC dışı; ana API sözleşmesi tRPC'de kalır — bu uçlar "HTTP kabuğu" işidir)
```

Bu ayrım, [`03-backend.md`](03-backend.md) "Hono = HTTP kabuğu, tRPC = ana sözleşme" prensibiyle uyumludur. Public endpoint'ler webhook benzeri kabul edilir; tRPC contract'ı bu yola çekilmez.

## Veri modeli (Drizzle)

Yeni bir tablo eklenir; mevcut `cards` / `comments` / `activity_events` tablolarına nullable referanslar eklenir. Şema → [`04-veri-katmani.md`](04-veri-katmani.md).

### `share_links`

```txt
share_links
  id              uuid pk
  workspace_id    uuid fk → workspaces.id (cascade)
  card_id         uuid fk → cards.id (cascade)
  token_hash      text unique  -- token plain DB'de tutulmaz; hash karşılaştırılır
  token_prefix    text         -- ilk 8 karakter (UI'da maskeli görüntü için)
  created_by_id   uuid fk → users.id (set null)
  created_at      timestamptz default now()
  expires_at      timestamptz not null  -- default 90 gün
  revoked_at      timestamptz null
  revoked_by_id   uuid fk → users.id (set null)
  last_accessed_at timestamptz null
  access_count    integer default 0
```

Index önerileri:

- `share_links_card_active_idx (card_id, revoked_at)` — kart başına aktif link listesi.
- `share_links_token_hash_uq` — public endpoint lookup için.
- `share_links_workspace_idx (workspace_id, created_at)` — workspace ayar ekranı listesi (post-MVP).

### `comments` üzerine genişleme

Anonim yorumcu kayıt edildiği için `comments.author_id` **nullable** olur ve `share_link_id` referansı eklenir:

```txt
comments
  ...
  author_id        uuid fk → users.id (set null)  -- nullable
  share_link_id    uuid fk → share_links.id (set null)  -- nullable
```

Invariant (iki katman):

- **DB check constraint** (kayıt güvencesi): `NOT (author_id IS NOT NULL AND share_link_id IS NOT NULL)` — yani **en fazla biri set**; ikisi birden set olamaz. `(NULL, NULL)` durumu DB'de tolere edilir: `users.id` `set null` davranışıyla bağlı bir yorumun yazarı hesabını silerse `author_id` `NULL`'a güncellenir (`share_link_id` zaten NULL kalır) — bu UPDATE constraint'i kırmamalı.
- **Application-level Zod** (yeni satır güvencesi): yeni `INSERT`'lerde `author_id` veya `share_link_id`'den **tam biri** doldurulur — `packages/api` (9B) ve `apps/api` (9C) yazıcıları bunu garantiler. UI'da silinmiş yazar `(NULL, NULL)` "Silinmiş kullanıcı" olarak resolve edilir, yeni satır olarak üretilemez.

Düzeltme kararı: Faz 9A (kullanıcı onayı 2026-05-15) — başlangıçta önerilen tam XOR `users` `set null` davranışıyla çelişiyordu (UPDATE crash riski); constraint "at most one + Zod XOR" formuna alındı.

### `activity_events` üzerine genişleme

Aynı kompozisyon `activity_events` için de geçerlidir:

```txt
activity_events
  ...
  actor_id        uuid fk → users.id (set null)  -- nullable
  share_link_id   uuid fk → share_links.id (set null)  -- nullable
```

UI'da `actor_id IS NULL AND share_link_id IS NOT NULL` ise satır "**Misafir** ..." olarak resolve edilir; `(NULL, NULL)` durumu (yazar hesabı silinmiş) "Silinmiş kullanıcı" olarak gösterilir. Bu mevcut [`05-aktivite-kurallari.md`](../domain/05-aktivite-kurallari.md) taksonomisine yeni event tipi eklemez.

Aynı "at most one + Zod XOR" disiplini `activity_events` için de geçerli (yukarıdaki `comments` paragrafıyla simetrik): DB check `NOT (actor_id IS NOT NULL AND share_link_id IS NOT NULL)`; yeni `INSERT` Zod'da tam biri set.

## tRPC API yüzeyi

`packages/api/src/routers/share.ts` — `cardProcedure` middleware üstünde (kart erişim + board rolü doğrulanır).

```txt
share.create({ cardId, expiresInDays?, clientMutationId? })
  → board admin/member only
  → token üretilir (32 byte, base64url)
  → token_hash + token_prefix DB'ye yazılır
  → response: { id, token, url, expiresAt }  -- token bir kerelik döner

share.revoke({ shareLinkId, clientMutationId? })
  → board admin or createdById === actor
  → revoked_at = now()

share.list({ cardId })
  → board member+ (viewer dahil — okuma)
  → her satır: { id, tokenPrefix, createdBy, createdAt, expiresAt, revokedAt, accessCount, lastAccessedAt }
```

`token` alanı **yalnız `share.create` cevabında** döner; sonraki list/get çağrılarında gösterilmez. UI bu tek seferi kullanıcıya net olarak belirtir ("Linki şimdi kopyalayın, daha sonra görüntülenmez").

`clientMutationId` disiplini ([`05-board-mekanigi.md`](05-board-mekanigi.md) optimistic UI bölümü) korunur.

## Public endpoint (Hono)

`apps/api/src/routes/share.ts` — tRPC değil, ham Hono route'ları.

```txt
GET /share/:token
  → token hash'le, share_links lookup
  → 404 → bilinmeyen / 410 → revoked|expired|cardArchived|cardDeleted
  → access_count++ (best-effort, async; lookup'ı bloklamaz)
  → last_accessed_at güncellenir
  → response: kart snapshot'ı (kart, checklist, yorumlar, etiketler, üyeler — okuma listesi)

POST /share/:token/comments
  → token hash'le, share_links lookup, geçerlilik kontrolü
  → input: { body: TiptapJSON }  -- mention parse edilmez (domain karar)
  → tek transaction:
      INSERT comments (author_id=NULL, share_link_id=<id>, ...)
      INSERT activity_events (actor_id=NULL, share_link_id=<id>, type='comment.created', ...)
      INSERT realtime_events (envelope, actor_id=NULL)  -- mevcut outbox
      INSERT notification_outbox (assignee/watcher havuzu)
  → response: { id, createdAt }
```

Headers ve davranış:

- **CORS**: public endpoint kontrollü açıktır; web origin'i + opsiyonel "tüm origin" politikası (paydaş kendi e-posta uygulamasından açabilir).
- **Cache-Control**: `private, no-store` — paylaşım payload'ı browser disk cache'ine düşmez.
- **No referrer**: response header'ı `Referrer-Policy: no-referrer`; paydaş başka linke tıklarsa Pusula URL'i sızmasın.
- **HTML wrapper yok**: bu endpoint JSON döner; web tarafında `apps/web/src/app/share/[token]/page.tsx` SSR olur ve API'yi çağırır. Web sayfası noindex/nofollow header'ı taşır.

## Token üretimi & doğrulama

- **Üretim**: `crypto.randomBytes(32)` → base64url encode (43 karakter). URL'de görünür kısım budur.
- **Saklama**: DB'de `token_hash` (SHA-256 veya argon2) tutulur; plain token tekrar elde edilemez.
- **Lookup**: gelen token hash'lenir → `WHERE token_hash = $1 LIMIT 1`. Sabit zamanlı eşitlik için DB karşılaştırması yeterli (token uzunluğu sabit).
- **Format**: `token_prefix = ilk 8 karakter` UI'da "ab12cd34… (90 gün geçerli)" benzeri görünüm için saklanır.

## Permission enforcement

| Aksiyon                       | Yetki                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `share.create`                | Kart board'unda admin veya member ([`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)) |
| `share.revoke`                | Board admin **veya** `createdById === ctx.session.userId`                                                                |
| `share.list`                  | Board member+ (viewer dahil — okuma)                                                                                     |
| `GET /share/:token`           | Token geçerli + kart aktif (arşiv/silinmiş değil)                                                                        |
| `POST /share/:token/comments` | Token geçerli + kart aktif + body validasyonu (Zod, Tiptap JSON şeması)                                                  |

Public endpoint **session check yapmaz**; kontrol edilen tek şey token + kart durumudur. Yetki kararı linki üreten kullanıcının üretim anındaki yetkisine dayanır; sonradan yetki kaybedilirse mevcut linkler `share_links` invariant'ı ile iptal edilir ([`../domain/08-paylasim-linki-kurallari.md`](../domain/08-paylasim-linki-kurallari.md) "Otomatik geçersiz olma durumları").

## Rate limit ve abuse koruması

Hono rate limit middleware ([`10-platform.md`](10-platform.md)) public endpoint'lere uygulanır:

- `GET /share/:token` → IP başına dakikada 60 istek (cache friendly).
- `POST /share/:token/comments` → IP başına dakikada 6 istek (anti-spam).
- Token başına başarısız lookup'lar (`404`) için ayrı sayaç tutulmaz; brute-force token uzunluğu nedeniyle (256-bit entropy) maliyetlidir.
- Yorum body büyüklüğü sınırı (örn. 10KB Tiptap JSON, parametre).
- Future: CAPTCHA gereksinimi şu an yok; kötüye kullanım gözlemlenirse `share_links.requires_captcha` kolonu eklenir.

## Realtime davranışı

Misafir yorumu, mevcut yorum publish akışıyla aynıdır ([`05-board-mekanigi.md`](05-board-mekanigi.md) realtime bölümü):

- `realtime_events` outbox'a yazılır (aynı transaction'da, [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) outbox sweeper picksiyle).
- Worker `card:{cardId}` ve `board:{boardId}` room'larına publish eder.
- Envelope `actorId = NULL` taşır; `payload.shareLinkId` doldurulur.
- Misafir Socket.IO'ya **bağlanmaz** ([`../domain/08-paylasim-linki-kurallari.md`](../domain/08-paylasim-linki-kurallari.md) — misafir realtime almaz).

## Bildirim akışı

`POST /share/:token/comments` request handler'ı içinde **direkt bildirim göndermez**; mevcut outbox disiplini ([`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md)) korunur:

```txt
public POST → comments + activity_events + notification_outbox (tek transaction)
  → worker (pusula-notifications)
  → in-app + push + email fan-out
  → actor "Misafir" olarak template'e geçer
```

`notification_outbox` worker'ı, `actor_id IS NULL AND share_link_id IS NOT NULL` durumunu görüp template renderer'da actor adını "Misafir" olarak doldurur. Mention parse edilmez ([`../domain/08-paylasim-linki-kurallari.md`](../domain/08-paylasim-linki-kurallari.md)) → mention notification üretilmez.

## UI dokunuşu (özet)

Detay → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) (paylaşım linki UI bölümü ileride eklenecek). Kabaca:

- **Kart detay modalında** "Paylaş" aksiyonu ([`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) sağ panel) → modal açılır: süre seçimi (7/30/90 gün), oluştur. Cevap olarak link ve "Şimdi kopyala" gösterilir.
- **Aktif paylaşımlar** sekmesi: link prefix, oluşturan, süre, erişim sayısı, revoke butonu.
- **Misafir sayfası** (`/share/[token]`): Pusula app shell'i değil; sade bir okuma görünümü + yorum yazma alanı (Tiptap, mention disabled). Üst bilgide "Bu kart sizinle paylaşıldı" + workspace adı + kartı paylaşan kişinin adı.

## Kapsam dışı (V1)

- Liste / board paylaşımı (yalnız kart).
- Parola koruması (token tek yetki).
- Misafir attachment yükleme (sadece indirme).
- Misafir mention parsing.
- Misafir checklist toggle.
- Misafir realtime canlı güncelleme.
- Cross-workspace paylaşım.
- Gelişmiş audit (per-IP geçmiş, GeoIP).

Bunlar [`../domain/08-paylasim-linki-kurallari.md`](../domain/08-paylasim-linki-kurallari.md) "Etkileşim sınırları" tablosu ile uyumludur ve gerektiğinde V2 olarak ele alınır.

## Migration etkisi

Tek migration:

1. `share_links` tablosu + indexler.
2. `comments.author_id` nullable + `comments.share_link_id` kolonu + check constraint.
3. `activity_events.actor_id` nullable + `activity_events.share_link_id` kolonu.

Mevcut satırlarda `author_id`/`actor_id` zaten dolu; `NULL`'a çevirme yok. Check constraint yeni satırlardan itibaren uygulanır.

Etkilenmeyen katmanlar: drag-drop, optimistic UI cache, search index, mevcut bildirim worker'ı (template renderer'a "Misafir" branch'i dışında dokunma yok).
