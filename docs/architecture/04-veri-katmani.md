---
title: "04 — Veri Katmanı"
description: "PostgreSQL, Drizzle, temel tablolar, position implementasyonu ve transaction disiplini."
aliases:
  - "Veri Katmanı"
  - "PostgreSQL Drizzle"
tags:
  - "pusula"
  - "architecture/data"
  - "database"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 04 — Veri Katmanı (PostgreSQL + Drizzle)

> Eksen: **tasarım / teknik**. Sıralamanın **iş anlamı** (before/after, compaction tetiği,
> concurrent move çözümü) için [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md). Domain modeli için [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md).

## Neden PostgreSQL + Drizzle

Trello benzeri üründe transaction, row-level consistency, index ve sıralama mantığı kritik →
relational model doğru seçim. Drizzle: type-safe SQL, migration kontrolü, transaction netliği.

- Şema `packages/db/src/schema` altında. Paylaşılan Drizzle instance `casing: 'snake_case'` — TS'te **camelCase kolon anahtarı** yaz, DB kolonları snake_case.
- Better Auth tabloları (`users`, `sessions`, `accounts`, `verifications`) da `@pusula/db` içinde.
- `DATABASE_URL` `@pusula/db` tarafından Zod ile doğrulanır. Tooling: `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` / `db:seed`.

## Temel tablolar

```txt
users · sessions · accounts · verifications            (Better Auth)
workspaces · workspace_members · workspace_invitations
boards · board_members · labels
lists
cards · card_members · card_labels · checklists · checklist_items
comments · attachments
activity_events · realtime_events
notifications · notification_preferences · notification_outbox · push_tokens
search_documents
```

Örnek kritik kolonlar:

```txt
lists:  id, board_id, title, position, archived_at, created_at, updated_at
cards:  id, board_id, list_id, title, description, position, due_at, archived_at, created_at, updated_at
boards: id, workspace_id, title, version, ...           (version → client realtime sequence kontrolü)
workspace_invitations: id, workspace_id, email, role, token (uniq), invited_by_id, status (invitation_status enum: pending/accepted/declined/revoked/expired), expires_at, accepted_by_id, accepted_at, created_at, updated_at
activity_events:  id, workspace_id, board_id, card_id, actor_id, type, payload, created_at
realtime_events:  id, workspace_id, board_id, card_id, actor_id, type, payload, client_mutation_id, sequence, created_at
notification_outbox: id, event_id, channel, recipient_id (nullable — e-posta daveti hesabı olmayan adrese gidebilir; alıcı payload'taki email), type, payload, status, attempts, scheduled_at, processed_at, created_at
```

> `workspace_invitations`: `token` rastgele ve gizli (yalnızca davet e-postasında), tek kullanımlık;
> bir (workspace_id, email) çifti için aynı anda en fazla bir `pending` satır. Detay → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Workspace davet akışı).

> **Faz 2 (Board/List/Card CRUD) kapsamı:** statik CRUD için `boards(id, workspace_id, title, version, archived_at?, created_at, updated_at)`, `lists(id, board_id, title, position, archived_at, created_at, updated_at)`, `cards(id, board_id, list_id, title, description, position, due_at, archived_at, created_at, updated_at)` ve `board_members` (oluşturan `admin`) kullanılır. `labels`, `card_labels`, `card_members`, `checklists`, `checklist_items`, `comments`, `attachments` ileri fazlardır. `position` her zaman `@pusula/domain/position` ile üretilir; Faz 2 yalnızca **sona ekleme** yapar (ilk eleman `firstPosition`, sonrakiler son elemanın ardına) — araya ekleme/reorder Faz 3. Faz 2 transaction'ı yalnızca `domain mutasyonu + activity_events` içerir; `realtime_events` / `notification_outbox` Faz 5/6'da devreye girer.

