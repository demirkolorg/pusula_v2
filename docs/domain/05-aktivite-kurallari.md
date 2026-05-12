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
updated: 2026-05-12
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
| List | `list.created`, `list.renamed`, `list.archived`, `list.restored`, `list.moved` | eski/yeni başlık, eski/yeni position |
| Card | `card.created`, `card.renamed`, `card.description_changed`, `card.moved`, `card.archived`, `card.restored`, `card.due_set`, `card.due_cleared`, `card.due_overdue` | fromListId/toListId, eski/yeni position, eski/yeni due_at |
| Card members/labels | `card.member_added`, `card.member_removed`, `card.label_added`, `card.label_removed` | üye id (+ kart rolü `assignee`/`watcher`) / label id |
| Checklist | `checklist.created`, `checklist.item_added`, `checklist.item_checked`, `checklist.item_unchecked`, `checklist.item_removed` | checklist id, item id, metin |
| Comment | `comment.created`, `comment.updated`, `comment.deleted` | comment id, (mention listesi) |
| Attachment | `attachment.added`, `attachment.removed` | attachment id, dosya adı |
| Workspace | `workspace.created`, `workspace.updated`, `workspace.archived`, `workspace.member_invited`, `workspace.member_added`, `workspace.member_removed`, `workspace.member_role_changed`, `workspace.invitation_revoked`, `workspace.board_created` | eski/yeni ad/slug, üye/davet id, e-posta, rol, board id |

> **Adlandırma notları:** Comment için enum'da `comment.created`/`comment.updated`/`comment.deleted` kullanılır (taksonomi de bu adları taşır). Checklist toggle'ı `checklist.item_checked`/`checklist.item_unchecked` üretir — enum'da Faz 0'dan kalan `checklist.item_completed` **kullanım dışıdır** (cruft; Postgres enum append-only olduğu için silinmez). Etiket CRUD (`label.create/update/delete`) ve checklist/item edit/reorder **activity üretmez** (board metadata gibi düşük sinyal); board ekranını etkiledikleri için yine `boards.version` artar. `board.member_invited`/`board.invitation_revoked` workspace muadilleriyle aynı; davet kabulü `board.member_added` (+ workspace'e `guest` olarak ilk kez eklenince `workspace.member_added`) üretir.

## Kurallar

- `actor_id` her zaman işlemi yapan kullanıcı; sistem kaynaklı event'lerde (örn. `card.due_overdue` scheduler'dan) actor sistem/null olabilir — payload'da kaynak belirtilir.
- `payload` JSONB; UI'da gösterim için yeterli ve **kendine yeten** bilgi taşır (sonradan silinen kayıt için bile feed render edilebilsin) — ama PII'yi gereğinden fazla taşımaz.
- Activity event ↔ bildirim ↔ realtime event üçlüsü aynı transaction'da üretilir; bildirim hangi event'ten hangi alıcıya çıkar → [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md).
- Activity feed query'leri board/kart query'sinden **ayrıdır** (board payload'ını şişirme — bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.7).
