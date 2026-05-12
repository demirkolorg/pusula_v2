# 02 — Yetkilendirme Kuralları

> Eksen: **iş / domain**. Auth ≠ authorization: kimlik doğrulama altyapısı (Better Auth) ve
> enforcement noktası → [`../architecture/07-auth.md`](../architecture/07-auth.md). Roller + helper'lar `@pusula/domain` içinde kodlanır.

## İlke

Workspace/board/card yetkilendirmesi **auth sistemine gömülmez**; domain permission katmanında
çözülür ve **her tRPC procedure içinde server-side** kontrol edilir. Frontend yalnızca UI'ı
gizler/gösterir; gerçek kapı backend'dedir. Kontrol zinciri: `session → workspace access → board access → card/list permission → mutation/query`.

## Roller

```txt
Workspace:  owner · admin · member · guest
Board:      admin · member · viewer
Card:       assignee · watcher
```

- Workspace rolü board erişiminin tabanını belirler; board üyeliği board içi yetkiyi belirler. Workspace `owner`/`admin` board'lara erişebilir (yönetim amaçlı), `guest` yalnızca açıkça davet edildiği board'lara.
- Card rolleri yetki seviyesi değil, **ilgi/ilişki** belirtir: `assignee` (kart kendisine atanmış), `watcher` (kartı izliyor — bildirim alır). Kart üzerinde düzenleme yetkisi board rolünden gelir.

## Yetki matrisi (taslak — procedure'ler yazıldıkça netleştirilecek)

> Bu matris başlangıç sözleşmesidir; yeni procedure eklerken bu dosyayı güncelle. "✓" = yetkili, "—" = değil, "(s)" = sadece kendi oluşturduğu/atandığı kayıt.

### Workspace

| İşlem | owner | admin | member | guest |
| --- | --- | --- | --- | --- |
| Workspace ayarlarını düzenle / sil | ✓ | — | — | — |
| Üye davet et / rol değiştir / çıkar | ✓ | ✓ | — | — |
| Board oluştur | ✓ | ✓ | ✓ | — |
| Workspace'i ve board listesini gör | ✓ | ✓ | ✓ | (davet edildiği board'lar) |
| Workspace genel activity feed | ✓ | ✓ | ✓ | — |

### Board

| İşlem | board admin | board member | board viewer |
| --- | --- | --- | --- |
| Board ayarlarını düzenle / arşivle / sil | ✓ | — | — |
| Board üyesi ekle/çıkar, rol değiştir | ✓ | — | — |
| Label oluştur/düzenle/sil | ✓ | ✓ | — |
| Liste oluştur/yeniden adlandır/arşivle/taşı (reorder) | ✓ | ✓ | — |
| Kart oluştur/düzenle/taşı/arşivle | ✓ | ✓ | — |
| Karta üye/etiket ata, checklist düzenle | ✓ | ✓ | — |
| Yorum ekle | ✓ | ✓ | — |
| Attachment yükle | ✓ | ✓ | — |
| Board/kartları görüntüle | ✓ | ✓ | ✓ |
| Kendini watcher yap / atamayı bırak | ✓ | ✓ | ✓ |

### Card (ilgi rolleri — yetki değil)

- `assignee`: karta atanmış; due-date ve kart değişikliği bildirimleri alır; board yetkisi varsa düzenleyebilir.
- `watcher`: kartı izliyor; ilgili event'lerde bildirim alır; düzenleme yetkisi board rolünden.

## Enforcement kuralları

- Her mutation/query procedure: önce session, sonra workspace, sonra (varsa) board, sonra (varsa) card/list permission — eksikse `FORBIDDEN`/`UNAUTHORIZED`.
- Realtime room join'de aynı kontrol uygulanır (`board:{id}` room'a join ancak board erişimi varsa).
- Davet token'ları süreli (expiration) ve tek kullanımlık mantığıyla işlenir; bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.6.
