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
| **Board member** | Board seviyesinde **explicit** yetkilendirilmiş kullanıcı (rol `admin`/`member`/`viewer`). Workspace `owner`/`admin` board'lara explicit üyelik olmadan erişir (inherited — bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) effective board rolü). |
| **Board invitation** | E-postayla gönderilen board daveti; gizli `token` taşır, süreli, **tek kullanımlık** (durumlar workspace daveti gibi: `pending`/`accepted`/`declined`/`revoked`/`expired`). Kabul edilince davetli, workspace üyesi değilse workspace'e `guest` olarak **ve** board'a (davetteki rolle) eklenir — "tek-board misafiri" akışı; bir `(board, e-posta)` çifti için aynı anda yalnızca bir `pending`. Davet eden board `admin` olmalı. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md). |
| **Label** | Board'a ait etiket (ad opsiyonel + renk); kartlara atanır (`card_labels`). Bir board içinde `(renk, ad)` çifti benzersizdir. |
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
11. **Yeni kullanıcı onboarding'i — default workspace + pano şablonu (best-effort):** Bir kullanıcı kayıt olduğunda otomatik olarak bir **default workspace** (kullanıcı `owner` üyesi) + içinde bir **"İlk Pano"** (kullanıcı board `admin` üyesi) oluşturulur; pano **varsayılan listeler** (`Yapılacak` / `Devam Eden` / `Bitti`) ve `Yapılacak` listesinde birkaç **welcome/örnek kart** ile seed edilir (Trello "Welcome board" deneyimi). İlgili `workspace.created` / `board.created` / `list.created` / `card.created` activity event'leri (actor = yeni kullanıcı) **aynı transaction'da** yazılır. Şablon içeriği (liste adları + kart metinleri) `@pusula/domain` sabitlerinde tutulur (i18n placeholder; kullanıcı-yüzlü → Türkçe; welcome metinleri o anki özelliklere göre yazılır, ileride güncellenebilir); liste/kart `position` alanı fractional'dır (`@pusula/domain/position`). Bu **garanti edilmez** — bootstrap hatası signup'ı başarısız saymaz, yalnızca loglanır — dolayısıyla `workspace.list` boş dönebilir ve bu **tutarlı bir durumdur**: bu durumda UI onboarding boş-durumunu gösterir (kullanıcı kendi workspace'ini oluşturur). Signup bootstrap akışı + login sonrası varış noktası (workspace sayısına göre yönlendirme) → [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) (§8.1.3) ve [`../architecture/07-auth.md`](../architecture/07-auth.md).
12. **Kart üyesi adayı board'a erişebilen biri olmalı:** Bir karta `assignee`/`watcher` eklenirken aday kullanıcının o kartın board'una **effective erişimi** (`effectiveBoardRole !== null` — explicit board üyesi veya workspace owner/admin) bulunmalıdır; aksi halde "atanmış ama göremeyen" kullanıcı oluşur (`BAD_REQUEST`). Kart üyeliği yetki vermez; düzenleme yetkisi yine board rolünden gelir. `viewer` yalnızca **kendini** `watcher` yapabilir / `watcher`'lıktan veya kendi `assignee`'liğinden çıkabilir; başka kullanıcıyı eklemek/`assignee` atamak board `member+` gerektirir. Bkz. [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md).
13. **Etiket board scope'ludur, board üyeliği explicit'tir:** Bir etiket (`Label`) bir board'a aittir ve yalnızca o board'un kartlarına atanabilir (`card_labels` — kart ⊆ aynı board). `board_members` satırı **explicit** üyeliktir; workspace `owner`/`admin` board'a explicit üyelik olmadan erişir. `board.members.updateRole`/`remove` yalnızca explicit satırı yönetir — son board `admin` rolden düşürülemez/çıkarılamaz; workspace owner/admin'in board erişimi ancak workspace rolüyle değişir. Board içeriği (etiket, kart üyesi, checklist, yorum) değişen her mutation `boards.version`'ı artırır (realtime "missed event" tespiti için), ama hepsi activity üretmez (etiket CRUD, checklist/item edit & reorder düşük sinyal — bkz. [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)).
14. **Hesap (User) öz-yönetimi ve silme:** Bir kullanıcı **yalnızca kendi** hesabını yönetir — ad, avatar (basit URL; yükleme yok — ileride Faz 8 MinIO attachment'a bağlanabilir), parola değiştirme — ve hesabını silebilir. Hesap silme, kullanıcı **herhangi bir workspace'in `owner`'ıysa engellenir** (ownership transfer henüz yok; kullanıcı önce o workspace'leri silmeli/arşivlemeli/devretmeli) — `@pusula/domain` `canDeleteOwnAccount`. Silme gerçekleştiğinde kullanıcıya bağlı kayıtlar: `sessions`/`accounts`/`workspace_members`/`board_members`/`card_members`/`comments`/`push_tokens`/`notifications` cascade silinir; `activity_events.actor_id`, davet `invited_by_id`/`accepted_by_id` `null`'a çekilir (geçmiş kalır, aktör anonimleşir); `workspaces.owner_id` FK'sı `restrict` — bu yüzden owner kontrolü silmeden önce yapılır. Bunlar domain kuralıdır; kimlik doğrulama altyapısı + enforcement noktası (Better Auth `beforeDelete` hook) → [`../architecture/07-auth.md`](../architecture/07-auth.md) (Profil & hesap yönetimi); yetki tablosu → [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) (Hesap (User) — öz-yönetim). Yeni kullanıcı onboarding'i → invariant 11; davet akışı → invariant 10.
