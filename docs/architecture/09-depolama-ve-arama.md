---
title: "09 — Depolama ve Arama"
description: "MinIO/S3 attachment akışı ve arama mimarisi."
aliases:
  - "Depolama ve Arama"
  - "Storage Search"
tags:
  - "pusula"
  - "architecture/storage"
  - "architecture/search"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
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

İki aşamalı: MVP/erken beta → **PostgreSQL full-text search**; arama önem kazanınca → self-hosted **Meilisearch**.

### MVP — PostgreSQL FTS

- Denormalize `search_documents` tablosu (şemada mevcut): `id, workspace_id, board_id, entity_type, entity_id, title, body, labels, search_vector, archived_at, updated_at`.
- `tsvector` kolonu + GIN index + bakım trigger'ı arama fazında özel bir migration ile eklenir.
- Board/card/comment/label metinleri bu tabloya yazılır; kart silme/arşivleme `search_documents` durumunu günceller.
- Sonuçlar workspace/board permission filtresinden geçirilir (bkz. [`../domain/06-arama-kapsami.md`](../domain/06-arama-kapsami.md)).

### Meilisearch'e geçiş şartları

Typo tolerance bekleniyorsa · instant search UX merkezine giriyorsa · facet/filter ihtiyacı
artıyorsa · ranking PostgreSQL'de fazla manuel hale geliyorsa · search yükü ana PostgreSQL'i
etkiliyorsa. Entegrasyon: `DB transaction → search_outbox → worker → Meilisearch index update;
client → tRPC search procedure → permission scope → Meilisearch query → güvenlik filtresi`.

OpenSearch/Elasticsearch bu fazda **önerilmez** (operasyon maliyeti yüksek); ağır arama
analitiği gerekirse tekrar değerlendirilir. Typesense iyi bir alternatif; self-hosted basitlik
önceliği nedeniyle ileri aşama varsayılanı Meilisearch.
