---
title: '02 — Yetkilendirme Kuralları'
description: 'Workspace, board ve card rolleri ile authorization kuralları.'
aliases:
  - 'Yetkilendirme Kuralları'
  - 'Authorization Rules'
tags:
  - 'pusula'
  - 'domain/authorization'
  - 'security'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-05-24
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
- **Effective board rolü** (`@pusula/domain/permissions` `effectiveBoardRole`): explicit `board_members` satırı varsa o kazanır; yoksa workspace `owner`/`admin` → board `admin`, workspace `member` → board `member`, workspace `guest` → `null` (board üyesi değilse erişimi yok). Yani board `admin` aksiyonu (board ayarları, üye/etiket yönetimi) workspace `owner`/`admin`'e de açıktır — explicit board üyeliği şart değil. `board.members.updateRole`/`remove` ise yalnızca **explicit** `board_members` satırını yönetir (inherited satır için `BAD_REQUEST`); workspace owner/admin'in board erişimini kaldırmak workspace rolünü değiştirmekle olur.
- **Board rolleri (admin / member / viewer):** `admin` = board'u yönetir (ayarlar, arşiv, üye/rol, etiket dahil her şey); `member` = içerik düzenler (liste/kart/checklist/yorum/etiket-atama/kart-üyesi) ama board'u yönetemez; `viewer` = salt-okunur (yalnızca kendini `watcher` yapabilir / atamadan çıkabilir).
- Card rolleri yetki seviyesi değil, **ilgi/ilişki** belirtir: `assignee` (kart kendisine atanmış), `watcher` (kartı izliyor — bildirim alır). Kart üzerinde düzenleme yetkisi board rolünden gelir. Karta üye atanan kişi o board'a erişebilen biri olmalı (`effectiveBoardRole !== null`) — aksi halde "atanmış ama göremeyen" kullanıcı oluşur.

## Yetki matrisi (taslak — procedure'ler yazıldıkça netleştirilecek)

> Bu matris başlangıç sözleşmesidir; yeni procedure eklerken bu dosyayı güncelle. "✓" = yetkili, "—" = değil, "(s)" = sadece kendi oluşturduğu/atandığı kayıt.

### Workspace

| İşlem                               | owner | admin | member | guest                      |
| ----------------------------------- | ----- | ----- | ------ | -------------------------- |
| Workspace ayarlarını düzenle / sil  | ✓     | —     | —      | —                          |
| Üye davet et / rol değiştir / çıkar | ✓     | ✓     | —      | —                          |
| Board oluştur                       | ✓     | ✓     | ✓      | —                          |
| Workspace'i ve board listesini gör  | ✓     | ✓     | ✓      | (davet edildiği board'lar) |
| Workspace genel activity feed       | ✓     | ✓     | ✓      | —                          |

#### Workspace procedure haritası (Faz 1)

> tRPC procedure → gereken workspace rolü. Enforcement: `workspaceProcedure` (bkz. [`../architecture/03-backend.md`](../architecture/03-backend.md)) `workspaceId`'den üyeliği çözer — workspace yoksa `NOT_FOUND`, üyelik yoksa `FORBIDDEN`. İnce kontrol (`admin+` / `owner`) procedure gövdesinde `@pusula/domain/permissions` ile yapılır.

| Procedure                      | Gereken rol | Not                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace.list`               | (oturum)    | Yalnızca kullanıcının üyesi olduğu workspace'ler döner                                                                                                                                                                                                                                       |
| `workspace.create`             | (oturum)    | Oluşturan otomatik `owner` üye olur                                                                                                                                                                                                                                                          |
| `workspace.get`                | member+     | `guest` shell'i görür; board listesi yalnızca davet edildiği board'lar                                                                                                                                                                                                                       |
| `workspace.update`             | admin+      | Ad/slug değişikliği                                                                                                                                                                                                                                                                          |
| `workspace.archive`            | owner       | Soft-delete (`archived_at`)                                                                                                                                                                                                                                                                  |
| `workspace.delete`             | owner       | **Kalıcı silme** — geri dönüşsüz; input'ta workspace adı (`confirmName`) birebir eşleşmeli, aksi halde `BAD_REQUEST`; `DELETE FROM workspaces` (üye, davet, board… cascade). `archive` (`archived_at`) ayrı kavram (pasif/geri alınabilir). Cascade nedeniyle DB içi iz (activity) tutulmaz. |
| `workspace.members.list`       | member+     |                                                                                                                                                                                                                                                                                              |
| `workspace.members.updateRole` | admin+      | `owner` rolü atanamaz/kaldırılamaz — owner devri ayrı akış                                                                                                                                                                                                                                   |
| `workspace.members.remove`     | admin+      | Üye kendini çıkarabilir; son `owner` çıkarılamaz                                                                                                                                                                                                                                             |
| `workspace.members.invite`     | admin+      | `workspace_invitations`'a `pending` satır + `notification_outbox` (email; alıcı hesaplıysa in-app de) yazar — aşağıdaki davet akışı                                                                                                                                                          |

#### Workspace davet akışı (Faz 1.3)

> `workspace_invitations` tablosu (bkz. [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md)). Davet, gizli rastgele bir `token` taşır (yalnızca davet e-postasında), süreli (varsayılan ~7 gün) ve **tek kullanımlık**. Bir (workspace, e-posta) için aynı anda en fazla bir `pending` davet. Durum lifecycle: `pending → accepted | declined | revoked | expired`.

| Procedure                       | Gereken rol                                | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace.members.invite`      | admin+ (`workspaceProcedure`)              | `email` küçük harfe normalize; davet edilen zaten üye ise `CONFLICT`; (workspace, email) için `pending` davet zaten varsa `CONFLICT`; rol `owner` olamaz (`assignableWorkspaceRoleSchema`, varsayılan `member`). `workspace_invitations` insert + `activity_events` (`workspace.member_invited`) + `notification_outbox` (`workspace_invitation`, channel `email`; davet edilenin hesabı varsa ek `in_app` satır, `recipient_id` o kullanıcı) — hepsi aynı transaction'da. |
| `workspace.invitations.list`    | member+ (`workspaceProcedure`)             | Workspace'in `pending` davetleri (admin+ yönetim için; member+ görüntüleyebilir — UI yönetim aksiyonunu admin+'a gösterir).                                                                                                                                                                                                                                                                                                                                                |
| `workspace.invitations.revoke`  | admin+ (`workspaceProcedure`)              | Davet `pending` değilse `BAD_REQUEST`; aksi halde `status = revoked` + `activity_events` (`workspace.invitation_revoked`).                                                                                                                                                                                                                                                                                                                                                 |
| `workspace.invitations.mine`    | (oturum, `protectedProcedure`)             | Oturum açmış kullanıcının e-postasına gelen, `pending` ve süresi dolmamış davetler (workspace adı, rol, davet eden, `expires_at`, `token`).                                                                                                                                                                                                                                                                                                                                |
| `workspace.invitations.accept`  | (oturum, `protectedProcedure` — üye değil) | Token ile bulunur; `pending` değil/süresi dolmuşsa `BAD_REQUEST` (süresi dolmuşsa `status = expired` set edilir); oturum kullanıcısının e-postası davet e-postasıyla eşleşmiyorsa `FORBIDDEN`. Transaction: kullanıcı zaten üye değilse `workspace_members` insert (rol davetten); `status = accepted`, `accepted_by_id`, `accepted_at`; `activity_events` (`workspace.member_added`). Zaten üyeyse davet `accepted`'a çekilir, no-op (idempotent), workspace döner.       |
| `workspace.invitations.decline` | (oturum, `protectedProcedure`)             | Token ile bulunur; e-posta eşleşmiyorsa `FORBIDDEN`; `pending` değilse `BAD_REQUEST`; aksi halde `status = declined`.                                                                                                                                                                                                                                                                                                                                                      |

