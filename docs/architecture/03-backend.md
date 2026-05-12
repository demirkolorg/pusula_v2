---
title: "03 — Backend"
description: "Hono HTTP kabuğu, tRPC sözleşmesi ve worker sorumlulukları."
aliases:
  - "Backend"
  - "Hono tRPC Worker"
tags:
  - "pusula"
  - "architecture/backend"
  - "backend"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 03 — Backend (Hono + tRPC + Worker)

> Eksen: **tasarım / teknik**. Yetkilendirme **kuralları** (kim ne yapabilir) için
> [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md); enforcement noktası burada/[`07-auth.md`](07-auth.md).

## İki ana parça

- `apps/api` (`@pusula/api-server`): HTTP server, tRPC endpoint, webhook, Better Auth callback, healthcheck, metrics, Socket.IO.
- `apps/worker` (`@pusula/worker`): Bildirim, outbox, scheduled job, retry, background task. Bkz. [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md), [`10-platform.md`](10-platform.md).

## Akış

```txt
Client → tRPC client → Hono server → tRPC router → service/domain layer → Drizzle transaction → PostgreSQL
```

## Hono'nun işi (HTTP concerns)

CORS · request id · logging · rate limiting · auth context hazırlığı · webhook endpoint'leri ·
healthcheck · metrics endpoint'leri · tRPC handler mount · Better Auth (`${API_URL}/api/auth/*`) ·
Socket.IO mount. Hono burada **kabuk**tur; iş mantığı taşımaz.

## tRPC'nin işi (API sözleşmesi)

Type-safe query & mutation · client-side inference · web + mobil ortak sözleşme ·
procedure-level auth & permission · TanStack Query entegrasyonu.

- tRPC paketi: `@pusula/api` (`packages/api`) — root router, board/list/card/comment/notification router'ları, auth context, rate-limit & permission middleware'leri.
- `protectedProcedure` (in `@pusula/api`) non-null session garantiler; üzerine workspace → board → card/list permission kontrollerini katmanla.
- **Hono RPC ile tRPC aynı anda ana API sözleşmesi yapılmaz.** Source of truth tek: tRPC.

### Bir mutation procedure'ün iskeleti

```txt
protectedProcedure (session check)
  → workspace access kontrolü
  → board access kontrolü
  → card/list permission kontrolü
  → input validasyonu (Zod, @pusula/domain)
  → Drizzle transaction:
      - domain mutasyonu
      - activity_events insert
      - realtime_events insert
      - notification_outbox insert
  → sonuç (clientMutationId ile reconcile için)
```

Permission kontrolü her procedure'de **server-side**; frontend state'e güvenilmez. Realtime room
erişimi de server-side board/workspace permission'dan türetilir.

### Scoped procedure middleware'leri

Yukarıdaki zincir (`session → workspace → board → card/list`) her procedure'de elle tekrarlanmaz;
katmanlı procedure tipleriyle DRY tutulur. Permission **kuralları** (kim ne yapabilir) `@pusula/domain`
ve [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)'da kalır; bu
middleware'ler yalnızca **enforcement** noktasıdır — "üye mi?" kapısını açar, ince yetki kontrolünü
(`canManageWorkspace`, `canEditBoardContent`, …) procedure gövdesi yapar.

- `workspaceProcedure` = `protectedProcedure` + `workspaceId`'yi input'tan okuyup kullanıcının `workspace_members` kaydını çözen middleware. Workspace yoksa `NOT_FOUND`, üyelik yoksa `FORBIDDEN`; varsa `ctx.workspace = { id, role }` eklenir. (Faz 1)
- `boardProcedure` = board'u çözer ve `effectiveBoardRole` sonucunu (workspace + board üyeliğinden, `@pusula/domain/permissions`) hesaplar; `ctx.board = { id, workspaceId, role }` ekler. (Faz 2) — board-erişim çözümlemesi (board → workspace üyeliği → board üyeliği → `effectiveBoardRole`; `NOT_FOUND`/`FORBIDDEN`) paylaşılan `resolveBoardAccess` helper'ında; `cardProcedure` ve `card.create` de bunu kullanır.
- `cardProcedure` = kartı çözer, kartın board'unu `resolveBoardAccess` ile resolve eder, kullanıcının kart ilişkisini (`card_members`: `assignee`/`watcher`) ekler; `ctx.card = { id, listId, boardId, workspaceId, archivedAt, boardRole, boardArchivedAt, relations }`. Kart yoksa `NOT_FOUND`. (Faz 2C)

