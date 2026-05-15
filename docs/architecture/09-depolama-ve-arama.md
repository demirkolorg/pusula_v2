---
title: '09 — Depolama ve Arama'
description: 'MinIO/S3 attachment akışı ve arama mimarisi.'
aliases:
  - 'Depolama ve Arama'
  - 'Storage Search'
tags:
  - 'pusula'
  - 'architecture/storage'
  - 'architecture/search'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-14
---

# 09 — Depolama ve Arama

> Eksen: **tasarım / teknik**. Attachment **iş kuralları** (MIME/boyut limiti, kim yükleyebilir)
> → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md); arama **kapsamı** (neler aranabilir, permission filtresi) → [`../domain/06-arama-kapsami.md`](../domain/06-arama-kapsami.md).

---

## 9.1 Attachment (MinIO / S3 uyumlu)

- Object storage: self-hosted **MinIO**, **S3 uyumlu SDK** üzerinden — uygulama kodu MinIO'ya özel API'lere bağlanmaz (ileride R2/S3/başka S3 uyumlu sağlayıcıya geçiş ucuz kalsın).
- DB'de yalnızca metadata: `attachments(id, card_id, uploader_id, storage_key, file_name, mime_type, size, created_at)`.
- Akış: API permission + dosya metadata doğrular → API presigned upload URL üretir → client doğrudan MinIO'ya yükler → API attachment metadata'sını persist eder → gerekirse worker thumbnail/preview veya virüs taraması yapar.
- MIME/type/size kontrolü ve kim yükleyebilir = iş kuralı → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md).

---

## 9.2 Arama

İki aşamalı: MVP/erken beta → **PostgreSQL full-text search**; arama ürünün ana etkileşimlerinden biri haline gelirse → self-hosted **Meilisearch**.

### MVP — PostgreSQL FTS (Faz 6.5)

Faz 6.5 ([DEM-56](https://linear.app/demirkol/issue/DEM-56)) dış servis eklemeden arama değerini verir. Source of truth uygulama tablolarıdır; `search_documents` yalnız denormalize okuma modelidir.

**Tablo ve index:**

```txt
search_documents:
  id uuid pk
  workspace_id uuid not null
  board_id uuid null
  card_id uuid null
  entity_type text not null
  entity_id uuid not null
  title text not null
  body text null
  labels text[] not null default '{}'
  search_vector tsvector not null
  archived_at timestamptz null
  updated_at timestamptz not null default now()
```

- Unique: `(entity_type, entity_id)`.
- Permission/scope index'leri: `(workspace_id)`, `(board_id)`, `(card_id)`.
- Arşiv/aktif sonuç filtresi: `(workspace_id, board_id, entity_type, updated_at) WHERE archived_at IS NULL`.
- FTS index: `GIN(search_vector)`.
- DEM-104 migration (`0016_dem104_search_documents_fts.sql`) Faz 0 iskeletini bu modele taşır: `search_entity_type` enum'una `list`, `card_id`, `labels text[]`, `search_vector tsvector`, GIN ve active-scope indexleri. Tablo rebuild yoktur.
- Opsiyonel erken-beta destek: `pg_trgm` extension + title trigram index yalnız kısa sorgu/fallback ihtiyacı kanıtlanırsa ayrı migration ile açılır; DEM-103 kararı PostgreSQL FTS'i ana yol yapar.

**Dil/normalizasyon kararı:**

- PostgreSQL'de yerleşik Türkçe stemming yok; Faz 6.5 `simple` text search config ile başlar.
- Uygulama helper'ı `title`, `body`, `labels` alanlarını normalize eder: null → boş string, fazla whitespace collapse, label'lar boşlukla birleştirilir.
- `search_vector` app-side SQL expression ile üretilir: title `A`, label `B`, body `C` ağırlığı. Generated column yerine helper kullanılır; çünkü entity'ler farklı tablolardan denormalize geliyor.
- İleride `unaccent` veya Meilisearch'e geçiş yalnız ölçülen ihtiyaçla açılır.

**Query:**

- `search.query` `websearch_to_tsquery('simple', query)` kullanır; syntax hatasında boş sonuç yerine kontrollü `BAD_REQUEST`/validation döner.
- Rank: `ts_rank_cd(search_vector, tsquery)` + ağırlıklar; eşitlikte `updated_at DESC`.
- Snippet: ilk sürüm sade metin context döndürür. `ts_headline` ancak XSS/HTML escaping sözleşmesi netleşirse kullanılır; UI HTML render etmez.
- Minimum query uzunluğu 2 karakterdir; UI 2 karakterden önce çağrı yapmaz, backend de aynı kuralı enforce eder.

### Index bakım akışı

Faz 6.5B ([DEM-105](https://linear.app/demirkol/issue/DEM-105)) mutation gövdelerine `search-indexer` helper'ı ekler:

```txt
domain mutation tx
  → source tablo update/insert/delete
  → activity_events / realtime_events / notification_outbox (ilgili fazlarda)
  → upsertSearchDocument(tx, entity)
  → commit
```

- Request-path helper hafif kalır: sadece değişen entity'nin search document'ını upsert/delete eder.
- Board/list/card/comment/label kapsamı: create/update/archive/delete.
- Archive: `archived_at` set edilir veya entity görünmezse search document silinir.
- Comment soft-delete: search document silinir; silinmiş yorum gövdesi index'te kalmaz.
- Reindex/backfill worker büyük veya şüpheli durumlarda tüm workspace/board için idempotent yeniden üretim yapar. Worker aynı `(entity_type, entity_id)` unique key üzerinden upsert eder.
- Search index hatası domain mutation'ını sessizce yutmaz; aynı transaction içinde beklenen index yazımı başarısızsa mutation rollback eder. Ağır reindex ayrı worker sorumluluğudur.

### Permission sınırı

Arama sonuçları her zaman query anında permission scope'undan geçer:

- `workspace_id` scope'u kullanıcının workspace üyeliğiyle doğrulanır.
- `board_id` varsa `resolveBoardAccess` / etkin board rolüyle `viewer+` erişim aranır.
- Board'a erişimi olmayan kullanıcıya sonuç satırı dönmez; "kaç sonuç vardı ama saklandı" bilgisi verilmez.
- Arşivli board/list/card varsayılan dışıdır; `includeArchived=true` yalnız erişilebilir arşivli kayıtları dahil eder.

### Meilisearch'e geçiş şartları

Typo tolerance bekleniyorsa · instant search UX merkezine giriyorsa · facet/filter ihtiyacı artıyorsa · ranking PostgreSQL'de fazla manuel hale geliyorsa · search yükü ana PostgreSQL'i etkiliyorsa.

**DEM-108 QA notu (2026-05-14):** mevcut Faz 6.5 doğrulaması küçük/orta fixture kapsamında PostgreSQL FTS ile temiz geçti; Playwright global/board search ve permission leak senaryolarında Meilisearch'e geçiş gerektiren typo/facet/latency sinyali görülmedi. Büyük dataset latency/load eşiği Faz 8 sertleştirme kapsamına bırakıldı.

Geçiş modeli: `DB transaction → search_outbox → worker → Meilisearch index update; client → tRPC search procedure → permission scope → Meilisearch query → güvenlik filtresi`.

OpenSearch/Elasticsearch bu fazda **önerilmez** (operasyon maliyeti yüksek); ağır arama analitiği gerekirse tekrar değerlendirilir. Typesense iyi bir alternatif olabilir; self-hosted basitlik önceliği nedeniyle ileri aşama varsayılanı Meilisearch.
