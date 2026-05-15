---
title: '05 — Board Mekaniği'
description: 'Drag-drop, optimistic UI ve realtime board senkronizasyonu.'
aliases:
  - 'Board Mekaniği'
  - 'Drag Drop Optimistic Realtime'
tags:
  - 'pusula'
  - 'architecture/board'
  - 'realtime'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-15
---

# 05 — Board Mekaniği (Drag-Drop · Optimistic UI · Realtime)

> Eksen: **tasarım / teknik**. Bunlar board ekranının çalışma mekanikleridir ve sıkı
> bağlıdır; bu yüzden tek dosyada. Sıralamanın iş anlamı [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md), invariant'lar [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md).

---

## 5.0 Board ekranı — CRUD veri akışı (Faz 2)

> Faz 2'de board ekranı **salt CRUD**'dur: drag-drop (§5.1) Faz 3 ([DEM-26](https://linear.app/demirkol/issue/DEM-26)), optimistic UI (§5.2) Faz 4 ([DEM-27](https://linear.app/demirkol/issue/DEM-27)), realtime (§5.3) Faz 5 ([DEM-28](https://linear.app/demirkol/issue/DEM-28)). Backend sözleşmesi: [`03-backend.md`](03-backend.md) (Faz 2 — board / list / card procedure'leri) + [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / List / Card procedure haritası).

- **Board listesi** (`(app)/workspaces/[id]`): `trpc.board.list` → board kartları; "board oluştur" → `trpc.board.create` + `queryClient.invalidateQueries(trpc.board.list.queryFilter())`.
- **Board detay** (`(app)/workspaces/[id]/boards/[boardId]`): `trpc.board.get` tek seferde board + listeleri (`position` sıralı) + her listenin aktif kartlarını (`position` sıralı) döndürür → kolon + kart render. **Faz 2.7B (additive):** her kart ayrıca kart-rozeti metadata'sını taşır — `labels[]` (Faz 2.5E) + `checklistTotal`/`checklistDone` + `commentCount` (`deleted_at IS NULL`) + `members[]` (ad+görsel — avatar yığını; e-posta yok); hepsi board genelinde toplu sorgu (N+1 yok). UI tarafı bu sayaçlardan kart metadata satırını (due chip + "GECİKTİ" rozeti + amber-soon-dot + açıklama-var + checklist progress + yorum sayısı + üye avatarları) çizer (tasarım dili: [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.2). Kart-completion özelliği yok → kartta "tamamla" toggle'ı render edilmez; attachment sayacı Faz 8.
- **List CRUD**: "liste ekle" (`trpc.list.create`, board sonuna) · "yeniden adlandır" / "liste rengini değiştir" (`trpc.list.update`, `color` additive — DEM-98) / "liste ikonu ve ikon rengini değiştir" (`trpc.list.update`, `icon`/`iconColor` additive — DEM-109) · "arşivle" (`trpc.list.archive`) — her biri sonrası `trpc.board.get` invalidate.
- **Card CRUD**: "kart ekle" (`trpc.card.create`, liste sonuna) · "düzenle" (`trpc.card.update` — başlık/açıklama/`due_at`) · "arşivle" (`trpc.card.archive`) — her biri sonrası `trpc.board.get` invalidate.
- Bu fazda **optimistic update yok** — mutation → `await` → invalidate → refetch. `clientMutationId` yine de istemcide üretilip gönderilir (idempotency + Faz 4/5 hazırlığı). Yetki: UI board rolüne göre aksiyonları gizler/gösterir; gerçek kapı her procedure'de server-side.
- Yalnızca shadcn/ui + Tailwind + lucide-react; hardcode metin yok, Türkçe metinler `apps/web/src/lib/strings.ts`'te.

---

## 5.1 Drag-Drop (Faz 3 — [DEM-26](https://linear.app/demirkol/issue/DEM-26))

Web board/list/card sürükle-bırak: **yalnızca Atlassian Pragmatic Drag and Drop**
(`@atlaskit/pragmatic-drag-and-drop`; dnd-kit vb. **kullanılmaz** — proje kararı). Kararın
nedeni Trello/Jira tipi pano deneyimine yakınlık, performans odaklı tasarım ve nested taşıma
modeli.

Faz 3 dağılımı: **3.0** önce-belge ([DEM-41](https://linear.app/demirkol/issue/DEM-41) — bu dosya + [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md) + `@pusula/domain` move-input şekilleri; kontrol odası tab'ı) → **3A** backend ([DEM-42](https://linear.app/demirkol/issue/DEM-42) — `list.move` + `card.move`) → **3B** drag-drop UI ([DEM-43](https://linear.app/demirkol/issue/DEM-43) — board ekranı; bkz. [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.8) ∥ **3C** compaction worker ([DEM-44](https://linear.app/demirkol/issue/DEM-44) — bkz. [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md) "Compaction") → **3D** Playwright testleri ([DEM-45](https://linear.app/demirkol/issue/DEM-45)); **3E** `card.moveToList` (cross-board) + `card.copy` ([DEM-69](https://linear.app/demirkol/issue/DEM-69) — 3A sonrası).

### UI tarafı — zorunlu ilkeler

- Drag sırasında backend mutation **atılmaz**; React state yalnız local güncellenir (placeholder/hayalet gösterimi dahil).
- Mutation yalnızca `onDragEnd` sonrası **tek** istek olarak çalışır (`list.move` _veya_ `card.move`); optimistic'tir; başarısızlıkta cache rollback + düşük gürültülü hata.
- `clientMutationId` her move mutation'ında gönderilir; Faz 5'te realtime event geri geldiğinde client kendi `clientMutationId`'sini tanıyıp optimistic değişikliği **tekrar uygulamaz** (echo ayıklama). Faz 3'te realtime henüz yok — bu yalnız ileri-uyum.
- `before`/`after` komşular `onDragEnd`'deki hedef konuma göre belirlenir; client isteğe bağlı `newPosition` (`@pusula/domain/position` `positionBetween` ile) hesaplayabilir — server doğrular ya da yeniden hesaplar.
- Büyük board'lar için virtualization stratejisi düşünülür; kart ölçüleri stabil — hover/drag'de layout shift yok.

### Mutation şekilleri (`@pusula/domain`)

`card.move` girdisi — `moveCardInput` (`packages/domain/src/schemas/card.ts`):

```ts
moveCard({ cardId, fromListId, toListId, beforeCardId?, afterCardId?, newPosition?, clientMutationId });
```

`list.move` girdisi — `moveListInput` (`packages/domain/src/schemas/list.ts`):

```ts
moveList({ listId, beforeListId?, afterListId?, newPosition?, clientMutationId });
```

> `card.move` yalnız **aynı board içinde** çalışır (board-içi reorder + listeler-arası taşıma) — `toListId` kartla aynı board'a ait olmalı. Başka board'a taşıma `card.moveToList` (Faz 3E / [DEM-69](https://linear.app/demirkol/issue/DEM-69)) — ayrı procedure, kartın `board_id`'sini de değiştirir + hedef board'da yetki kontrolü. Sıralamanın iş anlamı, eşzamanlı taşıma semantiği ve "kart ⊆ liste.board" kuralı → [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md).

### Server move akışı (Faz 3A — backend)

`card.move` (`boardProcedure`, board `member+` = `canEditBoardContent`):

1. Board-edit permission kontrolü (her procedure'de server-side).
2. Kart hâlâ `fromListId`'de mi? Değilse `CONFLICT` döner (eşzamanlı taşıma — client board'u refetch edip güncel durumu gösterir, kartı sessizce kaybetmez).
3. `toListId` arşivli **değil** ve kartla **aynı board'a** ait (kart ⊆ liste.board invariant'ı korunur).
4. Yeni `position`: client `newPosition` gönderdiyse komşulara göre doğrulanır; yoksa `positionBetween(before, after)` ile hesaplanır.
5. Transaction'da `cards.list_id` + `cards.position` güncellenir; `activity_events` insert (`card.moved` — `fromListId`/`toListId` + eski/yeni `position`); `boards.version` artar.
6. Idempotent: aynı `clientMutationId` ile ikinci kez gelen istek duplicate activity üretmez / no-op döner.

`list.move` (`boardProcedure`, board `member+`): board içinde reorder; `position` `before`/`after` listelere göre `positionBetween` ile hesaplanır (veya client `newPosition` doğrulanır); transaction'da `lists.position` güncellenir; `activity_events` (`list.moved` — eski/yeni `position`); `boards.version` artar; idempotency `clientMutationId` ile.

> **Faz kapsamı:** Faz 3A yalnız domain + `activity_events` üretir. `realtime_events` insert + room publish → Faz 5 ([DEM-28](https://linear.app/demirkol/issue/DEM-28)); `notification_outbox` → Faz 6 ([DEM-29](https://linear.app/demirkol/issue/DEM-29)). Fractional `position` string'i uzadığında tetiklenen **compaction** → Faz 3C ([DEM-44](https://linear.app/demirkol/issue/DEM-44)); tetik eşiği [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md) "Compaction".

### Test (Faz 3A + 3D)

- Domain birim: `positionBetween`/`positionsBetween` edge case'leri (boş liste, başa/sona ekleme, ardışık taşımalar, çok uzun key).
- tRPC integration (3A): reorder (liste-içi), cross-list move, kart yer değiştirmiş senaryosu (`CONFLICT`), arşivli hedef liste, başka board'a taşıma reddi, idempotency (`clientMutationId`).
- Playwright e2e (3D): aynı liste içi taşıma, listeler arası taşıma, liste reorder, başarısızlık rollback, (ops.) eşzamanlı kullanıcı / kart taşınmışken move. Geniş e2e suite → Faz 8 ([DEM-31](https://linear.app/demirkol/issue/DEM-31)).

---

## 5.2 Optimistic UI (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27))

TanStack Query + tRPC (`@trpc/tanstack-react-query`; web client `apps/web/src/trpc`). Optimistic UI burada görsel iyileştirme değil **ürün kalitesinin parçasıdır** — kullanıcı kart taşıdığında / yeniden adlandırdığında / arşivlediğinde UI network beklemez, anında tepki verir; rollback ve `CONFLICT` refetch ile hata yolu kapatılır. Faz 3B drag-drop ([DEM-43](https://linear.app/demirkol/issue/DEM-43)) `card.move`/`list.move` için optimistic akışı zaten kuruyor; Faz 4 bunu **tüm board/list/card collaborative mutation'larına** genelleştirir, ortak cache modelini + helper'ları çıkarır.

### Board cache şekli

Board ekranının ihtiyaçlarına göre normalize edilmiş ağaç (`apps/web/src/lib/board-cache/`):

```txt
BoardCache = { board: { id, workspaceId, title, version, ... }, lists: ListCache[] }   // lists position artan
ListCache  = { id, boardId, title, position, archivedAt, cards: CardCache[] }          // cards position artan
CardCache  = { id, listId, title, position, dueAt, coverColor, completed, ... }
```

Tipler tRPC output tiplerinden türetilir (`trpc.board.get`'in dönüşü); tek kaynak `@pusula/api`.

### Query key konvansiyonu

| Key                          | Anlamı                               | Doldurma                                                   |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `['board', boardId]`         | Tek board (lists + cards dahil)      | `trpc.board.get({ boardId })`                              |
| `['boards', workspaceId]`    | Workspace board listesi (özetli)     | `trpc.board.list({ workspaceId })`                         |
| `['card', cardId]`           | Kart detayı (yorumlar/checklist/üye) | `trpc.card.get({ cardId })`                                |
| `['workspace', workspaceId]` | Workspace meta + üye listesi         | mevcut Faz 1 query                                         |
| `['notifications']`          | Bildirim merkezi                     | Faz 6 ([DEM-29](https://linear.app/demirkol/issue/DEM-29)) |

`apps/web/src/lib/board-cache/keys.ts` factory'si tek kaynaktır; component'lar literal array yazmaz. tRPC'nin kendi query key'leri (procedure path + input) ile manuel key'ler **karıştırılmaz** — `board-cache` modülü `trpc.board.get` / `card.get` / `board.list` için tRPC'nin ürettiği key'lere referans verir, manuel `['board', boardId]` formu helper'ların imzasında yer alır.

### Cache update primitives

`apps/web/src/lib/board-cache/` modülünde **pure** fonksiyonlar (queryClient ile değil, cache snapshot ile çağrılabilir; 4B Vitest birim testleriyle [4D] doğrulanır):

- `updateCardInCache(qc, boardId, cardId, patch)` — kartı `['board', boardId]` ağacında bulup patch'ler; ilgili `['card', cardId]` query'sini de günceller.
- `moveCardInCache(qc, { cardId, fromListId, toListId, newPosition })` — kaynak liste cache'inden çıkarır, hedef listeye komşu sırada ekler (`positionBetween` ile).
- `moveListInCache(qc, { listId, newPosition })` — liste reorder.
- `addCardToCache` / `removeCardFromCache` / `archiveCardInCache` / `archiveListInCache` / `addListToCache` / `updateListInCache` / `updateBoardInCache` / ...

### Mutation lifecycle

```txt
onMutate:    ['board', boardId] cancel; cache snapshot al; cache primitive ile optimistic update; { snapshot } rollback context döndür
onError:     ctx.snapshot ile cache'i geri yaz; düşük gürültülü hata toast (CONFLICT hariç — aşağıda)
onSuccess:   server sonucuyla cache reconcile (örn. server'ın kesin `position`'ı ile son düzeltme — gerekiyorsa)
onSettled:   ['board', boardId] (gerekirse ['card', cardId]) invalidate → arka planda refetch
```

### `clientMutationId` semantiği

Collaborative state değiştiren her mutation `clientMutationId: string` (UUID v4) taşır — client `crypto.randomUUID()` ile üretir, input'a ekler. Üç amaç:

1. **Idempotency** — backend aynı `clientMutationId` ile gelen retry'ı tekrar uygulamaz (Faz 4'te yalnız **log/audit kaydı** — gerçek dedupe Faz 5'te outbox + short-window cache ile).
2. **Realtime echo ayıklama (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28))** — server activity event'leri `clientMutationId` ile yayar; client kendi gönderdiği `clientMutationId`'yi event'te tanırsa optimistic update'i tekrar uygulamaz (echo). Faz 4'te altyapı kurulur (input + log + activity event alanı); tüketici Faz 5'te.
3. **Audit / debug** — log'ta hangi UI eylemi hangi server transaction'ına denk geldiği izlenir.

Şema: `@pusula/domain` mutation input'larında `clientMutationId: z.string().uuid().optional()` (gönderim opsiyonel; Faz 4C UI tüm collaborative mutation'larda **mutlaka** üretir — opsiyonel olması Faz 5 sonrası backward-compat ve test kolaylığı içindir).

### `CONFLICT` davranışı

Server `TRPCError({ code: 'CONFLICT', ... })` döndüğünde (eşzamanlı move — bkz. [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md) "Eşzamanlılık"):

1. Optimistic update rollback edilir (`ctx.snapshot`).
2. `['board', boardId]` invalidate + refetch — backend güncel state alınır.
3. Kullanıcıya kısa bilgi: "Liste başka bir yerde güncellendi, yeniden yüklendi." (`strings.board.conflict.refreshed`).

Kart sessizce kaybolmaz / yanlış yerde kalmaz — kullanıcı en son backend gerçeğini görür.

### Network / server error

`CONFLICT` dışındaki hatalar (`INTERNAL_SERVER_ERROR`, `UNAUTHORIZED`, network timeout, ...) → cache rollback + `strings.board.dnd.error` (drag-drop) ya da mutation-spesifik hata mesajı + "tekrar dene" CTA. **Otomatik retry yok** (yan etki riski — kullanıcı kontrollü).

### Kapsam (Faz 4)

**Optimistic edilir** (4C): `card.move` · `card.moveToList` · `card.copy` · `card.create` · `card.update` · `card.archive` · `card.complete` · `card.uncomplete` · `list.move` · `list.create` · `list.update` · `list.archive` · `board.create` · `board.update` · `board.archive`.

`list.update({ color })` (DEM-98) ve `list.update({ icon, iconColor })` (DEM-109) aynı optimistic yüzeyi kullanır: `useOptimisticBoardListMutation(api.list.update)` `lists[].color`, `lists[].icon` ve `lists[].iconColor` alanlarını anında patch'ler, `clientMutationId` üretir; realtime echo geldiğinde Faz 5 in-flight store aynı discipline ile event'i atlar.

**Optimistic edilmez** (Faz 5/6'ya bırakılır): `comment.*` · `checklist.*` · `label.*` · `board.members.*` — bu mutation'lar realtime echo + activity feed (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28)) ile birlikte optimistic edilecek; Faz 4'te `await` + invalidate pattern korunur.

### Test (Faz 4D — [DEM-81](https://linear.app/demirkol/issue/DEM-81))

Vitest + Testing Library + msw/tRPC mock ile failure modları (mutation başına en az 1 senaryo): network hata (rollback), `CONFLICT` (refetch + toast), race (eşzamanlı `card.move`), rollback doğrulaması (cache snapshot eski state), `clientMutationId` injection (UUID v4 regex). Cache update primitives'in pure-function birim testleri 4B'de ([DEM-79](https://linear.app/demirkol/issue/DEM-79)). E2E (Playwright) Faz 8'e ([DEM-31](https://linear.app/demirkol/issue/DEM-31)), realtime echo ayıklama testleri Faz 5'e bırakılır.

---

## 5.3 Realtime (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28))

Socket.IO + Redis adapter. **Realtime kalıcı veri kaynağı değildir** — kalıcı kaynak PostgreSQL (entity tabloları + `activity_events` + `realtime_events` outbox + `notification_outbox`). Socket.IO yalnızca düşük gecikmeli **taşıma katmanı**; gerçek source of truth her zaman DB.

Faz 5 sözleşmesi: iki kullanıcı aynı board'da değişiklikleri canlı görür (board/list/card collaborative mutation'ları). Comment / notification badge / presence → Faz 6 (notification merkezi + outbox); mobile realtime → Faz 7.

### Yayın stratejisi: Worker queue + `realtime_events` outbox (Karar — 2026-05-13)

Mutation tx commit'inden sonra **emit edilen** in-process Socket.IO çağrısı **yapmayız** (event kaybı riski: Redis blip / API node restart). Onun yerine **outbox pattern**:

```txt
1. tRPC mutation transaction'ı:
     - entity tablosu güncellenir (cards / lists / boards)
     - activity_events satırı INSERT
     - realtime_events satırı INSERT  ← outbox (yeni Faz 5 tablosu)
     - boards.version + 1
2. Transaction COMMIT → mutation response döner (client'a 200)
3. Worker (apps/worker) `pusula-realtime-publish` BullMQ kuyruğundan job alır
     (producer: API tx commit sonrası `void enqueue({ eventId })`;
      worker: `realtime_events` tablosundan satırı okur)
4. Worker → apps/api Socket.IO server'a Redis pub/sub üzerinden publish
5. Socket.IO Redis adapter → ilgili board room → connected client'lar
6. Worker `realtime_events.published_at` damgalar (idempotent — aynı satır iki kez publish'lenebilir, client `seq` ile dedupe)
```

Bu pattern Faz 6 `notification_outbox` ile birebir simetrik. Replay garantisi: enqueue başarısız olsa bile satır DB'de durur; periyodik "stale outbox sweeper" job (sonraki tur) `published_at IS NULL AND created_at < now() - 30s` satırları yeniden enqueue eder.

Realtime kullanım seviyesi: kart/liste taşıma → evet; kart başlığı/açıklaması/due/cover → evet; kart archive/complete → evet; board create/update/archive → evet; yorum → Faz 6 (notification badge ile birlikte); presence → Faz 6/7; push (Expo) → hayır; email (Resend) → hayır.

> **Wired — Faz 6C ([DEM-92](https://linear.app/demirkol/issue/DEM-92), 2026-05-14):** Faz 5B outbox pattern'i comment/checklist/card-label/card-member/board-label/board-member/board-invitation mutation'larına genişledi. Her `realtime_events` insert'i için `boards.version` artar; web dispatcher `apps/web/src/lib/realtime/event-handlers.ts` yeni `comment.*`, `checklist.*`, `card.label_*`, `card.member_*`, `board.label_*`, `board.member_*` ve `board.invitation_*` event tiplerini ilgili `comment.list`, `checklist.list`, card label/member ve board label/member cache'lerine uygular.

### Room modeli

`@pusula/domain/events`'te `roomName(kind, id)` helper'ı:

```txt
board:{boardId}      → board collaborative kanalı (Faz 5 ana kanal)
user:{userId}        → kullanıcı kişisel kanalı (Faz 6 notification + Faz 7 push deep link)
workspace:{wsId}     → workspace-geneli event (sonraki faz — workspace değişiklikleri)
card:{cardId}        → ileri faz (kart-spesifik subscribe — şimdi board room yeterli)
```

Faz 5'te aktif: **`board:{boardId}` + `user:{userId}`**. Client board sayfasında `board:{boardId}` join eder; bağlantı kurulduğunda `user:{userId}` otomatik join (server). `viewer+` rolü join eder (`viewer` event'leri görür ama yazmaz — optimistic edemez, salt-okunur).

### Event envelope

`@pusula/domain/events`'te `RealtimeEventEnvelope` + `realtimeEventEnvelopeSchema` (Zod):

```ts
type RealtimeEventEnvelope<TPayload = unknown> = {
  id: string; // realtime_events.id (UUID — idempotent dedupe için)
  type: string; // 'card.moved' | 'list.archived' | 'board.updated' | ...
  workspaceId: string;
  boardId?: string; // board-scoped event'ler için
  cardId?: string; // card detail event'leri için (Faz 6+)
  actorUserId: string; // mutation'ı yapan kullanıcı
  clientMutationId?: string; // echo ayıklama (Faz 4A altyapısı; opsiyonel — server-initiated event'ler için yok)
  seq: number; // boards.version (board-scoped) — gap tespiti için
  payload: TPayload; // event-spesifik veri (ör. card.moved için { cardId, fromListId, toListId, position })
  createdAt: string; // ISO-8601, server-side
};
```

Event tipleri (Faz 5 kapsamı): `card.moved` · `card.created` · `card.updated` · `card.archived` · `card.completed` · `card.uncompleted` · `card.movedToList` (cross-board: hem kaynak hem hedef board room'una) · `card.copied` · `list.moved` · `list.created` · `list.updated` · `list.archived` · `board.created` (workspace room — sonraki faz) · `board.updated` · `board.archived`.

Faz 6C ile genişletilen tipler: `comment.created`/`updated`/`deleted`/`mentioned` · `checklist.created`/`item_added`/`item_checked`/`item_unchecked` · `card.label_added`/`label_removed` · `card.member_added`/`member_removed` · `board.label_*`/`board.member_*`/`board.invitation_*` (bkz. yukarıdaki Faz 6C wired notu).

Faz 11 (kart eki) ile eklenen tipler: `attachment.added` (payload `{ attachmentId, fileName, mimeType, sizeBytes, hasDescription }`) · `attachment.removed` (payload `{ attachmentId, fileName, mimeType, sizeBytes }`). Board scope; `attachment.commit` / `attachment.delete` mutation transaction'ı içinde `realtime_events` outbox satırı INSERT edilir, worker `pusula-realtime-publish` üzerinden ilgili `board:{boardId}` room'una yayar; web `useBoardRealtime` handler `attachment.list` cache'ini invalidate eder (board kart yüzündeki paperclip+sayı chip'i + modal "Ekler N" sekme rozeti tetiklenen `attachment.list` refetch'iyle güncellenir). `boards.version + 1` `commit` ve `delete`'te artar. Detay → [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md) §9.1, [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md).

`list.updated` envelope'ı DEM-98 ile additive `color` payload alanı taşır: `{ listId, color }` (`color` yeni değer, `null` = rengi kaldır). DEM-109 ile aynı envelope additive `icon` ve `iconColor` alanlarını da taşıyabilir; `icon: null` her zaman `iconColor: null` ile gelir, `iconColor: null` tek başına ikon rengini varsayılan/metin rengine döndürür. Rename akışındaki mevcut `fromTitle`/`toTitle` alanları korunur. Client handler bu alanları `updateListInCache` / board-cache primitive'lerine iletir.

### Client reconciliation

`apps/web/src/lib/realtime/` (DEM-85 / 5C):

- **Echo ayıklama:** `useOptimisticBoardMutation` (Faz 4C) her başlattığı mutation için `clientMutationId`'yi in-flight `Set`'e ekler; mutation `onSettled` (success veya error) sonrası set'ten siler. Event listener `if (event.clientMutationId && inFlightSet.has(event.clientMutationId)) return;` — kendi mutation'ının echo'sunu görür ve cache'i tekrar güncellemez.
- **`seq` gap tespiti:** Board cache'in `lastAppliedSeq` alanı (`boards.version` aynası). Gelen event:
  - `event.seq === lastAppliedSeq + 1` → uygula, `lastAppliedSeq = event.seq`.
  - `event.seq > lastAppliedSeq + 1` → **gap** (kaçırılan event); board cache invalidate + `board.get` refetch (refetch sonrası `lastAppliedSeq` server'ın `boards.version`'ına eşitlenir).
  - `event.seq <= lastAppliedSeq` → **stale** (eski/duplicate); atla.
- **Reconnect resync:** Socket reconnect event'inde board sayfasındaki `boardKey` invalidate + refetch (eksik event'ler için tek refetch yeterli; outbox replay'i client'a gönderilmez — server güncel state'i döner).

### Auth & yetki

Socket bağlantısı: Better Auth session cookie ile handshake; başarısız → bağlantı reddet. `board:{boardId}` join talebi → server `resolveBoardAccess(userId, boardId)` (`viewer+`) → join veya reddet (Socket.IO `disconnect('Forbidden')`).

### Operasyonel notlar

- Birden fazla API instance varsa **Redis adapter zorunlu**. Faz 5 başlangıcında tek instance bile olsa adapter kurulur (multi-instance'a hazırlık + worker → API publish için Redis pub/sub).
- Socket.IO long-polling transport Dokploy/Traefik arkasında açıksa **sticky session test edilir**; sadece WebSocket transport ise ihtiyaç azalır (Redis adapter zaten cross-instance fan-out yapar).
- Worker `pusula-realtime-publish` kuyruğu sağlığı: API healthcheck'i worker bağlantısını da yansıtır (sonraki tur — Faz 8 sertleştirme).

Detay implementasyon → [`03-backend.md`](03-backend.md) (Socket.IO server) + [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) (worker + outbox) + [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.10 (web client) + [`04-veri-katmani.md`](04-veri-katmani.md) (`realtime_events` tablosu) + [`10-platform.md`](10-platform.md) (Redis adapter + sticky session).
