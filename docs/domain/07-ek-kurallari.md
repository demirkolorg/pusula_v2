---
title: '07 — Ek Kuralları'
description: 'Kart eki yükleme, açıklama, düzenleme, silme, önizleme, validasyon ve temizlik iş kuralları.'
aliases:
  - 'Ek Kuralları'
  - 'Attachment Rules'
tags:
  - 'pusula'
  - 'domain/attachments'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
related:
  - '[[docs/architecture/09-depolama-ve-arama|Depolama ve Arama]]'
  - '[[docs/architecture/04-veri-katmani|Veri Katmanı]]'
  - '[[docs/architecture/03-backend|Backend]]'
  - '[[docs/architecture/08-web-ve-mobil|Web/Mobil]]'
  - '[[docs/architecture/13-ui-tasarim-dili|UI Tasarım Dili]]'
  - '[[docs/domain/05-aktivite-kurallari|Aktivite Kuralları]]'
  - '[[docs/domain/04-bildirim-kurallari|Bildirim Kuralları]]'
updated: 2026-07-08
---

# 07 — Ek (Attachment) Kuralları

> Eksen: **iş / domain** — _kim ne yükler/siler/düzenler, ne yüklenebilir, hangi limitler, ne olduğunda
> ne tetiklenir_. Depolama altyapısı (MinIO/S3 SDK, presigned URL, two-phase commit, worker temizlik) →
> [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md) §9.1; DB şeması →
> [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md); procedure'ler →
> [`../architecture/03-backend.md`](../architecture/03-backend.md) "Faz 11"; UI → [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.14 + [`../architecture/13-ui-tasarim-dili.md`](../architecture/13-ui-tasarim-dili.md) §13.10.

## V1 kapsamı (Faz 11 — kart eki)

Kart detayında kullanıcılar **resim**, **PDF** ve **MS Office** dosyalarını eke ekleyebilir; yüklerken
opsiyonel açıklama girebilir; önizleyebilir, indirebilir, silebilir, açıklamayı sonradan düzenleyebilir.
Kart aktivite feed'i + board aktivite feed'i ek ekleme/silme satırlarını gösterir; kart watcher'larına
bildirim üretilir; iki kullanıcı aynı board'da realtime ek senkronu görür.

## Kim yükleyebilir / silebilir / düzenleyebilir

| Aksiyon | Kim |
| --- | --- |
| Yükleme (`attachment.initiate` + `commit`) | Board **admin** veya **member** (board `viewer` yükleyemez). Arşivli board reject. |
| Görüntüleme / indirme (`attachment.list` + `getDownloadUrl`) | Board'a erişen herkes — **admin / member / viewer**. Misafir (Faz 9 paylaşım linki) **göremez**. |
| Açıklama düzenleme (`attachment.update`) | **Uploader** veya board **admin**. Viewer hiç. |
| Silme (`attachment.delete`) | **Uploader** veya board **admin**. Workspace owner override **yok V1** (gerekirse Faz 8'e ertelenir). Viewer hiç. |
| Kapak yapma / kaldırma (`card.update({ coverImageAttachmentId })`) | Admin/member; image kind attachment olmalı. DEM-110 mevcut path. |

Tüm yetkilendirme **server-side** her procedure'de zorunlu; UI yetkiyi yansıtır ama kapı değildir.
Detay rol matrisi → [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).

## Ne yüklenebilir (validasyon)

### MIME allowlist (V1 — 8 tip)

`@pusula/domain` `ATTACHMENT_MIME_TYPES` sabiti:

| Kategori | MIME tipleri |
| --- | --- |
| Resim | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| PDF | `application/pdf` |
| MS Office | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx), `application/vnd.openxmlformats-officedocument.presentationml.presentation` (pptx) |

İzin verilmeyen tipler (V1 dışı, [`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) Karar kaydı 2026-05-15):

- `image/svg+xml` — XSS riski (sandbox iframe + `Content-Disposition: attachment` ile sertleştirme gerekir)
- ODF (`application/vnd.oasis.opendocument.*`), `text/plain`, `text/markdown`, `text/csv` — kullanıcı kararı (genişletme sonraki tur)
- Arşivler (`application/zip`, `application/x-7z-compressed`, `application/vnd.rar`) — antivirus tarama yokluğunda riskli
- Yürütülebilirler (`.exe`, `.bat`, `.sh`, …), audio/video — V1 dışı

API `attachment.initiate` MIME validasyonu Zod (`z.enum(ATTACHMENT_MIME_TYPES)`) ile yapar; allowlist dışındaki istek `BAD_REQUEST` döner ve presigned URL üretilmez.

### Boyut limiti

`@pusula/domain` `ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024` (50 MiB tek limit). Kategori-bazlı ayrım V1'de yok (basit; kullanıcı kararı 2026-05-15). Aşan istek presigned URL almadan reddedilir.

Kart kapak resmi dar yolu (`CARD_COVER_IMAGE_MAX_BYTES = 50 MiB`) — cover picker image attachment'ları sergiler (`size <= 50 MiB AND mimeType LIKE 'image/%'`). Kapak limiti genel attachment limitiyle (`ATTACHMENT_MAX_BYTES`) hizalı.

### Dosya adı + storage key

- Kullanıcı dosya adı (`file_name`) görüntü amaçlı saklanır; ≤255 karakter, trim edilir; boş kabul edilmez.
- Storage key (`storage_key`) **tahmin edilemez**: `boards/{boardId}/cards/{cardId}/{uuid}-{safe-fileName}` formatı. `safe-fileName` sanitize edilir (`[^a-zA-Z0-9._-]+` → `-`, ≤120 char). UUID4 prefix saldırı yüzeyini kapatır.

### Açıklama (opsiyonel)

- Field: `attachments.description text` nullable; ≤500 karakter; **plain text** (Tiptap **yok** — alt-yazı/caption).
- Yükleme öncesi inline `Textarea` ile girilir; yükleme sonrası listede inline edit (`@pusula/ui` `Edit3Icon`).
- Boş açıklama → `null` (silme). Whitespace-only string → `null` (Zod `trim()` sonrası).
- Domain Zod: `attachmentDescriptionSchema = z.string().trim().max(500).optional()`.

## Yükleme akışı (two-phase commit — karar 2026-05-15)

Single-shot (eski DEM-110 paterni) orphan riski taşır; **two-phase initiate → upload → commit** kararı [`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) Karar kaydı 2026-05-15'te alındı. Akış:

1. **`attachment.initiate({ cardId, fileName, mimeType, size, description? })`**: API permission + MIME + size + (varsa) description doğrular → `attachments` INSERT (`committed_at IS NULL`, draft) → presigned PUT URL üretir → response `{ attachmentId, upload: { url, headers }, expiresAt }`. **Activity / realtime / notification yazılmaz** (draft kullanıcıya görünür değil).
2. **Client → MinIO PUT**: presigned URL'e doğrudan dosyayı PUT eder. Başarısızlıksa client `commit` çağırmaz; draft satır 1 saat sonra orphan sweeper tarafından temizlenir.
3. **`attachment.commit({ attachmentId, clientMutationId })`**: API permission + draft satır lookup (`committed_at IS NULL AND uploader_id = session.user.id`) → tek transaction: `committed_at = NOW()` + `activity_events.attachment.added` + `realtime_events` outbox + `notification_outbox` (watcher fan-out) + `boards.version + 1`. Idempotent: `committed_at IS NOT NULL` ise no-op.

Detay implementasyon + cleanup queue → [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md) §9.1, [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) "Attachment cleanup queue".

## Önizleme

- **Resim** (`image/*`): lightbox dialog (zoom in/out + keyboard nav).
- **PDF** (`application/pdf`): tarayıcı yerleşik viewer — `<iframe src={presignedGetUrl}>` (TTL 10 dk).
- **Office** (docx/xlsx/pptx): önizleme **yok**; "İndir" birincil aksiyon. Office Online viewer V1 dışı (gizlilik — dosya public erişim gerektirir).

Detay UI → [`../architecture/13-ui-tasarim-dili.md`](../architecture/13-ui-tasarim-dili.md) §13.10.4.

## Activity + bildirim + realtime

- **Activity event:** `attachment.added` (yükleme `commit` tx'inde) ve `attachment.removed` (silme tx'inde) — enum'da Faz 0'dan var. Payload sözleşmesi → [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md).
- **Bildirim:** Kart watcher'larına (`card_members role=watcher`) `attachment.added` in-app (+ tercihse email; push opt-in; cooldown 60s). Detay → [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md).
- **Realtime:** `attachment.added` / `attachment.removed` board outbox event'i (Faz 5B simetri); `boards.version + 1` her commit/delete'te. Web `useBoardRealtime` `attachment.list` cache invalidate eder. Detay → [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.3.

`attachment.update({ description })` activity **üretmez** (düşük gürültü; UI inline edit feedback'i yeterli); realtime event V1'de yazılmaz (sonraki tur değerlendirilir).

## Temizlik (storage cleanup)

- **Delete tetiği:** `attachment.delete` tx COMMIT sonrası `pusula-attachment-cleanup` worker job → MinIO `DeleteObject(storageKey)`. Idempotent; başarısızlıkta BullMQ retry + dead-letter.
- **Orphan sweep:** 1 saatte bir repeatable job; `committed_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'` satırlar + storage objeleri temizlenir.
- **Kart silinince:** `attachments.card_id` FK `ON DELETE CASCADE` → kart silinirse satırlar otomatik silinir; storage temizlik **kart-bazlı toplu** worker job'una bırakılır (Faz 11C — `attachment.delete` aynı işi yapar, kart silme aynı tetiği toplu çağırır).
- **Kapak yapılmış attachment silinince:** `cards.coverImageAttachmentId` FK `ON DELETE SET NULL` → kartın kapak şeridi otomatik kaybolur (DB cascade).

Detay queue + processor → [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) "Attachment cleanup queue".

## Misafir attachment (Faz 9 paylaşım linki uyumu)

Faz 9 (kart paylaşım linki) kapsam dışı satırı: _"misafir attachment yükleme V1 kapsam dışı"_. Faz 11 bunu sertleştirir: **misafir attachment'ı görmez de**. Paylaşım sayfası SSR (`apps/web/src/app/share/[token]/page.tsx`) `forbidden:guest` flag'iyle attachment listesini gizler; `attachment.list` `cardProcedure` üstünde olduğu için misafir token ile çağrı yapsa bile 401/403 döner.

Sonraki tur (Faz 11+ veya kullanıcı talebi): misafir attachment **görüntüleme** (download yok) tartışılabilir. V1 net: hayır.

## Checklist maddesi eki (madde-scoped attachment — 2026-07-08)

Bir checklist maddesine (kök **veya** iç içe/nested alt madde) da dosya eki eklenebilir — maddeye
yorum yazma (`comments.checklist_item_id` thread'i) ile **aynı model**. Karar →
[`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) Karar kaydı 2026-07-08.

- **Model:** `attachments.checklist_item_id` nullable FK (`checklist_items.id`, `ON DELETE CASCADE`).
  `card_id` **her zaman dolu** kalır — izin, realtime room, board sorgusu ve storage hep kart üzerinden
  çalışır; `checklist_item_id` yalnız eki bir madde altında gruplayan hedef boyutudur. `NULL` = kart eki
  (mevcut davranış), dolu = madde eki. (Yorum tablosundaki `checklist_item_id` deseniyle birebir simetrik.)
- **Kart galerisi vs madde eki:** `attachment.list({ cardId })` (checklistItemId'siz) yalnız **kart
  eklerini** (`checklist_item_id IS NULL`) döner — madde eklerini karıştırmaz (`comment.list` ile aynı
  ayrım). `attachment.list({ cardId, checklistItemId })` yalnız o maddenin eklerini döner.
- **Yetki:** Kart ekiyle **aynı** (yükleme board member+, silme uploader/admin, görüntüleme board'a erişen
  herkes, misafir göremez). Ek olarak madde gerçekten bu karta ait mi doğrulanır (`assertChecklistItemOnCard`
  — item → checklist → card zinciri; cross-card madde id reddedilir).
- **Kapak olamaz:** Madde eki `cards.cover_image_attachment_id` kapağı **yapılamaz** — kapak yalnız
  kart-seviyesi resim ekleridir. Madde eki UI'ında "kapak yap" gösterilmez.
- **Storage key:** `boards/{boardId}/cards/{cardId}/checklist-items/{itemId}/{uuid}-{safe-fileName}` — madde
  segmenti eklenir; geri kalan sanitize + UUID4 disiplini kart ekiyle aynı (tahmin edilemez).
- **Activity / bildirim / realtime:** `attachment.added` / `attachment.removed` tipi **korunur** (yeni
  bildirim tipi açılmaz — mevcut kart watcher fan-out'u yeterli); payload madde bağlamını opsiyonel taşır.
  Madde adıyla zenginleştirilmiş bildirim metni sonraki tur.
- **Sayaç:** `checklist.list` her maddeye `commentCount` yanında `attachmentCount` (yalnız
  `committed_at IS NOT NULL`) döner — satırdaki ek rozeti bundan beslenir (nested maddeler dahil).
- **Madde silinince:** `checklist_item_id` FK `ON DELETE CASCADE` → madde silinirse ek satırları otomatik
  silinir; storage temizlik `attachment.delete` / cleanup worker ile (kart silme deseniyle aynı: DB cascade
  ile satır + toplu obje temizliği).
- **Kapsam:** Önce **web**; mobil madde-eki UI sonraki tur (2026-07-08 karar kaydı).

## Kapsam dışı (V1 — Faz 11.x veya Faz 8 sertleştirme)

- Image thumbnail server-side generation (256×256 webp)
- EXIF metadata temizleme (privacy)
- Antivirus tarama (ClamAV worker)
- Drag-drop kart üstüne dosya bırakma (yalnız dropzone)
- Çoklu eşzamanlı upload
- Workspace toplam attachment kotası
- Office Online viewer
- Misafir attachment görüntüleme/yükleme
- SVG / ODF / plain text / arşiv MIME desteği
- Hard-delete onay süresi (recover akışı) — silme anlık

## Kabul kriterleri (Faz 11E)

> **Wired (2026-05-15, DEM-151):** Bu kriterler Faz 11E test/QA turunda doğrulandı —
> domain Zod permütasyon (35 test), db migration `0027` + backfill + partial index (8 test),
> api permission matrix + two-phase + tx sayımı (38 test), worker cleanup + orphan sweep (21 test),
> Playwright `e2e/attachment.spec.ts` 5 senaryo (tam stack 5/5 PASS). code-review + verifier PASS.

- Allowlist 8 tip OK + 9. tip reddedilir (`BAD_REQUEST`).
- Size 50 MiB sınırı + 1 byte reddedilir.
- Permission matrix: admin upload/delete OK; member upload OK + sadece kendi attachment'ını silebilir; viewer upload+delete reject + indir OK.
- Two-phase: initiate sonrası 1 saat içinde commit gelmezse orphan sweeper temizler.
- Realtime: alice upload + commit → bob (aynı board, ayrı session) "Ekler N" rozeti senkron artar, listede satır canlı belirir.
- Bildirim: alice upload → bob (kart watcher) in-app bildirim alır + bell badge artar.
- Cover picker: image kind attachment seçilince kart kapağı şeridi belirir; attachment silinince kapak şeridi otomatik kaybolur.
- Misafir paylaşım sayfasında attachment listesi gizli (`forbidden:guest`).
