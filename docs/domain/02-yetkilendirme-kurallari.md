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
| `workspace.delete` | owner | **Kalıcı silme** — geri dönüşsüz; input'ta workspace adı (`confirmName`) birebir eşleşmeli, aksi halde `BAD_REQUEST`; `DELETE FROM workspaces` (üye, davet, board… cascade). `archive` (`archived_at`) ayrı kavram (pasif/geri alınabilir). Cascade nedeniyle DB içi iz (activity) tutulmaz. |
| `workspace.members.list` | member+ | |
| `workspace.members.updateRole` | admin+ | `owner` rolü atanamaz/kaldırılamaz — owner devri ayrı akış |
| `workspace.members.remove` | admin+ | Üye kendini çıkarabilir; son `owner` çıkarılamaz |
| `workspace.members.invite` | admin+ | `workspace_invitations`'a `pending` satır + `notification_outbox` (email; alıcı hesaplıysa in-app de) yazar — aşağıdaki davet akışı |

#### Workspace davet akışı (Faz 1.3)

> `workspace_invitations` tablosu (bkz. [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md)). Davet, gizli rastgele bir `token` taşır (yalnızca davet e-postasında), süreli (varsayılan ~7 gün) ve **tek kullanımlık**. Bir (workspace, e-posta) için aynı anda en fazla bir `pending` davet. Durum lifecycle: `pending → accepted | declined | revoked | expired`.

| Procedure | Gereken rol | Not |
| --- | --- | --- |
| `workspace.members.invite` | admin+ (`workspaceProcedure`) | `email` küçük harfe normalize; davet edilen zaten üye ise `CONFLICT`; (workspace, email) için `pending` davet zaten varsa `CONFLICT`; rol `owner` olamaz (`assignableWorkspaceRoleSchema`, varsayılan `member`). `workspace_invitations` insert + `activity_events` (`workspace.member_invited`) + `notification_outbox` (`workspace_invitation`, channel `email`; davet edilenin hesabı varsa ek `in_app` satır, `recipient_id` o kullanıcı) — hepsi aynı transaction'da. |
| `workspace.invitations.list` | member+ (`workspaceProcedure`) | Workspace'in `pending` davetleri (admin+ yönetim için; member+ görüntüleyebilir — UI yönetim aksiyonunu admin+'a gösterir). |
| `workspace.invitations.revoke` | admin+ (`workspaceProcedure`) | Davet `pending` değilse `BAD_REQUEST`; aksi halde `status = revoked` + `activity_events` (`workspace.invitation_revoked`). |
| `workspace.invitations.mine` | (oturum, `protectedProcedure`) | Oturum açmış kullanıcının e-postasına gelen, `pending` ve süresi dolmamış davetler (workspace adı, rol, davet eden, `expires_at`, `token`). |
| `workspace.invitations.accept` | (oturum, `protectedProcedure` — üye değil) | Token ile bulunur; `pending` değil/süresi dolmuşsa `BAD_REQUEST` (süresi dolmuşsa `status = expired` set edilir); oturum kullanıcısının e-postası davet e-postasıyla eşleşmiyorsa `FORBIDDEN`. Transaction: kullanıcı zaten üye değilse `workspace_members` insert (rol davetten); `status = accepted`, `accepted_by_id`, `accepted_at`; `activity_events` (`workspace.member_added`). Zaten üyeyse davet `accepted`'a çekilir, no-op (idempotent), workspace döner. |
| `workspace.invitations.decline` | (oturum, `protectedProcedure`) | Token ile bulunur; e-posta eşleşmiyorsa `FORBIDDEN`; `pending` değilse `BAD_REQUEST`; aksi halde `status = declined`. |

