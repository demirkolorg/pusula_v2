# 07 — Ek (Attachment) Kuralları

> Eksen: **iş / domain** — _kim yükleyebilir, ne yüklenebilir, limitler_. Depolama altyapısı
> (MinIO / S3 uyumlu SDK, presigned URL akışı, thumbnail worker) → [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md).

## Kim yükleyebilir / silebilir

- Karta attachment yükleme: o board'da **admin** veya **member** (board `viewer` yükleyemez). Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).
- Attachment silme: yükleyen kullanıcı veya board admin.
- Görüntüleme/indirme: board'a erişebilen herkes (admin/member/viewer) — indirme URL'i kısa süreli presigned olur.

## Ne yüklenebilir (validasyon)

- **MIME/type allowlist:** Yalnızca izin verilen türler (görsel, PDF, ofis dokümanları, metin, arşiv vb. — kesin liste implementasyon parametresi). Çalıştırılabilir / tehlikeli türler reddedilir.
- **Boyut limiti:** Dosya başına üst sınır uygulanır (parametre); aşan istek presigned URL almadan reddedilir.
- **İsim / metadata:** Dosya adı sanitize edilir; depolanan `storage_key` tahmin edilemez (board/kart bazlı prefix + rastgele bileşen).
- API, presigned URL üretmeden **önce** permission + MIME + boyut + (varsa) kart/board durumu kontrolünü yapar; yükleme bittikten sonra metadata persist edilir (`attachments(id, card_id, uploader_id, storage_key, file_name, mime_type, size, created_at)`).

## İşleme ve temizlik

- Görsel preview/thumbnail üretimi ve (gerekirse) virüs taraması **worker** job'udur; request-path'te yapılmaz. Bkz. [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md).
- Kart/attachment silindiğinde object storage'daki nesne de temizlenir (worker cleanup job'u); metadata ve storage tutarlı tutulur.
- Attachment ekleme/silme bir activity event üretir (`attachment.added` / `attachment.removed` — bkz. [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)) ve izleyenlere bildirim üretebilir.
