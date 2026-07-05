---
title: 'Plan — Liste ↔ Pano Dönüşümü'
description: 'Bir listeyi yeni panoya çevirme (A) ve bir panoyu başka panoya liste olarak taşıma (B) operasyonlarının karar kaydı + uygulama planı.'
aliases:
  - 'Liste Pano Dönüşümü Planı'
tags:
  - 'pusula'
  - 'plan'
  - 'board'
  - 'list'
status: 'draft'
updated: 2026-07-05
---

# Plan — Liste ↔ Pano Dönüşümü

> Çalışma planı (docs/ kanonik belgesi değil). Kod yazımından önce onaylanan kararlar ve
> faz planı burada. Belgeleştirme ("önce belge") kullanıcı isteğiyle atlandı; kod tamamlanınca
> `docs/domain/01-urun-modeli.md` (yeni invariant) + `02-yetkilendirme-kurallari.md` (yetki matrisi)
> + `docs/architecture/03-backend.md` (procedure haritası) güncellenmesi önerilir.

## 1. Amaç — iki operasyon

- **A — Liste → Pano (`list.convertToBoard`):** Bir listeyi yeni bir panoya çevirir; listenin
  kartları yeni panonun tek bir default listesine taşınır.
- **B — Pano → Liste (`board.convertToList`):** Bir panoyu başka bir panonun içine tek bir liste
  olarak taşır; kaynak panonun tüm kartları hedefteki tek yeni listede toplanır.

### Kritik asimetri
İki operasyon "tam ters" değildir: bir pano **birden çok liste** içerir. Gerçek tersinme yalnızca
*tek listeli pano ↔ liste* arasında vardır. B operasyonunda çok listeli kaynak, liste yapısı
düzleştirilerek tek listede toplanır (karar 1 — aşağıda).

## 2. Alınan kararlar

### Temel yön kararları

| # | Konu | Karar |
|---|------|-------|
| 1 | **B semantiği** (çok listeli pano) | **Tüm kartlar tek listede toplanır** (liste ayrımı kaybolur — gerçek pano→liste). |
| 2 | **Kaynağın akıbeti** | **Kalıcı silinir** (arşivleme değil). |
| 3 | **Etiket kuralı** (board-scope) | **Etiket paleti hedefe kopyalanır + kartlar yeniden bağlanır** (`(renk,ad)` eşleştirmeli). |
| 4 | **A: yeni pano üyeleri** | **Kaynak panonun üyeleri kopyalanır** (rolleriyle). |
| 5 | **Kart üyesi erişimi** | **`moveToList` emsali: üyeler korunur** (hedefe erişimi olmayan da kalır — invariant 16). |
| 6 | **Bildirim + ölçek** | **Kart-başı bildirim YOK** (tek yapısal olay) + ölçek üst limiti (reddetme). |

### Açık noktaların karara bağlanması (önerimle)

