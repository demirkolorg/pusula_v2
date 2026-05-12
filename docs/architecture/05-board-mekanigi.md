---
title: "05 — Board Mekaniği"
description: "Drag-drop, optimistic UI ve realtime board senkronizasyonu."
aliases:
  - "Board Mekaniği"
  - "Drag Drop Optimistic Realtime"
tags:
  - "pusula"
  - "architecture/board"
  - "realtime"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 05 — Board Mekaniği (Drag-Drop · Optimistic UI · Realtime)

> Eksen: **tasarım / teknik**. Bunlar board ekranının çalışma mekanikleridir ve sıkı
> bağlıdır; bu yüzden tek dosyada. Sıralamanın iş anlamı [`../domain/03-siralama-kurallari.md`](../domain/03-siralama-kurallari.md), invariant'lar [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md).

---

## 5.1 Drag-Drop

Web board/list/card sürükle-bırak: **yalnızca Atlassian Pragmatic Drag and Drop**. Kararın
nedeni Trello/Jira tipi pano deneyimine yakınlık, performans odaklı tasarım ve nested taşıma
modeli. (dnd-kit alternatif; "board hissi" öncelikli olduğu için Pragmatic seçildi.)

Zorunlu ilkeler:

- Drag sırasında backend mutation **atılmaz**; React state local güncellenir.
- Mutation yalnızca `onDragEnd` sonrası çalışır; optimistic'tir; başarısızlıkta rollback.
- Realtime event geldiğinde kullanıcı kendi optimistic event'ini tekrar uygulamaz (`clientMutationId`).
- Büyük board'lar için virtualization stratejisi düşünülür; kart ölçüleri stabil — hover/drag'de layout shift yok.
- Playwright testleri: aynı liste içi taşıma, listeler arası taşıma, liste reorder, başarısızlık rollback, eşzamanlı kullanıcı.

`moveCard` mutation şekli (bkz. `moveCardInput` in `@pusula/domain`):

```ts
moveCard({ cardId, fromListId, toListId, beforeCardId, afterCardId, newPosition, clientMutationId });
```

Server move akışı: (1) board edit permission kontrolü → (2) kartın hâlâ beklenen listede olduğu
doğrulanır → (3) yeni position hesaplanır veya client position doğrulanır → (4) transaction'da
kart güncellenir → (5) `activity_events` insert → (6) `realtime_events` insert → (7)
`notification_outbox` kayıtları üretilir.

---

## 5.2 Optimistic UI

TanStack Query + tRPC (`@trpc/tanstack-react-query`; web client `apps/web/src/trpc`). Optimistic
UI burada görsel iyileştirme değil, **ürün kalitesinin parçasıdır**.

Mutation lifecycle:

```txt
onMutate:   ilgili query'ler cancel; mevcut cache snapshot; optimistic update; rollback context döndür
onError:    snapshot cache'e geri yaz; düşük gürültülü hata göster
onSuccess:  server sonucuyla cache reconcile
onSettled:  ilgili board/card query invalidate (gerektiğinde)
```

Protokol kuralları:

- Collaborative state değiştiren her mutation `clientMutationId` taşır (`@pusula/domain`: `clientMutationIdSchema` / `withClientMutationId`).
- Mutation'lar mümkün olduğunca idempotent; aynı mutation iki kez gelirse backend duplicate activity/bildirim üretmez.
- Client cache board ekranının ihtiyaçlarına göre normalize edilir.
- Realtime event'ler aynı client'ın optimistic güncellemesini iki kez uygulamaz.

Genel akış: kullanıcı kartı taşır → UI cache hemen güncellenir → mutation server'a gider →
server transaction'ı tamamlar → server realtime event yayınlar → client kendi `clientMutationId`
değerini tanır, event'i tekrar uygulamaz → mutation başarısızsa cache rollback → gerekirse query invalidate.

---

## 5.3 Realtime

Socket.IO + Redis adapter. **Realtime kalıcı veri kaynağı değildir**; kalıcı kaynak PostgreSQL
ve outbox tablolarıdır. Socket.IO yalnızca düşük gecikmeli taşıma katmanı.

Realtime taşır: kart oluşturuldu/taşındı/güncellendi, liste oluşturuldu/taşındı/güncellendi,
yorum eklendi, mention yapıldı, notification badge değişti, presence.
Realtime için **kullanılmaz**: push notification, email, kalıcı event saklama, source-of-truth çatışma çözümü.

Güvenilirlik modeli:

```txt
DB transaction → activity_events, realtime_events, notification_outbox
worker / after-commit publisher → Socket.IO room publish
client → sequence / board version kontrolü → kendi clientMutationId'sini gördüyse tekrar uygulamaz; event kaçırdıysa ilgili query refetch
```

Room modeli (`@pusula/domain/events`: `roomName(kind, id)`):

```txt
workspace:{workspaceId} · board:{boardId} · card:{cardId} · user:{userId}
```

Event envelope (`RealtimeEventEnvelope` / `realtimeEventEnvelopeSchema` in `@pusula/domain`):

```ts
type RealtimeEventEnvelope<TPayload> = {
  id: string; workspaceId: string; boardId?: string; cardId?: string;
  actorId: string; type: string; payload: TPayload;
  clientMutationId?: string; boardVersion?: number; sequence: number; createdAt: string;
};
```

`sequence` (global, `realtime_events.sequence`) veya `boards.version` ile client kaçırdığı
event'i anlar ve socket event'lerini yamalamak yerine ilgili board/card query'sini refetch eder.
Birden fazla API instance varsa Redis adapter zorunlu. Socket.IO long-polling transport Dokploy/
Traefik arkasında açıksa sticky session test edilir; sadece WebSocket transport ise ihtiyaç azalır.

Realtime kullanım seviyesi: kart/liste taşıma → evet (board cache reconcile); kart başlığı/açıklaması
→ evet; yorum → evet (card room + badge); presence → evet; push → hayır (Expo); email → hayır (Resend + worker).
