---
title: "03 — Sıralama Kuralları"
description: "Position alanının iş anlamı, before/after semantiği ve compaction kuralları."
aliases:
  - "Sıralama Kuralları"
  - "Ranking Rules"
tags:
  - "pusula"
  - "domain/ranking"
  - "position"
type: "domain"
axis: "domain"
status: "active"
parent: "[[docs/domain/README|İş / Domain Kuralları]]"
updated: 2026-05-12
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
- `moveCard` girdisi `beforeCardId` / `afterCardId` (komşular) **ve** opsiyonel `newPosition` taşır: server ya client'ın gönderdiği `newPosition`'ı doğrular ya da komşulardan yeniden hesaplar (bkz. [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) server move akışı).
- Liste değiştirme + sıralama tek bir işlemdir: kart `list_id` değişir, `position` hedef listedeki komşulara göre hesaplanır, `board_id` tutarlı kalır (invariant).

## Concurrent move (eşzamanlı taşıma)

- İki kullanıcı aynı kartı/listeyi aynı anda taşırsa: **son commit kazanır** (last write wins). Optimistic UI nedeniyle her iki kullanıcı da kendi taşımasını anında görür; transaction sırasıyla biri ezilir; realtime event geldiğinde diğeri reconcile eder (gerekirse refetch).
- Server, taşımadan önce kartın **hâlâ beklenen listede** olduğunu doğrular; değilse client'ın gönderdiği komşular geçersizdir → güncel duruma göre yeniden hesaplanır veya hata döner ve client refetch eder.
- Aynı `clientMutationId` ile tekrar gelen taşıma duplicate activity/bildirim üretmez (idempotency).

## Compaction (yeniden dengeleme)

- Fractional pozisyonlar uzadıkça (örn. `a4 → a44 → a444 ...`) string büyür. Bir liste/board için pozisyon string'leri belirli bir uzunluğu/yoğunluğu aştığında **worker'da background compaction**: o kapsamın kartları/listeleri kısa, eşit aralıklı pozisyonlara yeniden yazılır.
- Compaction kullanıcıya görünmez; bir activity event üretmez (sadece teknik bakım) ama realtime event üretip client'ları reconcile ettirebilir (ya da client'lar bir sonraki refetch'te güncellenir).
- Compaction'ı tetikleyen eşik (string uzunluğu / liste boyutu) bir worker job parametresidir; bkz. [`../architecture/06-bildirim-altyapisi.md`](../architecture/06-bildirim-altyapisi.md) worker job'ları ve [`../architecture/10-platform.md`](../architecture/10-platform.md).