| # | Konu | Karar |
|---|------|-------|
| 7 | **Idempotency** | İdempotent **değil** (`card.copy` emsali — yeni entity yaratır). `clientMutationId` activity/realtime'a taşınır, dedup yok. Retry'da kaynak silinmişse `NOT_FOUND`; UI çift-submit'i confirm modal + loading ile engeller. |
| 8 | **Kalıcı silme kapsamı** | **Kalıcı silme yalnız boşalmış organizasyonel kabuğa uygulanır.** Hiçbir kart/checklist/yorum/attachment silinmez — hepsi taşınır (arşivli kartlar da, statüsü korunarak). Yalnız geriye kalan boş liste (A) / boş board (B) silinir. → Geri-alınamaz silme = veri kaybı riskini minimuma indirir. |
| 9 | **Attachment** | Sıra: **önce taşı, sonra boş kabuğu sil** → kartlar taşındığı için cascade attachment MinIO blob'larına dokunmaz. |
| 10 | **Audit** | B → `board.delete` audit action (enum'da forward-compat mevcut, caller eklenir). A → liste kabuğu silme audit üretmez (mevcut `list.delete` ile tutarlı). |
| 11 | **A: yeni pano arka planı** | `background = null` (varsayılan). |

### Öneriyle geçilen (itiraz gelmezse)

- **Kapsam:** Aynı workspace zorunlu (MVP).
- **Yetki:** Her iki operasyon kaynak tarafında board **admin** (hard-delete gerekiyor) + hedefte
  **member+**. A'da yeni pano yaratma ayrıca workspace **member+**.
- **Adlandırma:** A → yeni pano adı = kaynak liste adı; default liste adı kullanıcıdan (default "Kartlar").
  B → yeni liste adı = kaynak pano adı; hedef panonun sonuna eklenir.
- **Düzleştirme sırası (B):** Kartlar, kaynak liste sırası → liste-içi `position` sırasıyla tek listede
  dizilir; yeni fractional pozisyonlar (`positionsBetween`).

### Karara bağlanmayı bekleyen (implementasyon başında netleşecek)

- **Ölçek üst limiti:** Öneri `MAX_CONVERT_CARDS = 500` (tek atomik tx için lock/memory dengesi;
  aşılırsa `BAD_REQUEST`). Alternatifler: 1000 / limitsiz.
- **Başlangıç sırası:** Backend-önce (Faz 0→4) / uçtan uca A-önce / yalnız backend.

## 3. Mevcut emsaller (reuse zemini)

| Emsal | Konum | Ne veriyor |
|-------|-------|-----------|
| `card.moveToList` | [card.ts:1446](packages/api/src/routers/card.ts#L1446) | Cross-board taşıma: `crossBoard` → `card_labels` sil; üye/checklist/yorum/activity karta bağlı otomatik gelir; iki board `version++`; advisory lock. |
| `list.delete` | [list.ts:658](packages/api/src/routers/list.ts#L658) | Boş-kabuk silme + activity + realtime + search delete + `lists` delete. |
| `board.create` | [board.ts:282](packages/api/src/routers/board.ts#L282) | Yeni pano + `board_members` admin + `board.created` activity + search. |
| `label.create` | [label.ts:110](packages/api/src/routers/label.ts#L110) | `(boardId,color,name)` uniqueness + `23505` → `CONFLICT` çevirisi (etiket eşleştirmeye örnek). |
| `createCardInTransaction` | [card-create.ts:161](packages/api/src/lib/card-create.ts#L161) | Kart oluşturma + position + activity + realtime + search tek tx helper'ı. |
| position helper | [position.ts](packages/domain/src/position.ts) | `positionsBetween(null,null,n)` ile toplu fractional pozisyon. |
| board cascade | `boards.id` → tüm child `onDelete: 'cascade'` | Boş board `DELETE FROM boards` tek seferde temizler. |

## 4. Uygulama planı (faz faz)

**Kapsam:** 2 tRPC procedure + web UI. Mobil kapsam **dışı**. Belge güncellemesi atlandı.

### Faz 0 — Domain şemaları + sabit (`@pusula/domain`)
- `schemas/list.ts`: `convertListToBoardInput = { listId, targetListName?, confirmName, clientMutationId }` (default liste adı "Kartlar").
- `schemas/board.ts`: `convertBoardToListInput = { boardId, targetBoardId, newListName?, confirmName, clientMutationId }`.
- `constants.ts`: `MAX_CONVERT_CARDS` (ölçek limiti — değeri karara bağlı).
- Tip export + `index.ts`. **Test:** schema validation (boş ad, confirmName zorunlu).

### Faz 1 — Paylaşılan API helper'ları (`packages/api/src/lib`)
- **`copy-labels-to-board.ts`** → `copyCardLabelsToBoard(tx, { cardIds, fromBoardId, toBoardId })`:
  kaynak kartların `card_labels`'ını topla → hedefte `(color,name)` eşleşen varsa ona bağla, yoksa
  oluştur (label conflict pattern reuse) → `card_labels` yeniden yaz. Same-board no-op.
- **`board-hard-delete.ts`** → `deleteBoardShell(tx, ctx, { boardId })`: `board.delete` audit +
  `board.deleted` realtime event + `DELETE FROM boards` (cascade). B için.
- **Test:** ikisi de unit (etiket dedup + çakışma; cascade sonrası satır yok).

### Faz 2 — A: `list.convertToBoard` (list router)
Yetki: kaynak board **admin** + workspace **member+**. Tek atomik tx:
1. Kaynak liste/board/workspace çöz; arşiv + `kart sayısı ≤ limit` kontrolü.
2. Yeni board insert (`title` = liste adı, `background = null`) + `board.created` activity + search.
3. Kaynak board üyelerini kopyala (`board_members`, rollerle); işlemi yapan `admin` garanti.
4. Yeni default liste insert (`title` = `targetListName`).
5. Listenin **tüm** kartları (aktif+arşivli) `position` sırasıyla → yeni listeye taşı (`listId`+`boardId`+yeni `positionsBetween`).
6. `copyCardLabelsToBoard`; kart üyeleri/checklist/yorum/attachment karta bağlı → otomatik gelir.
7. Activity: `board.created` + `list.created` + tek yapısal `list.convertedToBoard` (**kart-başı bildirim YOK**).
8. Boşalan kaynak listeyi sil (`list.delete` mekaniği); kaynak board `version++`.
9. Retry'da kaynak yoksa `NOT_FOUND`. **Test:** integration (üye kopya, etiket taşıma, arşivli kart, limit reddi, yetki matrisi).

### Faz 3 — B: `board.convertToList` (board router)
Yetki: kaynak board **admin** + hedef board **member+**, **aynı workspace**. Tek atomik tx:
1. Kaynak+hedef board çöz; aynı workspace + hedef arşivsiz + `toplam kart ≤ limit` kontrolü.
2. Hedef panonun **sonuna** yeni liste (`title` = `newListName ?? kaynak pano adı`).
3. Kaynak panonun **tüm** kartları, **(liste position → kart position)** sırasıyla düzleştir → hedef listeye taşı.
4. `copyCardLabelsToBoard` (cross-board); üyeler korunur (erişimsiz dahil — invariant 16 emsali).
5. Activity: hedefe `list.created` + yapısal `board.convertedToList` (kart-başı bildirim YOK); `board.delete` audit.
6. Kartsız kalan kaynak board'u `deleteBoardShell` ile hard-delete (cascade).
7. Hedef `version++`. **Test:** integration (düzleştirme sırası, etiket eşleştirme, cross-workspace reddi, kaynak board cascade).

### Faz 4 — Realtime (`realtime-publish` + `apps/worker`)
- `board.deleted` envelope tipi → kaynak board room'daki client'lar "pano silindi" ile yönlendirilir (kick).
- Hedef board'a toplu değişim → client refetch (`boards.version`).

### Faz 5 — Web UI (`apps/web` + `@pusula/ui`)
- **Liste kebab menüsü** → "Panoya çevir": modal (default liste adı input + `confirmName` = liste adı yaz). Başarıda yeni panoya yönlendir.
- **Pano menüsü** → "Başka panoya liste olarak taşı": modal (hedef pano seçici + `newListName` + `confirmName`). Başarıda hedefe yönlendir.
- shadcn/ui + i18n string kaynağı (hardcode metin yok). Optimistic değil (senkron yapısal işlem: confirm + loading, çift-submit disable).

### Faz 6 — Doğrulama
- `@verifier`: build + tsc + vitest + lint. Opsiyonel Playwright happy-path (A ve B).

## 5. Toplam yeni yüzey
2 procedure · 2 helper · ~4 domain şeması/sabit · 2 web modal + 2 menü girişi. Mekaniğin çoğu
(`moveToList`, `list.delete`, `board.create`, `label` conflict) mevcut emsallerden reuse.
