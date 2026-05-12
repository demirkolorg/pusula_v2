---
title: "02 — Yetkilendirme Kuralları"
description: "Workspace, board ve card rolleri ile authorization kuralları."
aliases:
  - "Yetkilendirme Kuralları"
  - "Authorization Rules"
tags:
  - "pusula"
  - "domain/authorization"
  - "security"
type: "domain"
axis: "domain"
status: "active"
parent: "[[docs/domain/README|İş / Domain Kuralları]]"
updated: 2026-05-12
---
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

#### Workspace procedure haritası (Faz 1)

> tRPC procedure → gereken workspace rolü. Enforcement: `workspaceProcedure` (bkz. [`../architecture/03-backend.md`](../architecture/03-backend.md)) `workspaceId`'den üyeliği çözer — workspace yoksa `NOT_FOUND`, üyelik yoksa `FORBIDDEN`. İnce kontrol (`admin+` / `owner`) procedure gövdesinde `@pusula/domain/permissions` ile yapılır.

| Procedure | Gereken rol | Not |
| --- | --- | --- |
| `workspace.list` | (oturum) | Yalnızca kullanıcının üyesi olduğu workspace'ler döner |
| `workspace.create` | (oturum) | Oluşturan otomatik `owner` üye olur |
| `workspace.get` | member+ | `guest` shell'i görür; board listesi yalnızca davet edildiği board'lar |
| `workspace.update` | admin+ | Ad/slug değişikliği |
| `workspace.archive` | owner | Soft-delete (`archived_at`) |
| `workspace.delete` | owner | Kalıcı silme — şimdilik devre dışı / açık onay gerektirir |
| `workspace.members.list` | member+ | |
| `workspace.members.updateRole` | admin+ | `owner` rolü atanamaz/kaldırılamaz — owner devri ayrı akış |
| `workspace.members.remove` | admin+ | Üye kendini çıkarabilir; son `owner` çıkarılamaz |
| `workspace.members.invite` | admin+ | Davet token akışıyla gelir (süreli, tek kullanımlık) — ayrı iş; bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.6 |

Activity: `workspace.created`, `workspace.updated`, `workspace.archived`, `workspace.member_role_changed`,
`workspace.member_removed` ilgili transaction içinde `activity_events`'e yazılır (bkz.
[`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)). `workspace.member_added` davet-token akışıyla
birlikte gelecek (ayrı iş). Realtime yayın ve `notification_outbox` (davet bildirimi) ilerleyen fazlarda eklenir.

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
