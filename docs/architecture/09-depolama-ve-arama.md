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
updated: 2026-05-19
---

# 09 — Depolama ve Arama

> Eksen: **tasarım / teknik**. Attachment **iş kuralları** (MIME/boyut limiti, kim yükleyebilir)
> → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md); arama **kapsamı** (neler aranabilir, permission filtresi) → [`../domain/06-arama-kapsami.md`](../domain/06-arama-kapsami.md).

---

## 9.1 Attachment (MinIO / S3 uyumlu) — Faz 11 (kart eki)

- **Object storage:** self-hosted **MinIO**, **S3 uyumlu SDK** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) üzerinden — uygulama kodu MinIO'ya özel API'lere bağlanmaz; ileride R2/S3/başka S3 uyumlu sağlayıcıya geçiş ucuz kalır. Bucket = `pusula` (default; `S3_BUCKET` env override).
- **DB metadata:** `attachments(id, card_id, board_id, uploader_id, storage_key, file_name, mime_type, size, description?, committed_at?, created_at, updated_at)`; tablo şeması, kolonlar, index'ler ve genel attachment yoluna geçiş için migration sözleşmesi → [`04-veri-katmani.md`](04-veri-katmani.md) "Faz 11 (Kart Eki)".
- **Storage key:** `boards/{boardId}/cards/{cardId}/{uuid}-{safe-fileName}` (tahmin edilemez UUID + sanitize edilmiş dosya adı; mevcut DEM-110 paterni korunur).
- **İş kuralları** (MIME allowlist, boyut limiti, kim yükleyebilir/silebilir, açıklama, önizleme) → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md). Procedure haritası → [`03-backend.md`](03-backend.md) "Faz 11 — Attachment". Activity/realtime/notification yan etkileri → [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.3 + [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) "Pusula attachment cleanup queue" + [`../domain/04-bildirim-kurallari.md`](../domain/04-bildirim-kurallari.md).

### Two-phase commit upload akışı (Faz 11A — karar 2026-05-15)

Tek-fazlı `createUpload` (DEM-110) paterni yerine **iki-fazlı initiate → upload → commit**: orphan riski sıfır, activity/realtime/notification yazımı atomic.

> **Wired (DEM-148 / Faz 11B — 2026-05-15):** Two-phase akış `packages/api/src/routers/attachment.ts`'te kodda — `attachment.initiate` draft INSERT + presigned PUT URL, `attachment.commit` tek tx idempotent (`committed_at IS NOT NULL` no-op). Güvenlik sertleştirmesi (security-review): presigned PUT URL `Content-Length` `signableHeaders` ile imzalanır — `initiate`'in `size` Zod limiti (50 MiB) artık storage katmanında da bağlayıcı; `attachment.initiate` per-user rate limit (20/60 s). `getDownloadUrl` `committed_at IS NOT NULL` filtreli (draft satıra presigned GET yok). Procedure haritası + QA özeti → [`03-backend.md`](03-backend.md) "Faz 11 — Attachment".

```txt
1. Client → API: `attachment.initiate({ cardId, fileName, mimeType, size, description? })`
   - Permission: board admin veya member; arşivli board reject; MIME allowlist + size ≤ 50 MiB validasyon
   - `attachments` INSERT (`committed_at = NULL`)  ← draft row
   - Presigned PUT URL üret (TTL 10 dk)
   - Response: `{ attachmentId, upload: { url, headers }, expiresAt }`
2. Client → MinIO: PUT `<presigned URL>` (binary body, Content-Type header)
   - Network/CORS/size limit hatalarında client `attachment.commit` çağırmaz
3. Client → API: `attachment.commit({ attachmentId, clientMutationId })`
   - Permission + draft satır lookup (`committed_at IS NULL AND uploader_id = session.user.id`)
   - (opsiyonel) HEAD request to MinIO — gerçekten yüklendi mi doğrula
   - Tek transaction:
       UPDATE attachments SET committed_at = NOW(), updated_at = NOW() WHERE id = ?
       INSERT activity_events.attachment.added (payload: { attachmentId, fileName, mimeType, size, hasDescription, clientMutationId })
       INSERT realtime_events (Faz 5B outbox: type='attachment.added', board scope)
       INSERT notification_outbox  ← watcher fan-out (Faz 6 notification-rules.ts)
       UPDATE boards SET version = version + 1 WHERE id = ?
   - tx COMMIT → `void enqueueRealtimePublish` + `void enqueueNotificationPublish` (Faz 5B/6A simetri)
   - Response: `{ attachment }` (full row)
```

**Orphan cleanup:** `pusula-attachment-cleanup` BullMQ kuyruğu (bkz. [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md)) `committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'` satırlarını süpürür (worker önce MinIO `DeleteObject`, sonra DB DELETE — idempotent).

**Geriye uyum (DEM-110 single-shot):** mevcut `attachment.createUpload` mutation'ı **kaldırılır** (Faz 11A migration sırasında tüm satırlara `committed_at = created_at` atanır → eski cover-image yolundaki kayıtlar otomatik commit edilmiş sayılır); cover picker UI Faz 11D'de `attachment.list` filtreli image'lara döner. `getDownloadUrl` korunur.

### Liste / güncelleme / silme

- **`attachment.list({ cardId })`** — board'a erişen herkes (admin/member/viewer); `committed_at IS NOT NULL` filtre; `committed_at DESC` sırada. Response her satır için `{ id, fileName, mimeType, size, kind: 'image'|'pdf'|'office', description?, uploader: { id, name, image? }, createdAt, isCover: boolean }`. Cover-image picker bu listeyi `mimeType LIKE 'image/%'` ile filtreler.
- **`attachment.update({ attachmentId, description, clientMutationId })`** — yalnız `description` alanı düzenlenir (dosya adı/MIME/size **immutable**; yeni yükleme = yeni initiate). Yetki: uploader **veya** board admin. Activity üretmez (düşük gürültü; UI inline edit'i şıracaktır); `realtime_events.attachment.updated` Faz 11.1'e ertelenebilir veya aynı tx'te yazılır (V1: yazılmaz — açıklama değişimi düşük sinyal; client mutation `attachment.list` invalidate ederse yeterli).
- **`attachment.delete({ attachmentId, clientMutationId })`** — yetki: uploader **veya** board admin (viewer reject). Single transaction: `attachments` DELETE + `activity_events.attachment.removed` + `realtime_events` outbox + `boards.version + 1` + (`cards.coverImageAttachmentId` FK `ON DELETE SET NULL` otomatik tetiklenir — kartın kapak şeridi kaybolur). Post-commit `maybeEnqueueAttachmentCleanup(ctx, { attachmentId, storageKey })` worker MinIO `DeleteObject`. Soft-delete YOK.
- **`attachment.getDownloadUrl({ attachmentId })`** — mevcut DEM-110 procedure korunur; board'a erişen herkes (viewer dahil); presigned GET TTL 10 dk. Attachment lightbox/viewer tüketir.

> **Kart kapak görseli — server-side presigned GET (DEM-227 / 2026-05-19):** Kart kapak görselleri artık ayrı `attachment.getDownloadUrl` query'siyle (kart başına) çekilmez; `board.get` / `card.get` projection'ları kapak ekinin `storage_key`'i için presigned GET URL'i **server-side** üretip `cards[].coverImageUrl` alanında döndürür. TTL **1 saat** — `board.get` query'sinin client `staleTime`'ı 5 dk olduğundan URL client cache penceresi içinde ölmez (`attachment.getDownloadUrl`'in 10 dk TTL'i tek-seferlik indirme/lightbox için yeterli; persist edilen board projection'ı için daha uzun gerekir). `ObjectStorage.createPresignedGetUrl` artık opsiyonel `expiresIn` (saniye) parametresi alır; verilmezse 10 dk default korunur. N kapak için N imzalama saf crypto'dur (ağ yok); presign hatası ya da `objectStorage` yapılandırılmamışsa `coverImageUrl = null` döner (kapak şeridi gösterilmez).

### Önizleme (V1 önerisi)

- **Resim** (`image/*`): lightbox dialog (`@pusula/ui` `Dialog` + içinde `<img>`) + zoom/keyboard nav; `mimeType === 'image/gif'` için autoplay korunur.
- **PDF** (`application/pdf`): tarayıcı yerleşik viewer — `<iframe src={presignedGetUrl} sandbox="allow-same-origin">` (TTL 10 dk; iframe load fail olursa "İndir" butonu fallback).
- **Office** (docx/xlsx/pptx): önizleme **yok**; tile'da "İndir" butonu birincil aksiyon. PDF.js / Office Online viewer V1 dışı (kullanıcı kararı 2026-05-15).
- Misafir (Faz 9 paylaşım linki SSR): attachment listesi `forbidden:guest` flag'iyle gizlenir; misafir bir attachment ID'sini tahmin etse bile `attachment.list` `cardProcedure` üzerinde olduğu için 401/403 döner.

### Worker / temizlik

- **`pusula-attachment-cleanup`** — BullMQ kuyruğu; iki tetik:
  1. **Delete tetiği:** `attachment.delete` tx COMMIT sonrası best-effort `enqueueAttachmentCleanup({ storageKey })` (Redis hatası response'u düşürmez; sweeper yedek).
  2. **Orphan sweep:** 1 saatte bir repeatable job; `committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'` satırları toplar; her birine MinIO `DeleteObject` + DB DELETE (idempotent; başarısız job BullMQ retry/backoff + dead-letter).
- **Thumbnail / EXIF temizleme / antivirus** — V1 dışı; her biri sonraki bir tur (Faz 11.1 / Faz 8 sertleştirme / ayrı CVE-driven iş). Yapısal hazır: worker job yeni queue ile eklenir, request-path'e değmez.

### Env değişkenleri (mevcut + Faz 11)

`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — `apps/api/src/env.ts`'te local dev için MinIO default'larıyla zaten tanımlı. Faz 11 yeni env eklemez; bucket policy + CORS (web origin'inden direct PUT için) `compose.prod.yml` / Dokploy attach edilirken kontrol edilir.

---

## 9.1.1 Avatar yükleme (DEM-160 — karar 2026-05-16)

Kart eki **permission-scoped private** objedir (presigned GET, 10 dk TTL). Kullanıcı **avatarı** ise farklıdır: `users.image` her yerde (board üyeleri, yorumlar, bildirimler, üst-bar) render edilen **kalıcı** bir kolondur — süreli presigned URL buraya yazılamaz. Bu yüzden avatar objesi ayrı kurallarla servis edilir.

- **Servis stratejisi — public-read prefix:** MinIO'da `avatars/*` prefix'i anonim okumaya açılır; `users.image` doğrudan **public URL** (`{S3_PUBLIC_URL}/{S3_BUCKET}/{key}`, path-style) tutar. Avatar hassas veri değildir (board/workspace paylaşanlara zaten görünür); presigned-GET-her-render yaklaşımı tüm UI'yi değiştirirdi. Karar gerekçesi → [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı 2026-05-16.
- **`S3_PUBLIC_URL` (tarayıcıya açık origin):** `users.image` her tarayıcıda `<img src>` olarak çözülür; API'nin S3 client'ı için kullandığı `S3_ENDPOINT` ise Docker/üretimde **internal** bir hostname'dir (`http://minio:9000`) ve tarayıcıdan erişilemez. Bu yüzden public URL ayrı bir `S3_PUBLIC_URL` env'inden üretilir; tanımlı değilse `S3_ENDPOINT`'e düşer (yerel dev'de `S3_ENDPOINT` zaten host-mapped `http://localhost:9100`, doğru çalışır). Üretimde `S3_PUBLIC_URL` public MinIO subdomain'ine ayarlanır → [`12-deployment-runbook.md`](12-deployment-runbook.md) §12.6 env tablosu.
- **Depolama anahtarı:** `avatars/{userId}/{uuid}.{ext}` — server üretir; kullanıcı yalnız kendi avatar yoluna yazabilir.
- **İş kuralları:** `AVATAR_IMAGE_MIME_TYPES` (`image/jpeg`, `image/png`, `image/webp`) + `AVATAR_IMAGE_MAX_BYTES` (10 MiB) — `@pusula/domain`. URL ile avatar girme (`userImageUrlSchema`) opsiyonel olarak korunur.

### Direct presigned PUT akışı

Kart ekinin two-phase `initiate → PUT → commit` paterninden **commit fazı yoktur** — avatar objesinin activity/realtime/notification yan etkisi yoktur; "commit" mevcut Better Auth `updateUser` yoludur.

```txt
1. Client → API: `user.initiateAvatarUpload({ mimeType, size })`
   - protectedProcedure; MIME allowlist + size ≤ 10 MiB validasyon; per-user rate limit
     (`attachment.initiate` paternindeki in-memory token bucket)
   - storageKey = `avatars/{session.user.id}/{uuid}.{ext}`
   - Presigned PUT URL üret (TTL 10 dk; Content-Type + Content-Length imzalı)
   - Response: `{ upload: { url, headers }, publicUrl, objectKey, expiresAt }`
2. Client → MinIO: PUT `<presigned URL>` (binary body)
3. Client → Better Auth: `authClient.updateUser({ image: publicUrl })`
   - `databaseHooks.user.update.before` `userImageUrlSchema` ile public URL'i doğrular
   - `users.image` = publicUrl
```

DB satırı (kart ekindeki `attachments` gibi) **yoktur** — avatar metadata `users.image` kolonudur. Presigned PUT URL'i, `Content-Length`'in imzalı header'da olması sayesinde 10 MiB limitini storage katmanında da bağlayıcı kılar (kart ekiyle aynı sertleştirme — security H1).

**Orphan:** kullanıcı yeni avatar yüklediğinde eski obje MinIO'da kalır. V1'de kabul edilir (avatarlar küçük); `avatars/` için cleanup worker job ileri bir tur follow-up'tır.

### MinIO bucket policy

`avatars/*` prefix'i public-read yapılır — local `docker-compose.yml` `minio-setup` servisinde `mc anonymous set download local/pusula/avatars`; üretimde `compose.prod.yml` MinIO init adımında aynı policy uygulanır. Bucket'ın geri kalanı (kart ekleri) **private** kalır.

**Sertleştirme:** presigned PUT `Content-Type`'ı imzalar ve MIME allowlist SVG'yi dışlar; yine de `avatars/*` servis eden katmanın yanıtlarında `X-Content-Type-Options: nosniff` bulunması, kötü amaçlı bir objenin tarayıcıda HTML/JS olarak yorumlanmasını tamamen kapatır. MinIO objeyi kayıtlı `Content-Type` ile servis eder; nosniff bir reverse-proxy (Traefik) header'ı olarak eklenebilir — üretim sertleştirme follow-up'ı.

---

## 9.1.2 Presigned URL host'u — yerel geliştirmede mobil cihaz erişimi (DEM-215 — karar 2026-05-19)

Presigned PUT/GET URL'leri **istemciye** verilir; host'ları istemcinin erişebildiği bir origin'i göstermeli. Üretimde `S3_PUBLIC_URL` (public MinIO subdomain) bu işi görür. Yerel geliştirmede `S3_PUBLIC_URL` boştur ve `S3_ENDPOINT`'e (`http://localhost:9100`) düşülür — bu, dev makinesindeki **tarayıcı** için doğrudur ama **mobil cihaz** `localhost`'u kendisi sanar (`Failed to connect to localhost:9100` → kart kapak görseli boş kalır).

- **Çözüm — istek-host türetmesi (yalnız dev):** `S3_PUBLIC_URL` boşsa `apps/api` presigned URL host'unu gelen isteğin `Host` başlığından türetir — istemci API'ye hangi host üzerinden eriştiyse (`apps/mobile/src/lib/api-url.ts` Metro `hostUri`'den LAN IP'yi türetir) S3 URL'i de aynı host'u alır. `S3_ENDPOINT`'ten yalnız **şema + port** korunur, hostname istek host'undan gelir. Web `localhost`, mobil cihaz LAN IP alır; ağ/IP değişince kendiliğinden hizalanır (mobil `api-url.ts` ile simetrik disiplin).
- **Neden sunucuda, imzadan önce:** SigV4 imzası `host` başlığını kapsar (`X-Amz-SignedHeaders=host`); presigned URL'i istemci tarafında yeniden yazmak imzayı bozar. Türetme imzadan **önce**, sunucuda yapılmalı.
- **Üretimde devreye girmez:** `S3_PUBLIC_URL` set olduğunda her zaman o kullanılır; istek `Host`'una hiç bakılmaz (üretimde `Host` reverse-proxy'den gelir, türetme için güvenilmez).
- **`publicUrl` de istek-host türetir (güncelleme 2026-05-19):** `users.image`'a yazılan kalıcı avatar public URL'i (§9.1.1) **de** aynı baz host'u kullanır — başta "istekten türetilmez" kabul edilmişti, ama bu, mobil cihazdan yüklenen avatarın `localhost` host'uyla kaydedilip o cihazda hiç görüntülenememesine yol açtı. Artık presigned URL'lerle aynı kuralı izler: dev'de istek `Host`'undan, üretimde `S3_PUBLIC_URL`'den. Mobil cihazdan yüklenen avatar LAN IP'si taşır → hem cihazda hem (aynı ağdaki) dev tarayıcısında görünür. **Kalan sınırlama:** dev'de URL kalıcı kaydedildiği için (a) **web'den** yüklenen avatar `localhost` host'u taşır, mobil cihazda görünmez; (b) LAN IP değişirse eski kayıtlar bozulur. Her iki durumda da çözüm avatarı yeniden yüklemek ya da `.env`'e `S3_PUBLIC_URL`'i sabit bir LAN IP olarak yazmaktır — kabul edilen dev sınırlaması; üretimde `S3_PUBLIC_URL` set olduğundan sorun yoktur.
- **Wiring:** `apps/api/src/object-storage.ts` `resolveObjectStorage(requestHost?)` üretir; `apps/api/src/trpc.ts` (tRPC context) ve `apps/api/src/routes/share.ts` (misafir kapak görseli presign'i) her isteğe `Host` başlığını geçirir. S3Client salt presign (offline crypto — ağ yok) için kullanıldığından endpoint başına cache'lenir.

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
- Board/list/card/comment/label/attachment kapsamı: create/update/archive/delete.
- Archive: `archived_at` set edilir veya entity görünmezse search document silinir.
- Comment soft-delete: search document silinir; silinmiş yorum gövdesi index'te kalmaz.
- Attachment (DEM-163): `entity_type='attachment'`, `title=file_name`, `body=description`. Yalnızca commit edilmiş ek (`committed_at IS NOT NULL`) indekslenir — `attachment.commit`/`update` upsert eder, draft satır ve `attachment.delete` search document'ı siler. `archived_at` kartın/listenin/board'un arşiv durumundan türer. Dosya **içeriği** indekslenmez (OCR yok).
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