`@pusula/api` içindeki `permission middleware`'leri bu katmanı uygular; rate-limit middleware'i de aynı
zincirde yer alır (bkz. [`10-platform.md`](10-platform.md)).

### Faz 2 — board / list / card procedure'leri

> Faz 2 = **statik CRUD** (create sona ekler, alan günceller, arşivler). `move`/reorder ve drag-drop **Faz 3** kapsamı ([DEM-26](https://linear.app/demirkol/issue/DEM-26) — [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.1); optimistic UI **Faz 4** ([DEM-27](https://linear.app/demirkol/issue/DEM-27)); realtime yayın **Faz 5** ([DEM-28](https://linear.app/demirkol/issue/DEM-28)); bildirim outbox **Faz 6** ([DEM-29](https://linear.app/demirkol/issue/DEM-29)). Procedure → rol haritası: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / List / Card procedure haritası).

| Router | Procedure | Middleware | Not |
| --- | --- | --- | --- |
| `board` | `list` | `workspaceProcedure` | Kullanıcının erişebildiği board'lar (workspace owner/admin tüm board'lar; guest yalnızca davetli) |
| `board` | `create` | `workspaceProcedure` | workspace `member+`; oluşturan board `admin` üye olur; `activity_events` (`board.created`) |
| `board` | `get` | `boardProcedure` | Board + listeleri + kartları (board ekranının ilk yükü) |
| `board` | `update` | `boardProcedure` | board `admin`; başlık vb.; `activity_events` (`board.renamed`) |
| `board` | `archive` | `boardProcedure` | board `admin`; `archived_at`; arşivli board salt-okunur; `activity_events` (`board.archived`) |
| `list` | `create` | `boardProcedure` | board `member+`; board sonuna `position` (`@pusula/domain/position`); arşivli board'a liste eklenemez; `activity_events` (`list.created`); `boards.version` artar |
| `list` | `update` | `boardProcedure` | board `member+`; yeniden adlandırma; arşivli board salt-okunur; `activity_events` (`list.renamed`); `boards.version` artar |
| `list` | `archive` | `boardProcedure` | board `member+`; `archived_at` (set/restore); arşivli liste aktif kart almaz (yeni kart eklenemez); `activity_events` (`list.archived`); `boards.version` artar |
| `card` | `create` | `protectedProcedure` (listenin board'unu `resolveBoardAccess` ile çözer) | `createCardInput` yalnızca `listId` taşır → liste transaction içinde okunur, board ondan türetilir; board `member+`; liste sonuna `position`; kart `board_id` = listenin board'u (**kart ⊆ liste.board invariant'ı**); arşivli board/listeye eklenemez; `activity_events` (`card.created`); `boards.version` artar |
| `card` | `get` | `cardProcedure` | board `viewer+`; kart detayı + kullanıcının kart ilişkileri (`card_members`) |
| `card` | `update` | `cardProcedure` | board `member+`; arşivli board salt-okunur; başlık → `card.renamed`, açıklama → `card.description_changed`, `due_at` set → `card.due_set` / null → `card.due_cleared` (her değişen alan için ayrı activity); `boards.version` artar |
| `card` | `archive` | `cardProcedure` | board `member+`; `archived_at` (set/restore); arşivli board salt-okunur; `activity_events` (`card.archived`); `boards.version` artar |

Faz 2 dışı (ileri faz): `list.move` / `card.move` (`moveCardInput` — Faz 3); `board.members.*`, `board.invitations.*`, `label.*`, `card.labels.*`, `card.members.*`, `checklist.*`, `checklist.item.*`, `comment.*`, `attachment.*` (Faz 2.5 / ileri fazlar — bkz. aşağısı). Tüm mutation procedure'leri yukarıdaki **mutation iskeleti**ni izler — Faz 2'de transaction yalnızca `domain mutasyonu + activity_events insert` içerir; `realtime_events` / `notification_outbox` insert'leri Faz 5/6'da devreye girer. Faz 2'de kullanılan activity tipleri (`board.created/renamed/archived`, `list.created/renamed/archived`, `card.created/renamed/description_changed/due_set/due_cleared/archived`) [`../domain/05-aktivite-kurallari.md`](../domain/05-aktivite-kurallari.md) taksonomisinde **zaten tanımlı** — `ACTIVITY_EVENT_TYPES`'a bu alt küme eklenir.

### Faz 2.5 — comment / checklist / card.members / card.labels / label / board.members procedure'leri

> Faz 2.5 ([DEM-48](https://linear.app/demirkol/issue/DEM-48)) = **kart detayı + board işbirliği** — Trello'nun "geri kalan çekirdeği". `move`/reorder ve drag-drop yine **Faz 3**, optimistic UI **Faz 4**, realtime **Faz 5**, bildirim outbox **Faz 6** (Faz 2.5'te transaction yine yalnızca `domain mutasyonu + activity_events` içerir; ayrıca board içeriği değişen mutation'lar `boards.version`'ı 1 artırır). Procedure → rol haritası ve yetki matrisi: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / Card içerik procedure haritası — Faz 2.5). Faz 2.5'te yeni middleware **eklenmez**; `cardProcedure` (Faz 2C) ve `boardProcedure` (Faz 2A) yeniden kullanılır. `comment.list` ve `board.members.list` hariç hepsi mutation; `comment.update`/`comment.delete` "yazan veya board `admin`" kontrolünü procedure gövdesinde yapar.

| Router | Procedure | Middleware | Not |
| --- | --- | --- | --- |
| `comment` | `list` | `cardProcedure` | board `viewer+`; kartın yorumları (`created_at` artan) — silinmiş yorumlar da döner (`deleted_at` set + `body` boşaltılmış → UI "silindi" placeholder'ı gösterir); ayrı query — `card.get` payload'ını şişirmez |
| `comment` | `create` | `cardProcedure` | board `member+`; düz metin (mention parsing **Faz 6**); arşivli board salt-okunur; `activity_events` (`comment.created`); `boards.version` artar |
| `comment` | `update` | `cardProcedure` | board `member+` **ve** (`authorId === userId` veya board `admin`) — aksi `FORBIDDEN`; silinmiş yorum düzenlenemez; `edited_at` set; `activity_events` (`comment.updated`); `boards.version` artar |
| `comment` | `delete` | `cardProcedure` | board `member+` **ve** (yazan veya board `admin`); soft-delete (`deleted_at` set, `body` korunur ya da boşaltılır — kararı implementasyonda; UI "silindi" gösterir); `activity_events` (`comment.deleted`); `boards.version` artar |
| `checklist` | `list` | `cardProcedure` | board `viewer+`; kartın checklist'leri + her birinin item'ları (`position` sıralı) — kart detay modali için ayrı query |
| `checklist` | `create` | `cardProcedure` | board `member+`; karttaki son checklist'in ardına `position` (`@pusula/domain/position`); arşivli board salt-okunur; `activity_events` (`checklist.created`); `boards.version` artar |
| `checklist` | `update` | `cardProcedure` | board `member+`; yeniden adlandırma; idempotent; **activity yok** (board metadata gibi düşük sinyal); `boards.version` artar |
| `checklist` | `delete` | `cardProcedure` | board `member+`; checklist + item'ları (cascade); idempotent; **activity yok**; `boards.version` artar |
| `checklist.item` | `create` | `cardProcedure` | board `member+`; checklist'in sonuna `position`; `activity_events` (`checklist.item_added`); `boards.version` artar |
| `checklist.item` | `toggle` | `cardProcedure` | board `member+`; `completed` set/clear (+ `completed_at`/`completed_by`); idempotent; `activity_events` (`checklist.item_checked` / `checklist.item_unchecked`); `boards.version` artar |
| `checklist.item` | `update` | `cardProcedure` | board `member+`; `content` düzenleme; idempotent; **activity yok**; `boards.version` artar |
| `checklist.item` | `delete` | `cardProcedure` | board `member+`; idempotent; `activity_events` (`checklist.item_removed`); `boards.version` artar |
| `checklist.item` | `reorder` | `cardProcedure` | board `member+`; item'ı checklist içinde taşır (`beforeId`/`afterId` veya hedef komşular) — `@pusula/domain/position` ile yeni `position`; **activity yok**; `boards.version` artar |
| `card.activity` | `list` | `cardProcedure` | board `viewer+`; kartın `activity_events` geçmişi (`created_at` azalan, son ~50; actor adıyla) — kart detay modali activity feed (`bosluk-tara` G2); ayrı query, `card.get`/`board.get` payload'ını şişirmez |
| `card.members` | `list` | `cardProcedure` | board `viewer+`; kartın tüm `card_members` satırları (`{ userId, role, name }` — e-posta yok; tüm üyeler, yalnızca caller değil) |
| `card.members` | `add` | `cardProcedure` | board `member+` (kendini `watcher` yapma `viewer`'a da açık — aşağıdaki not); aday **o board'a effective erişimi olan** kullanıcı olmalı (explicit board üyesi veya workspace owner/admin — `effectiveBoardRole !== null`), aksi `BAD_REQUEST`; rol `assignee`/`watcher`; idempotent (`(cardId,userId,role)` PK); `activity_events` (`card.member_added`); `boards.version` artar |
| `card.members` | `remove` | `cardProcedure` | board `member+` (kendini `watcher`'dan / atamadan çıkarma `viewer`'a da açık); idempotent; `activity_events` (`card.member_removed`); `boards.version` artar |
| `label` | `list` | `boardProcedure` | board `viewer+`; board'un etiket paleti (`{ id, name, color }[]`) — kart detayında etiket seçimi + board ayarlarında etiket yönetimi için |
| `label` | `create` | `boardProcedure` | board `member+` (`canEditBoardContent`); board scope'lu etiket (`name` opsiyonel, `color` zorunlu — `@pusula/domain` `LABEL_COLORS` paleti); arşivli board salt-okunur; `(boardId,color,name)` benzersiz → çakışma `CONFLICT`; **activity yok** (board metadata); `boards.version` artar |
| `label` | `update` | `boardProcedure` | board `member+`; `name`/`color` düzenleme; çakışma `CONFLICT`; idempotent; **activity yok**; `boards.version` artar |
| `label` | `delete` | `boardProcedure` | board `member+`; etiket + `card_labels` (cascade); idempotent; **activity yok**; `boards.version` artar |
| `card.labels` | `list` | `cardProcedure` | board `viewer+`; kartın atanmış etiketleri (`labels` ile join → `{ labelId, name, color }`) |
| `card.labels` | `add` | `cardProcedure` | board `member+`; etiket kartın board'una ait olmalı (aksi `BAD_REQUEST`); idempotent (`(cardId,labelId)` PK); `activity_events` (`card.label_added`); `boards.version` artar |
| `card.labels` | `remove` | `cardProcedure` | board `member+`; idempotent; `activity_events` (`card.label_removed`); `boards.version` artar |
| `board.members` | `list` | `boardProcedure` | board `viewer+`; explicit `board_members` satırları (ad/rol — e-posta yok, gizlilik; `card.members.list` ile tutarlı) + (gösterim için) workspace owner/admin'lerin inherited erişimi `inherited: true` ile işaretlenir |
| `board.members` | `add` | `boardProcedure` | board `admin`; `email` ile — e-posta lowercase normalize. (a) e-posta bir **workspace üyesi**ne aitse (owner/admin/member/guest) doğrudan `board_members` insert (rol `admin`/`member`/`viewer`, varsayılan `member`) — zaten üyeyse `CONFLICT`; (b) e-posta bir **hesabı olan ama workspace üyesi olmayan** kullanıcıya aitse: o kullanıcı workspace'e `guest` olarak eklenir (`workspace_members` insert) + `board_members` insert — "tek-board misafiri" modeli; (c) e-postanın hesabı **yoksa**: `board_invitations`'a `pending` satır (token, rol, `expires_at`) + `notification_outbox` (`board_invitation`, channel `email`) — kabulde davetli workspace `guest`'i + board üyesi olur. `activity_events`: (a)/(b) `board.member_added` (+ (b)'de `workspace.member_added`), (c) `board.member_invited`. `boards.version` artar |
| `board.members` | `updateRole` | `boardProcedure` | board `admin`; explicit `board_members` satırının rolünü değiştirir (`admin`/`member`/`viewer`); kendi rolünü düşürebilir ama **son board `admin`** rolden düşürülemez (`BAD_REQUEST`); inherited (workspace owner/admin) satır için `BAD_REQUEST` (explicit üyelik yok); `activity_events` (`board.member_role_changed`); `boards.version` artar |
| `board.members` | `remove` | `boardProcedure` | board `admin` (üye kendini çıkarabilir = "board'dan ayrıl" — `member`/`viewer` de yapabilir); explicit `board_members` satırını siler — kart üyelikleri/atamalar **korunur** (yetkisi board rolünden gelir ama explicit üyelik gidince inherited erişim yoksa kart işlemleri reddedilir); **son board `admin`** çıkarılamaz; inherited satır çıkarılamaz; `activity_events` (`board.member_removed`); `boards.version` artar |
| `board.invitations` | `list` | `boardProcedure` | board `member+` (yönetim `admin`); board'un `pending` davetleri (e-posta, rol, davet eden, son tarih) |
| `board.invitations` | `revoke` | `boardProcedure` | board `admin`; davet `pending` değilse `BAD_REQUEST`; `status = revoked`; `activity_events` (`board.invitation_revoked`); `boards.version` artar |
| `board.invitations` | `mine` | `protectedProcedure` | oturum açmış kullanıcının e-postasına gelen `pending` + süresi dolmamış board davetleri (board adı, workspace adı, rol, davet eden, `expires_at`, `token`) |
| `board.invitations` | `accept` | `protectedProcedure` | token ile bulunur; `pending` değil/dolmuşsa `BAD_REQUEST` (dolmuşsa `status = expired`); oturum e-postası davet e-postasıyla eşleşmiyorsa `FORBIDDEN`. Transaction: kullanıcı workspace üyesi değilse `workspace_members` insert (`guest`); zaten board üyesi değilse `board_members` insert (rol davetten); `status = accepted`, `accepted_by_id`, `accepted_at`; `activity_events` (`workspace.member_added` [yeni eklendiyse] + `board.member_added`). Zaten board üyesiyse no-op (idempotent), board döner |
| `board.invitations` | `decline` | `protectedProcedure` | token ile bulunur; e-posta eşleşmiyorsa `FORBIDDEN`; `pending` değilse `BAD_REQUEST`; `status = declined` (activity yok) |

> **Kart üyesi (assignee/watcher) — yetki değil ilişki:** `card.members.add` yetki vermez; düzenleme yetkisi yine board rolünden gelir (`card_members` yalnızca bildirim/ilgi içindir — bkz. [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)). Aday kişinin o board'a erişimi (`effectiveBoardRole !== null`) zorunludur — aksi halde "atanmış ama göremeyen" kullanıcı oluşur. `viewer` kendini `watcher` yapabilir / `watcher`'lıktan çıkabilir, ama başkasını ekleyemez ve `assignee`'liği değiştiremez (`member+` gerekir).
>
> **Etiket / checklist / kart üyesi `boards.version`:** bu mutation'lar board ekranını etkilediği için (kart rozeti/etiket çubuğu, board etiket listesi) board `version`'ını artırır — realtime (Faz 5) "missed event" tespiti için. Activity üretmeyenler de (`checklist.update/delete`, `checklist.item.update/reorder`, `label.*`) yine `version` artırır.
>
> **Board davet akışı (`board_invitations`):** `workspace_invitations` ile aynı disiplin — gizli rastgele `token` (yalnızca davet e-postasında), süreli (`WORKSPACE_INVITATION_TTL_DAYS` ile aynı sabit yeniden kullanılır ya da ayrı `BOARD_INVITATION_TTL_DAYS`), tek kullanımlık; bir `(board_id, lower(email))` çifti için aynı anda en fazla bir `pending` davet. Şema → [`04-veri-katmani.md`](04-veri-katmani.md). Davetli kabul edince workspace'e `guest` olarak da girer (workspace `guest` rolü tam da bu senaryo için var).

Faz 2.5 dışı (ileri faz): `attachment.*` (Faz 8 — MinIO), mention parsing + watched-activity bildirimi (Faz 6), board genel activity sekmesinde realtime canlı akış (Faz 5). `checklist.item_completed` activity tipi enum'da **kullanım dışı** (cruft) — toggle için `checklist.item_checked` / `checklist.item_unchecked` kullanılır.

## Worker (background job)

`apps/worker` ayrı uygulama (API ile aynı image, farklı command olabilir; ama ayrı process):
notification processor, outbox processor, due-date scheduler, digest email job, cleanup jobs,
position compaction jobs. Queue: BullMQ + Redis.

API request içinde **yapılmaz**: push gönderimi, email gönderimi, ağır activity aggregation,
digest üretimi, uzun süren attachment processing.