Activity: `workspace.created`, `workspace.updated`, `workspace.archived`, `workspace.member_invited`,
`workspace.member_added`, `workspace.member_role_changed`, `workspace.invitation_revoked`,
`workspace.member_removed` ilgili transaction içinde `activity_events`'e yazılır (bkz.
[`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)). Davet bildirimi `notification_outbox`'a yazılır;
gerçek email/in-app teslimi worker'la (Faz 6) yapılır — request döngüsünde gönderim yok. Realtime yayın ileri fazlarda.

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

#### Board / List / Card procedure haritası (Faz 2)

> tRPC procedure → gereken board rolü. Enforcement: `boardProcedure` board'u çözer ve `effectiveBoardRole`'u (workspace + board üyeliğinden, `@pusula/domain/permissions`) hesaplar — board yoksa `NOT_FOUND`, erişim yoksa `FORBIDDEN` (board-erişim çözümlemesi paylaşılan `resolveBoardAccess` helper'ında); `cardProcedure` kartı çözer, kartın board'unu `resolveBoardAccess` ile resolve eder, kart context'i (`card_members`: `assignee`/`watcher`) ekler — kart yoksa `NOT_FOUND`. İnce kontrol (`admin` / `member+`) procedure gövdesinde `@pusula/domain/permissions` (`canViewBoard`/`canEditBoardContent`/`canManageBoard`) ile yapılır. Arşivli board salt-okunur (yeni liste/kart eklenemez, içerik düzenlenemez) — her mutation procedure'ünde transaction içinde tekrar okunarak enforce edilir. Faz 2 = statik CRUD; `move`/reorder + drag-drop Faz 3 ([DEM-26](https://linear.app/demirkol/issue/DEM-26) — [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.1). Procedure iskeleti ve router listesi: [`../architecture/03-backend.md`](../architecture/03-backend.md) (Faz 2 — board / list / card procedure'leri).

| Procedure | Middleware | Gereken rol | Not |
| --- | --- | --- | --- |
| `board.list` | `workspaceProcedure` | workspace `member+` | Erişilebilir board'lar (workspace owner/admin tümü; guest yalnızca davetli); her satırda effective board rolü döner |
| `board.create` | `workspaceProcedure` | workspace `member+` (`guest` hariç) | Oluşturan board `admin` üye olur; `activity_events` (`board.created`) |
| `board.get` | `boardProcedure` | board `viewer+` | Board + listeler (arşivli dahil, `position` sıralı) + aktif kartlar (`position` sıralı) |
| `board.update` | `boardProcedure` | board `admin` (`canManageBoard`) | Başlık; arşivli board düzenlenemez; idempotent (aynı başlık → `changed:false`); `boards.version` artar |
| `board.archive` | `boardProcedure` | board `admin` | `archived_at` (set/restore); arşivli board salt-okunur; idempotent; `boards.version` artar |
| `list.create` | `boardProcedure` | board `member+` (`canEditBoardContent`) | Board sonuna `position` (`@pusula/domain/position` — boş board `firstPosition`, aksi son listenin ardı); arşivli board'a liste eklenemez; `boards.version` artar |
| `list.update` | `boardProcedure` | board `member+` | Yeniden adlandırma; arşivli board düzenlenemez; idempotent; `boards.version` artar |
| `list.archive` | `boardProcedure` | board `member+` | `archived_at` (set/restore); arşivli liste aktif kart almaz (yeni kart eklenemez); idempotent; `boards.version` artar |
| `card.create` | `protectedProcedure` (listenin board'unu `resolveBoardAccess` ile çözer) | board `member+` | `createCardInput` yalnızca `listId` taşır → liste transaction içinde okunur, board ondan türetilir; liste sonuna `position`; kart `board_id` = listenin board'u (**kart ⊆ liste.board invariant'ı**); arşivli board/listeye eklenemez; `boards.version` artar |
| `card.get` | `cardProcedure` | board `viewer+` | Kart detayı + kullanıcının kart ilişkileri (`card_members`) |
| `card.update` | `cardProcedure` | board `member+` | Başlık → `card.renamed`, açıklama → `card.description_changed`, `due_at` set → `card.due_set` / null → `card.due_cleared` (her değişen alan ayrı activity); arşivli board düzenlenemez; idempotent; `boards.version` artar |
| `card.archive` | `cardProcedure` | board `member+` | `archived_at` (set/restore); arşivli board düzenlenemez; idempotent; `boards.version` artar |

Activity: `board.created/renamed/archived`, `list.created/renamed/archived`, `card.created/renamed/description_changed/due_set/due_cleared/archived` ilgili transaction'da `activity_events`'e yazılır (bu tipler [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) taksonomisinde zaten tanımlı; Faz 2'de bu alt küme `ACTIVITY_EVENT_TYPES`'a eklenir). Realtime yayın Faz 5, bildirim outbox Faz 6.

### Card (ilgi rolleri — yetki değil)

- `assignee`: karta atanmış; due-date ve kart değişikliği bildirimleri alır; board yetkisi varsa düzenleyebilir.
- `watcher`: kartı izliyor; ilgili event'lerde bildirim alır; düzenleme yetkisi board rolünden.

## Enforcement kuralları

- Her mutation/query procedure: önce session, sonra workspace, sonra (varsa) board, sonra (varsa) card/list permission — eksikse `FORBIDDEN`/`UNAUTHORIZED`.
- Realtime room join'de aynı kontrol uygulanır (`board:{id}` room'a join ancak board erişimi varsa).
- Davet token'ları süreli (expiration) ve tek kullanımlık mantığıyla işlenir; bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.6.
