---
title: '06 — Arama Kapsamı'
description: 'Aranabilir içerik ve permission filtreli arama sonuç kuralları.'
aliases:
  - 'Arama Kapsamı'
  - 'Search Scope'
tags:
  - 'pusula'
  - 'domain/search'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-05-14
---

# 06 — Arama Kapsamı

> Eksen: **iş / domain** — _neler aranabilir, sonuçlar nasıl filtrelenir_. Arama altyapısı
> (PostgreSQL FTS → Meilisearch, `search_documents` şeması, index bakım akışı) → [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md).

## Faz 6.5 kapsamı

Faz 6.5 ([DEM-56](https://linear.app/demirkol/issue/DEM-56)) Pusula'nın ilk arama sürümüdür: kullanıcının erişebildiği workspace/board kapsamında board/list/card/comment/label içeriklerinde PostgreSQL full-text search. Ürün davranışı iki yüzeyden gelir:

1. **Global arama:** app-shell üst barından açılır; kullanıcının erişebildiği workspace ve board'lar içinde arar.
2. **Board içi arama:** aktif board kapsamıyla sınırlıdır; sonuçlardan board ekranındaki ilgili karta/listeye veya kart modalına gidilir.

Kapsam dışı: Meilisearch/OpenSearch, attachment içeriği/OCR, mobil arama UI, fuzzy typo tolerance ve ağır facet arayüzü.

## Aranabilir içerik

| Entity    | Aranan alan(lar) | Sonuç hedefi                     | Varsayılan arşiv davranışı                    |
| --------- | ---------------- | -------------------------------- | --------------------------------------------- |
| Workspace | ad               | workspace sayfası                | Kapsam filtresi; doğrudan sonuç olarak dönmez |
| Board     | başlık           | board sayfası                    | Arşivli board varsayılan dışı                 |
| List      | başlık           | board sayfası + liste bağlamı    | Arşivli liste varsayılan dışı                 |
| Card      | başlık, açıklama | board sayfası + `?card=<cardId>` | Arşivli kart varsayılan dışı                  |
| Comment   | içerik           | ilgili kart modalı               | Silinmiş yorum dışı                           |
| Label     | ad               | board sayfası + label bağlamı    | Arşivli board/list/card filtresinden geçer    |

`search_documents` tablosu bu metinleri denormalize tutar: `entity_type`, `entity_id`, `workspace_id`, `board_id`, opsiyonel `card_id`, `title`, `body`, `labels`, `search_vector`, `archived_at`, `updated_at`. Bir entity için tek aktif search document bulunur; entity arşivlenirse `archived_at` set edilir, hard-delete veya soft-delete görünmez hale gelirse satır kaldırılır ya da `archived_at` ile filtre dışına alınır.

## Sonuç kuralları

1. **Permission filtresi zorunlu:** Bir kullanıcı yalnızca erişebildiği workspace ve board'lardaki sonuçları görür. Filtre query zamanında server-side uygulanır; index'te ham metin tutulsa bile sonuçlar permission scope'undan geçirilir. Workspace owner/admin tüm workspace board'larını, workspace guest/member kendi erişebildiği board'ları görür. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).
2. **Arşivli kayıtlar varsayılan dışı:** Arşivli board/list/card sonuçlara dahil edilmez. UI açıkça "arşivlenenleri de ara" seçeneği verirse `includeArchived=true` ile dahil edilir; yine de permission filtresi değişmez.
3. **Silinmiş/soft-deleted içerik:** `comment.deleted_at IS NOT NULL` içerik aramaya girmez. Silinmiş yorum için eski gövde index'te kalamaz.
4. **Kapsam daraltma:** İlk sürümde `workspaceId`, `boardId`, `entityTypes[]`, `includeArchived` ve `limit` desteklenir. Label/assignee/due-date facet'leri Meilisearch'e geçiş veya ileri arama fazına bırakılır.
5. **Sıralama:** Başlık eşleşmesi gövde eşleşmesinden yüksek ağırlıklıdır; kart/board başlıkları yorum gövdesinden önce gelir. Aynı rank'te daha yeni `updated_at` önce gelir.
6. **Snippet:** Sonuç başlığı, kısa bağlam metni ve entity tipi döner. Snippet HTML taşımaz; highlight client tarafında güvenli string parçalarıyla yapılır veya ilk sürümde sade metin gösterilir.
7. **Minimum sorgu:** Boş/tek karakterli sorgu server tarafında reddedilir veya boş sonuç döner. UI 2 karakterden önce API çağırmaz.

## Query davranışı

- Kullanıcı "kart başlığı" veya "yorum içeriği" aradığında tek birleşik sonuç listesi döner; UI sonuçları entity tipine göre gruplayabilir.
- Global aramada workspace bağlamı görünür olmalıdır: sonuç satırında workspace ve board adı gösterilir.
- Board içi aramada board adı tekrarlanmaz; liste/kart/yorum bağlamı gösterilir.
- Kart veya yorum sonucu tıklandığında hedef URL `/{workspace}/boards/{boardId}?card={cardId}` desenine çıkar; kart modalı mevcut `?card=` davranışıyla açılır.
- Label sonucu board ekranına gider ve mümkünse board içi label filtresini aktive edecek metadata taşır; bu yoksa yalnız board'a yönlendirir.

## Tutarlılık

Search index uygulama verisinin türevidir; source of truth değildir. Create/update/archive/delete mutation'ları index'i mümkün olduğunca aynı transaction içinde günceller. Ağır backfill/reindex işi worker'da idempotent çalışır ve eksik/bozuk search document'ları yeniden üretir. Index tutarsızlığı ürün verisini bozmaz, ancak arama sonucu eksikliği olarak ele alınır ve DEM-105/DEM-108 test kapsamına girer.
