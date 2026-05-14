---
title: "05 — Aktivite Kuralları"
description: "Activity event ilkeleri ve event taksonomisi."
aliases:
  - "Aktivite Kuralları"
  - "Activity Events"
tags:
  - "pusula"
  - "domain/activity"
type: "domain"
axis: "domain"
status: "active"
parent: "[[docs/domain/README|İş / Domain Kuralları]]"
updated: 2026-05-14
---
# 05 — Aktivite Kuralları (Activity Events)

> Eksen: **iş / domain**. Tablo/şema → [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md); realtime yayını → [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.3.

## İlke

Her anlamlı domain mutasyonu bir **activity event** üretir; bu event domain mutasyonuyla **aynı
transaction**'da `activity_events` tablosuna yazılır (`workspace_id, board_id?, card_id?, actor_id,
type, payload, created_at`). Activity feed (board/kart geçmişi) ve bildirim üretimi bu event'lerden
beslenir. Salt teknik bakım işlemleri (örn. position compaction) activity event üretmez.

## Event taksonomisi (başlangıç sözleşmesi — yeni tip eklerken bu listeyi güncelle)

| Kapsam | `type` örnekleri | Tipik `payload` |
| --- | --- | --- |
| Board | `board.created`, `board.renamed`, `board.archived`, `board.member_added`, `board.member_removed`, `board.member_role_changed`, `board.member_invited`, `board.invitation_revoked` | eski/yeni başlık, üye id, rol, davet e-postası/id |
| List | `list.created`, `list.renamed`, `list.archived`, `list.restored`, `list.moved`, `list.color_changed`, `list.color_cleared` | eski/yeni başlık, eski/yeni position, `{ listId, oldColor, newColor }` / `{ listId, oldColor }` |
| Card | `card.created`, `card.renamed`, `card.description_changed`, `card.moved`, `card.archived`, `card.restored`, `card.due_set`, `card.due_cleared`, `card.due_overdue`, `card.completed`, `card.uncompleted`, `card.cover_changed`, `card.cover_cleared` | fromListId/toListId, eski/yeni position, eski/yeni due_at, kapak rengi (yeni `cover_color`) |
| Card members/labels | `card.member_added`, `card.member_removed`, `card.label_added`, `card.label_removed` | üye id (+ kart rolü `assignee`/`watcher`) / label id |
| Checklist | `checklist.created`, `checklist.item_added`, `checklist.item_checked`, `checklist.item_unchecked`, `checklist.item_removed` | checklist id, item id, metin |
| Comment | `comment.created`, `comment.updated`, `comment.deleted` | comment id, (mention listesi) |
| Attachment | `attachment.added`, `attachment.removed` | attachment id, dosya adı |
| Workspace | `workspace.created`, `workspace.updated`, `workspace.archived`, `workspace.member_invited`, `workspace.member_added`, `workspace.member_removed`, `workspace.member_role_changed`, `workspace.invitation_revoked`, `workspace.board_created` | eski/yeni ad/slug, üye/davet id, e-posta, rol, board id |

> **Adlandırma notları:** Comment için enum'da `comment.created`/`comment.updated`/`comment.deleted` kullanılır (taksonomi de bu adları taşır). Checklist toggle'ı `checklist.item_checked`/`checklist.item_unchecked` üretir — enum'da Faz 0'dan kalan `checklist.item_completed` **kullanım dışıdır** (cruft; Postgres enum append-only olduğu için silinmez). Etiket CRUD (`label.create/update/delete`) ve checklist/item edit/reorder **activity üretmez** (board metadata gibi düşük sinyal); board ekranını etkiledikleri için yine `boards.version` artar. `board.member_invited`/`board.invitation_revoked` workspace muadilleriyle aynı; davet kabulü `board.member_added` (+ workspace'e `guest` olarak ilk kez eklenince `workspace.member_added`) üretir.
>
> **Kart tamamlama / kapak rengi (Faz 2.7 — [DEM-66](https://linear.app/demirkol/issue/DEM-66) / [DEM-67](https://linear.app/demirkol/issue/DEM-67)):** `card.complete` → `card.completed`, `card.uncomplete` → `card.uncompleted` (kart-seviyesi tamamlama — checklist item toggle'ından ayrı; o `checklist.item_checked`/`unchecked`). `card.update` ile kapak rengi değişince: yeni renge geçiş `card.cover_changed` (payload'da yeni `cover_color`), temizleme `card.cover_cleared`. Dördü de enum'a **append** edilir (migration `0007_*` — `ALTER TYPE activity_event_type ADD VALUE` ×4); idempotent no-op (zaten o durumdaysa) activity üretmez. Bu mutation'lar `boards.version`'ı artırır (board ekranı kart rozetini/kapağını etkiler — realtime "missed event" tespiti, Faz 5). Bkz. [`../architecture/03-backend.md`](../architecture/03-backend.md) (Faz 2.7 — kart tamamlama + kapak rengi), [`01-urun-modeli.md`](01-urun-modeli.md) (invariant 15).
>
> **Liste rengi (DEM-98):** `list.update({ color })` ile renksiz → renkli veya renkli → başka renk geçişi `list.color_changed` üretir; payload `{ listId, oldColor, newColor }`. Rengi kaldırma (`color: null`) `list.color_cleared` üretir; payload `{ listId, oldColor }`. Aynı renk tekrar set/clear idempotent no-op'tur; activity ve version üretmez. Bu iki event tipi `ACTIVITY_EVENT_TYPES`'a **append** edilir ve `lists.color` migration'ıyla aynı PR'dadır. Bkz. [`01-urun-modeli.md`](01-urun-modeli.md) invariant 17.

## Kurallar

- `actor_id` her zaman işlemi yapan kullanıcı; sistem kaynaklı event'lerde (örn. `card.due_overdue` scheduler'dan) actor sistem/null olabilir — payload'da kaynak belirtilir.
- `payload` JSONB; UI'da gösterim için yeterli ve **kendine yeten** bilgi taşır (sonradan silinen kayıt için bile feed render edilebilsin) — ama PII'yi gereğinden fazla taşımaz.
- Activity event ↔ bildirim ↔ realtime event üçlüsü aynı transaction'da üretilir; bildirim hangi event'ten hangi alıcıya çıkar → [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md).
- Activity feed query'leri board/kart query'sinden **ayrıdır** (board payload'ını şişirme — bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.7).
