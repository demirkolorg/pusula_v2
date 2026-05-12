# 06 — Arama Kapsamı

> Eksen: **iş / domain** — _neler aranabilir, sonuçlar nasıl filtrelenir_. Arama altyapısı
> (PostgreSQL FTS → Meilisearch, `search_documents` şeması, trigger'lar) → [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md).

## Aranabilir içerik

| Entity | Aranan alan(lar) |
| --- | --- |
| Board | başlık |
| Card | başlık, açıklama |
| Comment | içerik |
| Label | ad |
| (Bağlam) | workspace / board / member bağlamı sonuç gruplamada ve filtrede kullanılır |

`search_documents` tablosu bu metinleri denormalize tutar (`entity_type`, `entity_id`, `title`,
`body`, `labels`, `archived_at`, `workspace_id`, `board_id`).

## Sonuç kuralları

1. **Permission filtresi zorunlu:** Bir kullanıcı yalnızca erişebildiği workspace ve board'lardaki sonuçları görür. Filtre query zamanında uygulanır (server-side); index'te ham metin tutulsa bile sonuçlar permission scope'undan geçirilir. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).
2. **Arşivli kayıtlar:** Varsayılan olarak arşivli board/list/card sonuçlara dahil **edilmez**; kullanıcı açıkça "arşivlenenleri de ara" derse dahil edilir. `search_documents.archived_at` set edildiğinde kayıt filtrelenir; kart/liste arşivlenince/silinince search document güncellenir/kaldırılır.
3. **Kapsam daraltma (filtre):** Belirli bir workspace / board / label / assignee / due-date gibi facet'lerle daraltma desteklenir (PostgreSQL FTS aşamasında temel düzeyde; Meilisearch'e geçişte gelişmiş facet — geçiş şartları [`../architecture/09-depolama-ve-arama.md`](../architecture/09-depolama-ve-arama.md)).
4. **Silme tutarlılığı:** Entity silindiğinde/arşivlendiğinde search document'ı senkron tutmak işlemin parçasıdır (transaction içinde veya outbox ile worker'da, altyapı dosyasındaki modele göre).