> **Faz 2.5 (Kart detayı + board işbirliği — [DEM-48](https://linear.app/demirkol/issue/DEM-48)) kapsamı:** Faz 0 iskeletindeki şu tablolar **aktive edilir**: `comments(id, card_id, author_id, body, edited_at?, deleted_at?, created_at, updated_at)` (soft-delete), `checklists(id, card_id, title, position, created_at, updated_at)`, `checklist_items(id, checklist_id, content, position, completed, completed_at?, completed_by?, created_at, updated_at)`, `card_members(card_id, user_id, role[card_role: assignee/watcher], created_at, updated_at)` (PK `(card_id, user_id, role)`), `labels(id, board_id, name, color, created_at, updated_at)` (`(board_id, color, name)` benzersiz), `card_labels(card_id, label_id)` (PK `(card_id, label_id)`), `board_members(board_id, user_id, role[board_role: admin/member/viewer], created_at, updated_at)` (PK `(board_id, user_id)` — Faz 2'de yalnızca "oluşturan `admin`" kullanılıyordu; bu fazda `add`/`updateRole`/`remove` ile yönetilir). `position` (checklist + checklist_item) yine `@pusula/domain/position` ile; checklist/item yalnızca sona ekleme + `reorder` (Faz 2'deki `move` ertelemesi burada geçerli değil — checklist item içi reorder Faz 2.5'te). `attachments` hâlâ ileri faz (Faz 8 — MinIO). Faz 2.5 transaction'ı yine yalnızca `domain mutasyonu + activity_events` içerir; `realtime_events` / `notification_outbox` Faz 5/6'da devreye girer (board daveti hariç — aşağı bak). Board içeriği değişen mutation'lar `boards.version`'ı artırır.
>
> **Yeni tablo — `board_invitations`** (Faz 2.5C, [DEM-52](https://linear.app/demirkol/issue/DEM-52); `workspace_invitations` ile aynı şekil): `id, board_id (→ boards, cascade), email, role (board_role), token (uniq, gizli), invited_by_id (→ users), status (invitation_status enum: pending/accepted/declined/revoked/expired), expires_at, accepted_by_id (→ users, nullable), accepted_at (nullable), created_at, updated_at` + index'ler `(board_id, status)`, `lower(email)` ve partial unique `(board_id, lower(email)) WHERE status = 'pending'`. Davet kabulü `notification_outbox` (`board_invitation`, channel `email`; alıcının hesabı varsa ek `in_app` satır) yazar — gerçek teslim worker'la (Faz 6); kabul transaction'ı `workspace_members` (`guest`, gerekirse) + `board_members` + `activity_events` (`board.member_added` + gerekirse `workspace.member_added`) içerir. `NOTIFICATION_TYPES` zaten `board_invitation` taşıyor — yeni enum gerekmez; `ACTIVITY_EVENT_TYPES`'a `board.member_invited`/`board.invitation_revoked` (+ `board.member_role_changed`, `checklist.item_added`/`item_checked`/`item_unchecked`/`item_removed`) **append** edilir (Postgres enum append-only — migration `ADD VALUE`).

## Sıralama implementasyonu (position)

`position` kolonu **integer değildir**. Akıcı drag-drop için LexoRank benzeri string (fractional)
pozisyon: `@pusula/domain/position` helper'ları (`positionBetween`, `positionsBetween`,
`firstPosition` — `fractional-indexing` paketiyle).

```txt
card A position = "a0"
card B position = "a8"
A ile B arasına eklenen kart position = "a4"
```

Faydası: her taşımada tüm liste yeniden numaralanmaz; optimistic UI kolay; concurrent move
yönetilebilir; büyük listelerde performans iyi. Aralık tükenince ilgili liste için worker'da
**background compaction**. Compaction tetiği ve concurrent move semantiği iş kuralıdır →
[`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md).

## Transaction disiplini

- Domain mutasyonu + `activity_events` + `realtime_events` + `notification_outbox` insert'leri **mümkünse aynı transaction**'da.
- Transaction'lar kısa tutulur (ağır iş worker'a).
- Mutation'lar idempotent tasarlanır; aynı `clientMutationId` ile iki kez gelen mutation duplicate activity/bildirim üretmez. Bkz. [`05-board-mekanigi.md`](05-board-mekanigi.md).