Activity: `workspace.created`, `workspace.updated`, `workspace.archived`, `workspace.member_invited`,
`workspace.member_added`, `workspace.member_role_changed`, `workspace.invitation_revoked`,
`workspace.member_removed` ilgili transaction içinde `activity_events`'e yazılır (bkz.
[`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)). Davet bildirimi `notification_outbox`'a yazılır;
gerçek email/in-app teslimi worker'la (Faz 6) yapılır — request döngüsünde gönderim yok. Realtime yayın ileri fazlarda.

### Board

| İşlem                                                              | board admin | board member | board viewer |
| ------------------------------------------------------------------ | ----------- | ------------ | ------------ |
| Board ayarlarını düzenle / arşivle / sil                           | ✓           | —            | —            |
| Board üyesi ekle/çıkar, rol değiştir; board daveti gönder/iptal et | ✓           | —            | —            |
| Board'dan ayrıl (kendi explicit üyeliğini kaldır)                  | ✓¹          | ✓            | ✓            |
| Label oluştur/düzenle/sil                                          | ✓           | ✓            | —            |
| Liste oluştur/yeniden adlandır/arşivle/taşı (reorder)              | ✓           | ✓            | —            |
| Kart oluştur/düzenle/taşı/arşivle                                  | ✓           | ✓            | —            |
| Karta üye/etiket ata, checklist (+ item) düzenle                   | ✓           | ✓            | —            |
| Yorum ekle                                                         | ✓           | ✓            | —            |
| Yorumu düzenle / sil                                               | ✓²          | (s)²         | —            |
| Attachment yükle                                                   | ✓           | ✓            | —            |
| Board/kartları/yorumları görüntüle, board üye listesi              | ✓           | ✓            | ✓            |
| Kendini watcher yap / atamayı (kendi `assignee`'liğini) bırak      | ✓           | ✓            | ✓            |
| Board'u favorile / favorisinden çıkar (kişisel)                    | ✓           | ✓            | ✓            |

> ¹ Son board `admin` board'dan ayrılamaz / rolden düşürülemez. ² Yorum düzenleme/silme: yazan kişi **veya** board `admin`; `viewer` yorum bile ekleyemez. **Board favorisi kişiseldir** — board görüntüleme erişimi (`viewer+`) yeterli; ayrı yetki kuralı yoktur, activity/realtime üretmez (bkz. [`01-urun-modeli.md`](01-urun-modeli.md) invariant 19).

#### Board / List / Card procedure haritası (Faz 2)

> tRPC procedure → gereken board rolü. Enforcement: `boardProcedure` board'u çözer ve `effectiveBoardRole`'u (workspace + board üyeliğinden, `@pusula/domain/permissions`) hesaplar — board yoksa `NOT_FOUND`, erişim yoksa `FORBIDDEN` (board-erişim çözümlemesi paylaşılan `resolveBoardAccess` helper'ında); `cardProcedure` kartı çözer, kartın board'unu `resolveBoardAccess` ile resolve eder, kart context'i (`card_members`: `assignee`/`watcher`) ekler — kart yoksa `NOT_FOUND`. İnce kontrol (`admin` / `member+`) procedure gövdesinde `@pusula/domain/permissions` (`canViewBoard`/`canEditBoardContent`/`canManageBoard`) ile yapılır. Arşivli board salt-okunur (yeni liste/kart eklenemez, içerik düzenlenemez) — her mutation procedure'ünde transaction içinde tekrar okunarak enforce edilir. Faz 2 = statik CRUD; `move`/reorder + drag-drop Faz 3 ([DEM-26](https://linear.app/demirkol/issue/DEM-26) — [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.1). Procedure iskeleti ve router listesi: [`../architecture/03-backend.md`](../architecture/03-backend.md) (Faz 2 — board / list / card procedure'leri).

| Procedure       | Middleware                                                               | Gereken rol                             | Not                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board.list`    | `workspaceProcedure`                                                     | workspace `member+`                     | Erişilebilir board'lar (workspace owner/admin tümü; guest yalnızca davetli); her satırda effective board rolü döner                                                                                                                                           |
| `board.create`  | `workspaceProcedure`                                                     | workspace `member+` (`guest` hariç)     | Oluşturan board `admin` üye olur; `activity_events` (`board.created`)                                                                                                                                                                                         |
| `board.get`     | `boardProcedure`                                                         | board `viewer+`                         | Board + listeler (arşivli dahil, `position` sıralı) + aktif kartlar (`position` sıralı, her kart kendi etiketlerini `cards[].labels` ile taşır — Faz 2.5E)                                                                                                    |
| `board.update`  | `boardProcedure`                                                         | board `admin` (`canManageBoard`)        | Başlık ve `background`; arka plan seçimi rename ile aynı kapıdan geçer (admin-only; member/viewer `FORBIDDEN`); `background` kanonik formatları: `null` (varsayılan), `gradient:<ad>`, `solid:<ad>`, `image:<attachmentId>` (Faz 8.X — [DEM-242](https://linear.app/demirkol/issue/DEM-242)); image upload + select de aynı admin yetkisinden geçer (board admin yükler, board admin seçer); arşivli board düzenlenemez; idempotent (aynı başlık/arka plan → `changed:false`); `boards.version` artar |
| `board.backgroundUploadInitiate` (Faz 8.X) | `boardProcedure` | board `admin` (`canManageBoard`) | Image board background için presigned PUT URL + draft `attachments` satırı (`kind='board_background'`, `committed_at NULL`); arşivli board reddedilir; mime allowlist (`JPEG/PNG/WebP/AVIF`) + size limit (10 MiB) sunucu-tarafı doğrulanır; `activity_events` / `realtime_events` üretmez (draft) |
| `board.backgroundUploadCommit` (Faz 8.X)   | `boardProcedure` | board `admin` (`canManageBoard`) | Draft attachment'ı commit eder + `boards.background = 'image:<attachmentId>'` + `boards.version + 1` + `activity_events.board.background_changed` + `realtime_events` outbox aynı tx; eski image background (`kind='board_background'`) varsa `attachments` DELETE (aynı tx) + storage cleanup `pusula-attachment-cleanup` BullMQ job (best-effort) |
| `board.archive` | `boardProcedure`                                                         | board `admin`                           | `archived_at` (set/restore); arşivli board salt-okunur; idempotent; `boards.version` artar                                                                                                                                                                    |
| `list.create`   | `boardProcedure`                                                         | board `member+` (`canEditBoardContent`) | Board sonuna `position` (`@pusula/domain/position` — boş board `firstPosition`, aksi son listenin ardı); arşivli board'a liste eklenemez; `boards.version` artar                                                                                              |
| `list.update`   | `boardProcedure`                                                         | board `member+`                         | Yeniden adlandırma; arşivli board düzenlenemez; idempotent; `boards.version` artar                                                                                                                                                                            |
| `list.archive`  | `boardProcedure`                                                         | board `member+`                         | `archived_at` (set/restore); arşivli liste aktif kart almaz (yeni kart eklenemez); idempotent; `boards.version` artar                                                                                                                                         |
| `card.create`   | `protectedProcedure` (listenin board'unu `resolveBoardAccess` ile çözer) | board `member+`                         | `createCardInput` yalnızca `listId` taşır → liste transaction içinde okunur, board ondan türetilir; liste sonuna `position`; kart `board_id` = listenin board'u (**kart ⊆ liste.board invariant'ı**); arşivli board/listeye eklenemez; `boards.version` artar |
| `card.get`      | `cardProcedure`                                                          | board `viewer+`                         | Kart detayı + kullanıcının kart ilişkileri (`card_members`)                                                                                                                                                                                                   |
| `card.update`   | `cardProcedure`                                                          | board `member+`                         | Başlık → `card.renamed`, açıklama → `card.description_changed`, `due_at` set → `card.due_set` / null → `card.due_cleared` (her değişen alan ayrı activity); arşivli board düzenlenemez; idempotent; `boards.version` artar                                    |
| `card.archive`  | `cardProcedure`                                                          | board `member+`                         | `archived_at` (set/restore); arşivli board düzenlenemez; idempotent; `boards.version` artar                                                                                                                                                                   |

Activity: `board.created/renamed/archived`, `list.created/renamed/archived`, `card.created/renamed/description_changed/due_set/due_cleared/archived` ilgili transaction'da `activity_events`'e yazılır (bu tipler [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) taksonomisinde zaten tanımlı; Faz 2'de bu alt küme `ACTIVITY_EVENT_TYPES`'a eklenir). Realtime yayın Faz 5, bildirim outbox Faz 6.

#### Board / Card içerik procedure haritası (Faz 2.5)

> tRPC procedure → gereken board rolü. Faz 2.5 ([DEM-48](https://linear.app/demirkol/issue/DEM-48)) = kart detayı (yorum/checklist/üye/etiket/due) + board işbirliği (board üyeleri/davetler/etiketler). Enforcement: `cardProcedure` (Faz 2C — kartı + board erişimini çözer, `ctx.card`) ve `boardProcedure` (Faz 2A — board'u + `effectiveBoardRole`'ü çözer, `ctx.board`) yeniden kullanılır; yeni middleware yok. İnce kontrol procedure gövdesinde `@pusula/domain/permissions` (`canEditBoardContent` = board `member+`, `canManageBoard` = board `admin`) ile. Arşivli board salt-okunur — her mutation transaction içinde tekrar okunarak enforce edilir. Board içeriği değişen mutation'lar `boards.version`'ı artırır. Router listesi + her procedure'ün notu: [`../architecture/03-backend.md`](../architecture/03-backend.md) (Faz 2.5 — comment / checklist / card.members / card.labels / label / board.members procedure'leri).

| Procedure                               | Middleware           | Gereken rol                                                             | Not                                                                                                                                                                                                                                                             |
| --------------------------------------- | -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comment.list`                          | `cardProcedure`      | board `viewer+`                                                         | Kartın yorumları (`created_at` artan) — silinmiş yorumlar da döner (`deleted_at` set + `body` boş; UI placeholder); ayrı query                                                                                                                                  |
| `comment.create`                        | `cardProcedure`      | board `member+`                                                         | Düz metin (mention Faz 6); `comment.created`                                                                                                                                                                                                                    |
| `comment.update`                        | `cardProcedure`      | board `member+` **ve** (yazan veya board `admin`)                       | `edited_at`; `comment.updated`                                                                                                                                                                                                                                  |
| `comment.delete`                        | `cardProcedure`      | board `member+` **ve** (yazan veya board `admin`)                       | Soft-delete (`deleted_at`); `comment.deleted`                                                                                                                                                                                                                   |
| `checklist.create`                      | `cardProcedure`      | board `member+`                                                         | `checklist.created`                                                                                                                                                                                                                                             |
| `checklist.update` / `checklist.delete` | `cardProcedure`      | board `member+`                                                         | Rename / sil (item'lar cascade); activity yok                                                                                                                                                                                                                   |
| `checklist.item.create`                 | `cardProcedure`      | board `member+`                                                         | `checklist.item_added`                                                                                                                                                                                                                                          |
| `checklist.item.toggle`                 | `cardProcedure`      | board `member+`                                                         | `checklist.item_checked` / `checklist.item_unchecked`                                                                                                                                                                                                           |
| `checklist.item.update` / `reorder`     | `cardProcedure`      | board `member+`                                                         | İçerik düzenle / sırala; activity yok                                                                                                                                                                                                                           |
| `checklist.item.delete`                 | `cardProcedure`      | board `member+`                                                         | `checklist.item_removed`                                                                                                                                                                                                                                        |
| `card.members.add`                      | `cardProcedure`      | board `member+` (kendini `watcher` yapma `viewer`'a da açık)            | Aday `effectiveBoardRole !== null` olmalı (aksi `BAD_REQUEST`); rol `assignee`/`watcher`; idempotent; `card.member_added`                                                                                                                                       |
| `card.members.remove`                   | `cardProcedure`      | board `member+` (kendini `watcher`/atamadan çıkarma `viewer`'a da açık) | İdempotent; `card.member_removed`                                                                                                                                                                                                                               |
| `label.create` / `update` / `delete`    | `boardProcedure`     | board `member+`                                                         | Board scope etiket (`name?`, `color`); `(boardId,color,name)` benzersiz → `CONFLICT`; activity yok                                                                                                                                                              |
| `card.labels.add` / `remove`            | `cardProcedure`      | board `member+`                                                         | Etiket kartın board'una ait olmalı; idempotent; `card.label_added` / `card.label_removed`                                                                                                                                                                       |
| `board.members.list`                    | `boardProcedure`     | board `viewer+`                                                         | Explicit `board_members` (ad/rol — e-posta yok, gizlilik) + inherited owner/admin'ler `inherited: true` ile işaretli                                                                                                                                            |
| `board.members.add`                     | `boardProcedure`     | board `admin`                                                           | `email` ile; workspace üyesini doğrudan ekler / hesabı olan non-member'ı `guest` yapıp ekler / hesabı yoksa `board_invitations` daveti; `board.member_added` (+ `workspace.member_added`) ya da `board.member_invited`                                          |
| `board.members.updateRole`              | `boardProcedure`     | board `admin`                                                           | Yalnızca explicit satır; son board `admin` düşürülemez; `board.member_role_changed`                                                                                                                                                                             |
| `board.members.remove`                  | `boardProcedure`     | board `admin` (üye kendini = board'dan ayrıl)                           | Yalnızca explicit satır; son board `admin` çıkarılamaz; `board.member_removed`                                                                                                                                                                                  |
| `board.invitations.list`                | `boardProcedure`     | board `member+` (yönetim `admin`)                                       | Board'un `pending` davetleri                                                                                                                                                                                                                                    |
| `board.invitations.revoke`              | `boardProcedure`     | board `admin`                                                           | `status = revoked`; `board.invitation_revoked`                                                                                                                                                                                                                  |
| `board.invitations.mine`                | `protectedProcedure` | (oturum)                                                                | Kullanıcının e-postasına gelen `pending`, süresi dolmamış board davetleri                                                                                                                                                                                       |
| `board.invitations.accept`              | `protectedProcedure` | (oturum, e-posta eşleşmeli)                                             | Workspace `guest` (gerekirse) + `board_members` insert; `status = accepted`; `workspace.member_added` (yeni eklendiyse) + `board.member_added`; idempotent                                                                                                      |
| `board.invitations.decline`             | `protectedProcedure` | (oturum, e-posta eşleşmeli)                                             | `status = declined`; activity yok                                                                                                                                                                                                                               |
| `board.accessRequests.context`          | `protectedProcedure` | (oturum)                                                                | Paylaşılan board linki için güvenli ön-okuma: board/workspace adı + mevcut hesap + caller'ın erişim durumu + pending talep bilgisi; liste/kart/üye verisi dönmez. `board.get` 403 üretmeden önce no-access landing'i besler.                                    |
| `board.accessRequests.request`          | `protectedProcedure` | (oturum)                                                                | Board-scope erişim talebi oluşturur; aynı `(boardId, requesterId)` için tek `pending` satır; caller zaten board `viewer+` ise no-op sonucu döner. Workspace için ayrı talep tipi yoktur. Yeni bir talep yaratıldığında (idempotent dallar hariç) `board.access_requested` activity event + board admin'lerine `board_access_requested` bildirimi üretilir — DEM-154, kural [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md).                                                                        |
| `board.accessRequests.list`             | `boardProcedure`     | board `admin`                                                           | Board yöneticisi pending talepleri görür (requester ad/e-posta, mesaj, tarih).                                                                                                                                                                                  |
| `board.accessRequests.approve`          | `boardProcedure`     | board `admin`                                                           | Admin yalnızca board rolünü (`member`/`viewer`) seçer. Transaction atomik: requester workspace üyesi değilse önce workspace `guest` eklenir, sonra `board_members` satırı eklenir, talep `approved` olur; workspace üyesiyse yalnızca board membership eklenir. |
| `board.accessRequests.reject`           | `boardProcedure`     | board `admin`                                                           | Pending talebi `rejected` yapar; membership oluşturmaz.                                                                                                                                                                                                         |

Activity (Faz 2.5'te kullanılan, [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) taksonomisinde tanımlı): `comment.created/updated/deleted`, `checklist.created`, `checklist.item_added/item_checked/item_unchecked/item_removed`, `card.member_added/member_removed`, `card.label_added/label_removed`, `board.member_added/member_removed/member_role_changed`, `board.member_invited`, `board.invitation_revoked` — `ACTIVITY_EVENT_TYPES`'a eksik olanlar (`checklist.item_added/checked/unchecked/removed`, `board.member_role_changed`, `board.member_invited`, `board.invitation_revoked`) append edilir; `checklist.item_completed` kullanım dışı bırakılır. Board erişim talebi onayı davet kabulüyle aynı membership activity'lerini üretir: gerekirse `workspace.member_added`, her durumda yeni board membership oluştuysa `board.member_added`. Realtime yayın Faz 5, bildirim outbox Faz 6. Etiket/checklist CRUD ve item edit/reorder activity üretmez ama `boards.version`'ı artırır.

#### Drag-drop / move procedure haritası (Faz 3)

> tRPC procedure → gereken board rolü. Faz 3 ([DEM-26](https://linear.app/demirkol/issue/DEM-26)) = sürükle-bırak; `list.move` + `card.move` backend Faz 3A ([DEM-42](https://linear.app/demirkol/issue/DEM-42)); cross-board `card.moveToList` + `card.copy` Faz 3E ([DEM-69](https://linear.app/demirkol/issue/DEM-69)). Enforcement: `list.move` `boardProcedure` ile (`moveListInput` `boardId` taşır, `createListInput` ile aynı disiplin); `card.move` `cardProcedure` ile (`moveCardInput` `cardId` ile anahtarlı — kart context'i `boardId`/`boardRole`/`listId`/`boardArchivedAt` taşır; tüm `card.*` ile tutarlı); `card.moveToList`/`card.copy` da `cardProcedure` (kaynak kart) + hedef listenin board'una `resolveBoardAccess` ile ek kontrol. İnce kontrol procedure gövdesinde `@pusula/domain/permissions` (`canEditBoardContent` = board `member+`, `canViewBoard` = `viewer+`) ile. Arşivli board/liste salt-okunur (drop hedefi olamaz); tx içinde tekrar okunarak enforce edilir; move/copy `boards.version`'ı artırır. Server akışı: [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.1; router notları: [`../architecture/03-backend.md`](../architecture/03-backend.md) (Faz 3 — `list.move` / `card.move`; Faz 3E — `card.moveToList` / `card.copy`); cross-board invariant'ları: [`01-urun-modeli.md`](01-urun-modeli.md) invariant 16; sıralama semantiği + eşzamanlı taşıma + compaction: [`03-siralama-kurallari.md`](03-siralama-kurallari.md).

| Procedure         | Middleware               | Gereken rol                                                                              | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list.move`       | `boardProcedure`         | board `member+` (`canEditBoardContent`)                                                  | Listeyi board içinde reorder; `before`/`after` listelere göre `positionBetween` (veya client `newPosition` doğrulanır); arşivli board reddedilir; `activity_events` (`list.moved` — eski/yeni `position`); idempotent (`clientMutationId`; no-op → `changed:false`); `boards.version` artar                                                                                                                                                                                                                                                               |
| `card.move`       | `cardProcedure`          | board `member+` (`canEditBoardContent`)                                                  | Kartı **aynı board içinde** reorder (`toListId === fromListId`) veya başka listeye taşır; kart hâlâ `fromListId`'de değilse `CONFLICT` (eşzamanlı taşıma); `toListId` aynı board'a ait + arşivli değil (kart ⊆ liste.board invariant'ı — başka board'a taşıma `card.moveToList`); `positionBetween` (veya client `newPosition` doğrulanır); arşivli board reddedilir; `activity_events` (`card.moved` — `fromListId`/`toListId`, eski/yeni `position`); idempotent (`clientMutationId`; no-op → `changed:false`); `boards.version` artar                  |
| `card.moveToList` | `cardProcedure` (kaynak) | kaynak board `member+` **ve** hedef listenin board'unda `member+` (`resolveBoardAccess`) | Kartı herhangi bir listeye (aynı/başka board) taşır; hedef liste/board arşivli → `BAD_REQUEST`; hedef board'da `member+` yoksa `FORBIDDEN`. Cross-board: `cards.board_id` da güncellenir; `card_labels` **silinir** (board-scope); `card_members` korunur; checklist/yorum/activity kartla gelir; `boards.version` her iki board için artar. `activity_events` (`card.moved` — `fromListId`/`toListId` + cross-board ise `fromBoardId`/`toBoardId` + eski/yeni `position`). İdempotent (`clientMutationId`; no-op → `changed:false`). Detay: invariant 16 |
| `card.copy`       | `cardProcedure` (kaynak) | kaynak board `viewer+` **ve** hedef listenin board'unda `member+`                        | Kaynaktan yeni kart oluşturur (`title`/`description`/`due_at`/`cover_color` kopyalanır, `completed` sıfırlanır); opsiyonel `includeChecklists`/`includeMembers`/`includeLabels` (members → hedef board'a erişimi olanlar; labels → yalnız same-board); `comments`/`activity` kopyalanmaz; hedef liste arşivli → `BAD_REQUEST`. `activity_events` (`card.created` — `copiedFromCardId` payload'da); hedef `boards.version` artar. **İdempotent değil** (`card.create` gibi). Detay: invariant 16                                                           |

Activity: `list.moved`, `card.moved`, `card.created` ilgili transaction'da `activity_events`'e yazılır ([`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) taksonomisinde + `ACTIVITY_EVENT_TYPES`'ta zaten tanımlı; `card.moved` payload'u cross-board için `fromBoardId`/`toBoardId`, `card.created` kopya için `copiedFromCardId` ile genişletilir — additive). Realtime yayın Faz 5, bildirim outbox Faz 6.

### Card (ilgi rolleri — yetki değil)

- `assignee`: karta atanmış; due-date ve kart değişikliği bildirimleri alır; board yetkisi varsa düzenleyebilir.
- `watcher`: kartı izliyor; ilgili event'lerde bildirim alır; düzenleme yetkisi board rolünden.

### Hesap (User) — öz-yönetim

Workspace/board/card rollerinden bağımsız: her kullanıcı yalnızca **kendi** hesabını yönetir.

| İşlem                                  | Yetki                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Adını / avatarını (basit URL) değiştir | kendi (Better Auth `updateUser`)                                                                   |
| Parolasını değiştir                    | kendi (Better Auth `changePassword`; `currentPassword` doğrulanır, başarıda diğer oturumlar iptal) |
| Hesabını sil                           | kendi — **ancak** hiçbir workspace'in `owner`'ı değilse (`@pusula/domain` `canDeleteOwnAccount`)   |

> **Hesap silme:** Kullanıcı bir veya daha fazla workspace'in `owner`'ıysa hesap silme **engellenir** (`BAD_REQUEST` — açıklayıcı mesaj). Ownership transfer henüz yok; kullanıcı önce o workspace'leri silmeli/arşivlemeli/devretmeli. `workspaces.ownerId` FK'sı `onDelete: 'restrict'` olduğundan DB de reddeder; enforcement noktası Better Auth `beforeDelete` hook'u (auth altyapısı + cascade ayrıntısı → [`../architecture/07-auth.md`](../architecture/07-auth.md) (Profil & hesap yönetimi), invariant → [`01-urun-modeli.md`](01-urun-modeli.md) invariant 14). Bu uçlar tRPC'de değil — doğrudan Better Auth (`/api/auth/*`); web ekranı → [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.7.

### Hızlı Not (Quick Note) — kişisel kayıt (DEM-203)

Workspace/board/card rollerinden bağımsız: Hızlı Not **kişiye özel ve globaldir** — "Board favorisi"yle aynı _kişisel kayıt_ desenidir (bkz. [`01-urun-modeli.md`](01-urun-modeli.md) invariant 20–22). Yetkilendirme tek kurala dayanır: **sahiplik**. Bir Hızlı Not yalnız sahibi (`quick_notes.user_id === session.user.id`) tarafından listelenir/oluşturulur/düzenlenir/silinir; başka hiçbir kullanıcı — workspace owner/admin dahil — erişemez. Workspace/board üyeliği Hızlı Not'a hiçbir yetki **vermez**.

| İşlem                           | Yetki                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hızlı Notları listele           | yalnız sahip (`protectedProcedure` — yalnızca `user_id === session.user.id` satırlar döner)                                                                            |
| Hızlı Not oluştur               | yalnız sahip (oturum açmış kullanıcı kendi adına; `user_id` daima `session.user.id`'den gelir, input'tan değil)                                                        |
| Hızlı Not güncelle (`content`)  | yalnız sahip — başka kullanıcının notu için `NOT_FOUND` (varlık sızdırılmaz; `FORBIDDEN` yerine `NOT_FOUND`)                                                           |
| Hızlı Not sil                   | yalnız sahip — başka kullanıcının notu için `NOT_FOUND`                                                                                                                |
| Hızlı Not'u karta dönüştür      | yalnız not sahibi **ve** ek olarak **hedef listenin board'unda `member+`** (`effectiveBoardRole` ∈ {`admin`,`member`} — kart oluşturma yetkisi); hedef liste/board arşivli olamaz |

> **`quickNote.convertToCard` çift kontrol:** caller hem Hızlı Not'un **sahibi** olmalı (aksi `NOT_FOUND`) hem de hedef listenin board'unda **kart oluşturma yetkisine** sahip olmalı — `resolveBoardAccess` ile hedef listenin board'u çözülür ve `canEditBoardContent` (board `member+`) kontrol edilir; `viewer` veya erişimsiz kullanıcı `FORBIDDEN`. Arşivli hedef liste/board `BAD_REQUEST`. Atomik transaction: kart oluşturulur (`card.create` ile aynı invariant'lar + `card.created` activity) + Hızlı Not satırı silinir (sessiz — activity/realtime/outbox üretmez; invariant 22). Kart oluşturma adımı `card.create` yetki/idempotency disiplinine uyar. tRPC enforcement: `protectedProcedure` (sahiplik) → hedef liste board'u `resolveBoardAccess`. Procedure haritası → [`../architecture/03-backend.md`](../architecture/03-backend.md).

## Enforcement kuralları

- Her mutation/query procedure: önce session, sonra workspace, sonra (varsa) board, sonra (varsa) card/list permission — eksikse `FORBIDDEN`/`UNAUTHORIZED`.
- Realtime room join'de aynı kontrol uygulanır (`board:{id}` room'a join ancak board erişimi varsa).
- Davet token'ları süreli (expiration) ve tek kullanımlık mantığıyla işlenir; bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.6.

## Faz 8E — Audit log permission ([DEM-282](https://linear.app/demirkol/issue/DEM-282))

> Audit log = compliance + forensic; `activity_events` ile dublike değil. Mimari detay: [`../architecture/17-audit-log-mimarisi.md`](../architecture/17-audit-log-mimarisi.md).

| Aksiyon | Kim |
|---|---|
| Audit log'a **yazma** | Sistem (mutation tx içinde otomatik — `appendAudit` helper); herhangi bir kullanıcı mutation'ı tetikleyebilir (eylem audit'e düşer) |
| Audit log'u **görüntüleme** (`audit.list`) | **Yalnız workspace owner** — admin değil, member değil. `assertWorkspaceOwner` guard reddi: `FORBIDDEN` + "Audit log yalnız workspace owner tarafından görüntülenebilir." |
| Audit log'u **düzenleme** | **Kimse** — DB trigger UPDATE reddi (`audit_log_no_update`); `actor_id` ON DELETE SET NULL cascade istisnası tek izin |
| Audit log'u **silme** | App layer: convention (`appendAudit` dışında DELETE çağrısı YOK); DB layer: workspace silme CASCADE ile audit'i wipe eder (`audit_log_no_delete` trigger 0044'te düşürüldü — gerekçe [`../architecture/17-audit-log-mimarisi.md`](../architecture/17-audit-log-mimarisi.md) §2.1) |

**Kapsam (yalnız kritik):** `workspace.delete`, `workspace.member.role_change`, `workspace.member.remove`, `workspace.invitation.revoke`, `board.delete`, `board.member.role_change`, `board.member.remove`, `board.invitation.revoke`, `card.delete`, `attachment.delete`, `share.create`, `share.revoke` — toplam **12 action enum** (`@pusula/domain` `AUDIT_ACTIONS`).

**Bugünkü caller'lar (10 — 2026-05-24 implementasyon):**

| Action | Procedure | Not |
|---|---|---|
| `workspace.delete` | `workspace.delete` | hard delete; audit önce yazılır + workspace DELETE cascade audit'i de wipe eder (CASCADE FK 0043); before = `{ name }`, after = `null` |
| `workspace.member.role_change` | `workspace.members.updateRole` | before/after = `{ role }` |
| `workspace.member.remove` | `workspace.members.remove` | self-leave dahil; before = `{ role }`, after = `null` |
| `workspace.invitation.revoke` | `workspace.invitations.revoke` | before/after = `{ status, email }` |
| `board.member.role_change` | `board.members.updateRole` | before/after = `{ boardId, role }` |
| `board.member.remove` | `board.members.remove` | self-leave dahil; before = `{ boardId, role }`, after = `null` |
| `board.invitation.revoke` | `board.invitations.revoke` | before/after = `{ status, email, boardId }` |
| `attachment.delete` | `attachment.delete` | hard delete; before = `{ cardId, fileName, mimeType, size }`, after = `null` |
| `share.create` | `share.create` | token plain bir kerelik response'ta; before = `null`, after = `{ cardId, tokenPrefix, expiresAt }` |
| `share.revoke` | `share.revoke` | before = `{ revokedAt: null, cardId }`, after = `{ revokedAt, cardId }` |

**Caller'sız enum girdileri (forward-compat 2):**
- `board.delete`, `card.delete`: kodda hard delete mutation yok (yalnız `archive` var ve archive reversible → criterion-1 dışı). Hard delete eklendiğinde caller hazır (enum + helper imzası). Karar: 2026-05-24.

**Retention:** Workspace yaşadığı sürece süresiz. Workspace silindiğinde **CASCADE** ile audit kayıtları temizlenir (kullanıcı kararı 2026-05-24 — RESTRICT pratikte uygulanamadı; gerekçe [`../architecture/17-audit-log-mimarisi.md`](../architecture/17-audit-log-mimarisi.md) §2.1). GDPR "right to erasure" → `actor_id` SET NULL (anonimleştirme); satır kalır. DB trigger immutability UPDATE'i (cascade istisnası hariç) reddeder; DELETE trigger 0044 ile düşürüldü → forensic guarantee app convention + UPDATE trigger.

## Faz 8F — Permission edge case envanteri ([DEM-283](https://linear.app/demirkol/issue/DEM-283))

Mevcut permission kapıları (member/admin/owner) genel mutation'ları kapatıyor; **edge case'ler** (yarış koşulları + arşiv + expired davet + owner devir + cross-board) burada listelenir + Faz 8F'de implement edilir + test edilir.

### Edge case 1 — Rol değişimi yarış koşulu

**Senaryo:** Alice (board admin) board üye listesini açıyor; Bob (owner) Alice'i `member`'a düşürüyor; Alice "üye sil" tıklıyor (cache'inde hâlâ admin gözüküyor).

**Beklenen davranış:** `board.members.remove` mutation'ı server-side permission check'i ile reddedilir (`FORBIDDEN`). UI Türkçe hata mesajı gösterir: **"Yetkiniz artık yetersiz; sayfayı yenileyin."**

**Implementation (Faz 8F):** Mevcut `assertBoardAdmin` guard yeterli — UI hata mesajı yeni (`strings.permission.staleRole`). Vitest: cache stale + role downgrade → mutation reject senaryosu.

### Edge case 2 — Davet süresi dolması

**Senaryo:** Alice 1 ay önce Bob'u workspace'e davet etti; Bob davet linkine tıklıyor — link hâlâ açılıyor, hâlâ "Kabul Et" butonu var, kabul edince workspace'e giriyor (expiry kontrolü yok!).

**Beklenen davranış:** Davet token'ları **maksimum 30 gün** geçerli (Trello/Linear paterni). Süre dolunca `accept` mutation'ı `BAD_REQUEST` + Türkçe mesaj: **"Davet süresi dolmuş. Davet edenden yeni link isteyin."**

**Implementation (Faz 8F):**
1. `workspace_invitations.expires_at` + `board_invitations.expires_at` kolonları (varsa kontrol; yoksa migration — default `created_at + INTERVAL '30 days'`).
2. `accept` mutation: `expires_at < NOW()` reddet.
3. Worker `pusula-invitation-expiry-sweeper` (gece 03:00 cron): expired davet'leri `revoked_at = NOW()` damgalar (UI'da "Süresi dolmuş" olarak görünür).
4. Davet linkine tıklayan kullanıcı için frontend Türkçe hata sayfası.

### Edge case 3 — Arşiv etkileşimleri matrisi

**Sorun:** Arşivli board/list/card mutation reject **dağınık** — bazı procedure'lerde kontrol var, bazısında yok. Tutarlılık zayıf.

**Hedef:** Tek noktadan `assertNotArchived(entity)` helper (`packages/api/src/lib/archive-guard.ts`); tüm collaborative mutation'larda çağrı.

**Matris:**

| Entity arşivli | İzin verilen mutation | Reddedilen mutation |
|---|---|---|
| Board arşivli | `board.unarchive` + `board.delete` + `audit.list` | Tüm board/list/card mutation'ları (create/update/move/comment/...) |
| List arşivli | `list.unarchive` + `list.delete` + read | Yeni kart, kart taşıma (hedef bu liste), liste update |
| Card arşivli | `card.unarchive` + `card.delete` + read | Yorum, checklist, atama, etiket, due date, kart taşıma |

**Implementation (Faz 8F):** `assertNotArchived` helper + ilgili 20+ mutation'da çağrı + Vitest matris testi (her mutation × her arşiv durumu).

### Edge case 4 — Owner self-demote (rol kendini düşürme)

**Senaryo:** Workspace owner kendi rolünü `admin`'e düşürmeye çalışıyor → owner'sız workspace oluşur (kritik invariant ihlali!).

**Beklenen davranış:** `workspace.members.updateRole` reddedilir (`BAD_REQUEST` + Türkçe: **"Owner kendi rolünü düşüremez. Önce başka bir üyeyi owner yapın."**).

**Implementation (Faz 8F):** `assertOwnerNotSelfDemoting(ctx, workspaceId, targetUserId, newRole)` helper — `targetUserId === ctx.session.userId && newRole !== 'owner' && currentRole === 'owner'` ise reject. Audit log: rol değişimi `workspace.member.role_change` audit kaydı üretir; reject edilen değişim audit'e yazılmaz.

**İlgili:** Hesap silme `canDeleteOwnAccount` ([DEM-212](https://linear.app/demirkol/issue/DEM-212)) son owner check'i zaten var; bu pattern paralel.

### Edge case 5 — Cross-board permission (card.moveToList)

**Senaryo:** Alice board A'da admin, board B'de viewer; `card.moveToList` ile board A'dan board B'ye kart taşımaya çalışıyor (board B'de yazma yetkisi yok).

**Beklenen davranış:** Mutation reddedilir — Alice **hem source board'da** kart taşıma yetkisine (member+), **hem target board'da** kart yazma yetkisine (member+) sahip olmalı.

**Implementation:** `card.moveToList` (Faz 3E [DEM-69](https://linear.app/demirkol/issue/DEM-69)) zaten cross-board permission kontrolü içeriyor — **test eksik**. Faz 8F: Vitest matris testi (admin/member/viewer × source board + target board, 9 senaryo).

### Edge case 6 — Workspace silme + audit retention çatışması

**Senaryo:** Workspace owner workspace'i silmek istiyor; audit log satırları var (`audit_log.workspace_id` FK).

**Beklenen davranış:** Workspace silme **reject** edilir (`BAD_REQUEST` + Türkçe: **"Bu workspace'te audit log kayıtları var. Önce audit log'u dışa aktarın, sonra workspace'i silin."**). DB seviyesinde `ON DELETE RESTRICT` zorlar.

**Implementation:** DB FK constraint yeterli (audit log migration'ında `ON DELETE RESTRICT`); API silme procedure'ünde `try/catch` ile FK violation → Türkçe `BAD_REQUEST`. UI'da "Audit log'u dışa aktar" butonu (Faz 8 sonrası ayrı issue).

### Faz 8F uygulama notu (2026-05-24 — DEM-283)

8.0'daki envanter 6 edge case tanımladı; 8F'de gerçek implementasyonu şu şekilde dağıldı:

| Edge case | Önce-implementasyon durumu | 8F çıktısı |
|---|---|---|
| 1 — Rol race | Server-side reject zaten var (`assertBoardAdmin` mevcut) | UI'ye Türkçe mesaj (`"Yetkiniz artık yetersiz; sayfayı yenileyin."`) frontend tarafında ekleme (UI scope'u ayrı; server PR'ı sadece reject sözleşmesini koruyor) |
| 2 — Davet expiry | `accept` mutation `expires_at <= NOW()` reddi zaten **var** (workspace + board); reddedilen davet `status='expired'` damgalanıyor | **Türkçe mesaj standardı** `packages/api/src/lib/permission-strings.ts` (`INVITATION_MESSAGES.expired = 'Davet süresi doldu. Davet edenden yeni link isteyin.'` + diğer 3 davet mesajı tek noktadan). **Yeni worker:** `apps/worker/src/jobs/invitation-expiry-sweeper.ts` (daily 03:00 UTC, BullMQ cron) — tıklanmamış expired davetleri proaktif olarak `status='expired'` damgalar (admin yönetim ekranında "Bekliyor" sahte göstermek yerine "Süresi dolmuş") |
| 3 — Arşiv matrisi | Dağınık (`if (board.archivedAt)` 25 dosyada elle) | **Yeni helper:** `packages/api/src/lib/archive-guard.ts` (`assertNotArchived(entity, row, message?)` — workspace/board/list/card). 13 router dosyasındaki 31 elle kontrolün tamamı helper çağrısına dönüştü. Default Türkçe mesajlar 8F öncesi yaygın olanlarla eşitlendi (regression yok); context-spesifik mesajlar override ile (`"Arşivli board'a liste eklenemez."` vs `"Arşivli listeye kart taşınamaz."`) |
| 4 — Owner self-demote | `workspace.members.updateRole` `target.role === 'owner'` reject ile **zaten kapalı** (workspace.ts:98–103, `"Owner rolü değiştirilemez; önce devredilmeli."`). Bu kural "owner kim olursa olsun (kendi dahil) rolden indirilemez" demek; self-demote ayrı bir helper'a gerek yok | Sadece test (mevcut `workspace.test.ts:141–165` zaten kapsıyor) |
| 5 — Cross-board | `card.moveToList` (Faz 3E [DEM-69](https://linear.app/demirkol/issue/DEM-69)) cross-board permission'ı `resolveBoardAccess` ile zaten enforce ediyor | Mevcut test zaten kapsıyor (`card.test.ts:1535` "no edit access on target board → FORBIDDEN") |
| 6 — Workspace silme + audit FK | DEM-282 (Faz 8E) audit log migration kapsamında | 8F'de yok — 8E'ye ait |

**Yeni kod birimleri:**

* `packages/api/src/lib/archive-guard.ts` — `assertNotArchived` + 4 entity default mesaj (test: `archive-guard.test.ts`, 11 case).
* `packages/api/src/lib/permission-strings.ts` — `INVITATION_MESSAGES` (4 mesaj: `notFound`/`noLongerValid`/`expired`/`wrongEmail`). `workspace.ts` + `board-invitations.ts` davet akışlarında 8'er literal kullanım bu sözlüğe taşındı.
* `apps/worker/src/jobs/invitation-expiry-sweeper.ts` — `sweepExpiredInvitations` (test: `invitation-expiry-sweeper.test.ts`, 7 case). Pattern: `reportRetention` daily cron + `attachment-cleanup-sweeper` storage-first disiplin (burada storage yok, sadece DB UPDATE).
* `apps/worker/src/queues.ts` — `invitationExpirySweeperQueue` (`pusula-invitation-expiry-sweeper`).
* `apps/worker/src/index.ts` — sweeper worker + cron register (`0 3 * * *`).

**Test:** archive-guard 11/11 + invitation-expiry-sweeper 7/7 + etkilenen router test'leri (list/card/comment/checklist/card-labels/card-members/label) 158/158 PASS. Davet mesajı string'ini doğrudan match eden test yoktu (testler `code: 'BAD_REQUEST'` üzerinden kontrol ediyor) — konsolidasyon regression yapmadı.

**Önemli sınırlandırma:** Edge case 1'in UI mesajı (`"Yetkiniz artık yetersiz; sayfayı yenileyin."`) backend PR'ı dışında — frontend tRPC reject'i yakalayıp gösterecek (UI scope'u zaten 8A E2E ile birlikte gidecek). Server sözleşmesi (`FORBIDDEN` reject) bu PR'da sabitlendi.
