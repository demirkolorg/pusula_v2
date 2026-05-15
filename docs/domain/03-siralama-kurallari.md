---
title: '03 — Sıralama Kuralları'
description: 'Position alanının iş anlamı, before/after semantiği ve compaction kuralları.'
aliases:
  - 'Sıralama Kuralları'
  - 'Ranking Rules'
tags:
  - 'pusula'
  - 'domain/ranking'
  - 'position'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
updated: 2026-05-13
---

# 03 — Sıralama Kuralları (Ranking)

> Eksen: **iş / domain** — sıralamanın _anlamı_ ve _kuralları_. İmplementasyon (helper'lar,
> `fractional-indexing`, DB kolonu) → [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md); drag-drop mekaniği → [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md).

## İlke

Kart ve liste sırası, tüm listeyi yeniden numaralandıran **ardışık tam sayı (`order`) ile
tutulmaz**. Bunun yerine **LexoRank benzeri string (fractional) pozisyon** kullanılır: iki komşu
pozisyon arasına yenisi, sadece o ikisine bakılarak hesaplanır. Helper: `@pusula/domain/position`
(`positionBetween`, `positionsBetween`, `firstPosition`).

```txt
card A position = "a0"
card B position = "a8"
A ile B arasına eklenen kart position = "a4"
```

## Semantik

- Bir liste içindeki kartlar `position` string'ine göre **artan** sırada gösterilir; aynı şekilde bir board içindeki listeler kendi `position`'larına göre.
- "X kartını A ile B arasına taşı" → yeni pozisyon `positionBetween(A.position, B.position)`. Listenin başına/sonuna taşımada bir kenar `null` olur.
- `moveCard` girdisi `fromListId` / `toListId` (kaynak ve hedef liste) + `beforeCardId` / `afterCardId` (hedefteki komşular) **ve** opsiyonel `newPosition` taşır: server ya client'ın gönderdiği `newPosition`'ı doğrular ya da komşulardan yeniden hesaplar. `moveList` girdisi `beforeListId` / `afterListId` (+ opsiyonel `newPosition`) taşır. Şemalar: `@pusula/domain` `moveCardInput` (`schemas/card.ts`) / `moveListInput` (`schemas/list.ts`); server akışı → [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) §5.1.
- Liste değiştirme + sıralama tek bir işlemdir: kart `list_id` değişir, `position` hedef listedeki komşulara göre hesaplanır, `board_id` tutarlı kalır (invariant). **Hedef liste kartla aynı board'a ait olmalı** — `card.move` board-içi taşımadır. Başka board'a taşıma `card.moveToList` (Faz 3E / [DEM-69](https://linear.app/demirkol/issue/DEM-69)) — ayrı procedure; kartın `board_id`'sini de değiştirir, hedef board'da yetki + arşiv kontrolü yapar, kartın checklist/yorum/etiket/üye bağları için kuralı kendi issue'sunda netleştirir.

## Concurrent move (eşzamanlı taşıma)

- İki kullanıcı aynı kartı/listeyi aynı anda taşırsa: **son commit kazanır** (last write wins). Optimistic UI nedeniyle her iki kullanıcı da kendi taşımasını anında görür; transaction sırasıyla biri ezilir; realtime event geldiğinde diğeri reconcile eder (gerekirse refetch).
- Server, taşımadan önce kartın **hâlâ beklenen listede** (`fromListId`) olduğunu doğrular; değilse client'ın gönderdiği komşular güncel değildir → server `CONFLICT` (tRPC error code) döner; client board'u refetch edip güncel durumu gösterir (kartı sessizce kaybetmez), kullanıcı taşımayı tekrar dener. (Server güncel komşulardan yeniden hesaplama yoluna gitmez — `CONFLICT` daha öngörülebilir.)
- Aynı `clientMutationId` ile tekrar gelen taşıma duplicate activity/bildirim üretmez (idempotency) — no-op döner.

## Compaction (yeniden dengeleme)

- Fractional pozisyonlar uzadıkça (örn. `a4 → a44 → a444 ...`) string büyür. Bir liste/board için pozisyon string'leri belirli bir uzunluğu/yoğunluğu aştığında **worker'da background compaction** ([`apps/worker`](../architecture/06-bildirim-altyapisi.md), BullMQ — Faz 3C / [DEM-44](https://linear.app/demirkol/issue/DEM-44)): o kapsamın kartları/listeleri `positionsBetween(null, null, n)` ile kısa, eşit aralıklı pozisyonlara yeniden yazılır.
- **Tetik:** Bir `card.move` / `list.move` sonucu üretilen `position` string'i bir eşiği aşarsa, o scope (taşınan kartın listesindeki kartlar / board'un listeleri) için compaction job kuyruğa atılır. Eşik bir worker config parametresidir — öneri default: `POSITION_COMPACTION_MAX_LEN = 50` (üretilen herhangi bir key ≥ 50 karakter ise tetikle). İsteğe bağlı ikincil tetik: bir scope'taki satır sayısı çok büyüdüyse (örn. > 1000) periyodik dengeleme. Eşik aşırı sık tetiklenmeyi önleyecek kadar yüksek seçilir; job aynı scope için kuyruktaysa tekrar enqueue edilmez (debounce). Kesin değer + job ayrıntısı → Faz 3C issue'su + [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) worker job'ları + [`../architecture/10-platform.md`](../architecture/10-platform.md).
- Compaction kullanıcıya görünmez; bir activity event üretmez (sadece teknik bakım) ama (Faz 5+) realtime event üretip client'ları reconcile ettirebilir — ya da client'lar bir sonraki `board.get` refetch'inde güncellenir. `boards.version` artar (client'ın stale pozisyonları yenilemesi için).
