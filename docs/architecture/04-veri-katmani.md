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
