---
title: "01 — Ürün Modeli ve Çekirdek Invariantlar"
description: "Entity listesi, hiyerarşi ve çekirdek domain invariantları."
aliases:
  - "Ürün Modeli"
  - "Çekirdek Invariantlar"
tags:
  - "pusula"
  - "domain/model"
  - "invariants"
type: "domain"
axis: "domain"
status: "active"
parent: "[[docs/domain/README|İş / Domain Kuralları]]"
updated: 2026-05-12
---
# 01 — Ürün Modeli ve Çekirdek Invariant'lar

> Eksen: **iş / domain**. Şema implementasyonu (tablolar, kolonlar) → [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md).

## Entity'ler

| Entity | Anlam |
| --- | --- |
| **Workspace** | Takım/organizasyon alanı. Üst kapsam. |
| **Workspace member** | Workspace seviyesinde yetkilendirilmiş kullanıcı (rol taşır). |
| **Workspace invitation** | E-postayla gönderilen workspace daveti; gizli `token` taşır, süreli (expiration) ve **tek kullanımlık**. Durum: `pending` / `accepted` / `declined` / `revoked` / `expired`. Kabul edilince ilgili `workspace_members` satırı oluşur. Davet eden `admin+` olmalı; rol asla `owner` olamaz. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md). |
| **Board** | Trello panosu. Bir workspace'e aittir. Arşivlenebilir (arşivli board salt-okunur — yeni liste/kart eklenemez, içerik düzenlenemez). `version` alanı taşır (realtime sequence kontrolü). |
| **Board member** | Board seviyesinde yetkilendirilmiş kullanıcı (rol taşır). |
| **Label** | Board'a ait etiket; kartlara atanır (`card_labels`). |
| **List** | Board içindeki kolon. Bir board'a aittir. Arşivlenebilir. |
| **Card** | Liste içindeki görev kartı. Bir listeye aittir. Arşivlenebilir. `due_at` taşıyabilir. |
| **Card member** | Karta atanan kullanıcı (assignee / watcher — bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md)). |
| **Checklist / Checklist item** | Kart içi yapılacaklar listesi ve maddeleri. |
| **Comment** | Karta yorum. |
| **Attachment** | Karta dosya eki (metadata DB'de, içerik MinIO'da). Bkz. [`07-ek-kurallari.md`](07-ek-kurallari.md). |
| **Activity event** | Kart/liste/board üzerinde oluşan işlem geçmişi. Bkz. [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md). |
| **Realtime event** | Düşük gecikmeli yayın için kaydedilen olay (kalıcı kurtarma + sequence). |
| **Notification** | Atama, mention, son tarih, yorum, taşıma, davet gibi olaylardan üretilen bildirim. |
| **Notification preference** | Kullanıcının workspace/board/card bazlı bildirim tercihleri (mute level, mention-only, push/email). |
| **Notification outbox** | İşlenmeyi bekleyen bildirim kayıtları (worker tüketir). |
| **Push token** | Cihaz bazlı Expo push token. |
| **Search document** | Board/card/comment/label metinlerinin denormalize arama kaydı. Bkz. [`06-arama-kapsami.md`](06-arama-kapsami.md). |
| **(Better Auth)** User, Session, Account, Verification | Kimlik doğrulama varlıkları. Bkz. [`../architecture/07-auth.md`](../architecture/07-auth.md). |

## Hiyerarşi

```txt
Workspace
  └─ Board (version)
       ├─ List (arşivlenebilir)
       │    └─ Card (arşivlenebilir, due_at)
       │         ├─ Card member (assignee / watcher)
       │         ├─ Checklist → Checklist item
       │         ├─ Comment
       │         ├─ Attachment
       │         └─ Card label
       └─ Label
```

## Çekirdek invariant'lar

1. Bir kart **aynı anda tek bir listeye** aittir.
2. Bir liste **tek bir board'a** aittir.
3. Bir kart, **listesiyle aynı board'tadır** (kart taşınırken `board_id` tutarlı kalmalı).
4. **Arşivli liste aktif kart taşıması almaz** — açık bir restore akışı yoksa.
5. **Permission kontrolü her tRPC procedure'de server-side** yapılır; frontend state'e güvenilmez.
6. **Realtime room erişimi** server-side board/workspace permission'dan türetilir.
7. **Activity event + notification outbox + realtime event + domain mutasyonu** mümkünse aynı transaction'da oluşturulur.
8. **Idempotency:** aynı `clientMutationId` ile iki kez gelen mutation duplicate activity/bildirim üretmez; aynı domain event'inden duplicate bildirim üretilmez (`event_id` ile dedup).
9. **Position** alanı ardışık tam sayı değildir (fractional/string); bkz. [`03-siralama-kurallari.md`](03-siralama-kurallari.md).
10. **Workspace daveti tek kullanımlıktır:** `accepted`/`declined`/`revoked`/`expired` olduktan sonra tekrar kullanılamaz; bir (workspace, e-posta) çifti için aynı anda yalnızca bir `pending` davet bulunur. Davet ancak token'daki e-postaya sahip, oturum açmış kullanıcı tarafından kabul/ret edilebilir; zaten üye olan kullanıcı için davet kabul akışı no-op (idempotent) sonuçlanır.
11. **Yeni kullanıcı onboarding'i — default workspace (best-effort):** Bir kullanıcı kayıt olduğunda otomatik olarak bir **default workspace** (kullanıcı `owner` üyesi) + içinde **boş bir "İlk Pano"** (kullanıcı board `admin` üyesi) oluşturulur; `workspace.created` ve `board.created` activity event'leri aynı transaction'da yazılır. Bu **garanti edilmez** — bootstrap hatası signup'ı başarısız saymaz, yalnızca loglanır — dolayısıyla `workspace.list` boş dönebilir ve bu **tutarlı bir durumdur**: bu durumda UI onboarding boş-durumunu gösterir (kullanıcı kendi workspace'ini oluşturur). Default panonun **varsayılan listeleri/kartları bu kuralın kapsamında değildir** (ayrı iş — pano şablonu). Signup bootstrap akışı + login sonrası varış noktası (workspace sayısına göre yönlendirme) → [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) (§8.1.3) ve [`../architecture/07-auth.md`](../architecture/07-auth.md).
