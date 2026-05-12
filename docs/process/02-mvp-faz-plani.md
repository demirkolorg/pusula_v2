---
title: "02 — MVP Faz Planı"
description: "MVP fazları, faz çıktıları ve mevcut durum özeti."
aliases:
  - "MVP Faz Planı"
  - "Phase Plan"
tags:
  - "pusula"
  - "process/phase-plan"
type: "plan"
axis: "process"
status: "active"
parent: "[[docs/process/README|Süreç]]"
updated: 2026-05-12
---
# 02 — MVP Faz Planı

> Eksen: **süreç**. Statü değiştiğinde bu dosyayı güncelle (kaynak: bu dosya). Linear tarafında her faz
> Pusula projesinde bir **milestone**; Faz 2–8 ayrıca birer faz-seviyesi **epic** issue taşır. Önceden bölünmüş ama
> henüz başlamamış "bir sonraki faz"ın alt işleri Linear'da `Sonraki Faz` durumundadır (Unstarted kategorisinde, `Backlog` ile
> `Todo` arasında ara katman: `Backlog` = uzak, `Sonraki Faz` = bir sonraki faz/planlı, `Todo` = mevcut fazın bekleyen işleri, `In Progress` = aktif, `Review`/`Done`); faz başlayınca alt işler `Todo`'ya alınır.

| Faz | İçerik | Çıktı | Durum | Linear |
| --- | --- | --- | --- | --- |
| **0 — Temel altyapı** | Monorepo (pnpm + Turborepo), TypeScript strict, `apps/` + `packages/` iskeleti, Drizzle migration sistemi, Better Auth bağlantısı, yerel Docker Compose (Postgres/Redis/MinIO) | Boş ama çalışan web/api/worker uygulamaları; Drizzle şema iskeleti; docker-compose | ✅ Tamam | _Faz 0_ milestone · [DEM-18](https://linear.app/demirkol/issue/DEM-18) |
| **1 — Auth & Workspace** | Better Auth sign-in/up/out akışları, session yönetimi, Workspace CRUD, workspace member modeli, permission helper'ları procedure'lere bağlı | Kullanıcı login olup workspace görebilir | ✅ Tamam (ek işler: `workspace.delete` `Backlog`, workspace yönetim UI `Todo`) | _Faz 1_ milestone · [DEM-20](https://linear.app/demirkol/issue/DEM-20) (Done), [DEM-22](https://linear.app/demirkol/issue/DEM-22) (Done), [DEM-23](https://linear.app/demirkol/issue/DEM-23) (Done), [DEM-24](https://linear.app/demirkol/issue/DEM-24) (Backlog), [DEM-39](https://linear.app/demirkol/issue/DEM-39) (Todo) |
| **2 — Board/List/Card CRUD** | Board/List/Card CRUD (tRPC + Drizzle), temel board ekranı, transaction yapısı | Kullanıcı pano/liste/kart oluşturabilir | — (alt işleri `Sonraki Faz`'da) | _Faz 2_ milestone · [DEM-25](https://linear.app/demirkol/issue/DEM-25) (epic) → [DEM-33](https://linear.app/demirkol/issue/DEM-33) · [DEM-34](https://linear.app/demirkol/issue/DEM-34) · [DEM-35](https://linear.app/demirkol/issue/DEM-35) · [DEM-36](https://linear.app/demirkol/issue/DEM-36) · [DEM-37](https://linear.app/demirkol/issue/DEM-37) |
| **3 — Drag-Drop** | Atlassian Pragmatic Drag and Drop ile web board drag-drop; liste reorder, kart reorder, listeler arası taşıma; position/ranking algoritması; Playwright drag-drop testleri | Drag-drop akıcı ve backend ile tutarlı | — | _Faz 3_ milestone · [DEM-26](https://linear.app/demirkol/issue/DEM-26) (epic) |
| **4 — Optimistic UI** | TanStack Query cache modeli, `clientMutationId`, optimistic move/create/update, rollback, mutation failure testleri | UI network beklemeden tepki verir | — | _Faz 4_ milestone · [DEM-27](https://linear.app/demirkol/issue/DEM-27) (epic) |
| **5 — Realtime** | Socket.IO server, board room, user room, Redis adapter, event envelope, client reconciliation | İki kullanıcı aynı board'da değişiklikleri canlı görür | — | _Faz 5_ milestone · [DEM-28](https://linear.app/demirkol/issue/DEM-28) (epic) |
| **6 — Bildirim** | Activity event, notification outbox, worker processor, in-app notification center, badge, Expo push token modeli, push gönderimi | Atama/mention/yorum bildirimleri çalışır | — | _Faz 6_ milestone · [DEM-29](https://linear.app/demirkol/issue/DEM-29) (epic) |
| **7 — Mobil** | Expo app, auth, board listesi, board görüntüleme, card detail, notification center, push deep link | Mobil temel görev yönetimi + bildirim | — | _Faz 7_ milestone · [DEM-30](https://linear.app/demirkol/issue/DEM-30) (epic) |
| **8 — Sertleştirme** | E2E testler, load test, error tracking, audit log, PostgreSQL full-text search, MinIO attachment, permission edge case'leri | Beta yayına hazır ürün | — | _Faz 8_ milestone · [DEM-31](https://linear.app/demirkol/issue/DEM-31) (epic) |

> Faz 2 epic'i ([DEM-25](https://linear.app/demirkol/issue/DEM-25)) önden alt işlere bölündü (aşağıya bkz.). Faz 3–8 epic'leri
> Linear'da `Backlog`'tadır; ilgili fazın geliştirmesi başlayınca epic alt issue'lara bölünür ve her alt iş
> [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)'ye satır olarak eklenir.

## Faz 1 alt işleri

Faz 1, alt işlere bölündü (sıra: 1 → 2 → 3; `workspace.delete` ek iş). Her biri iş kayıt defterinde
ayrı satır ve Pusula projesi `Faz 1 — Auth & Workspace` milestone'unda bir Linear issue taşır
([`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)).

1. **Workspace alanı (backend)** — `workspaceProcedure` middleware (bkz. [`../architecture/03-backend.md`](../architecture/03-backend.md)), Workspace CRUD (create / list / get / update / archive), workspace member listesi + rol yönetimi, permission enforcement (`@pusula/domain/permissions`), ilgili `activity_events`. Procedure → rol haritası: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md). — `Done` (`API-2026-05-12-001` / [DEM-20](https://linear.app/demirkol/issue/DEM-20); QA + verifier PASS, commit `97cd9b8`, kullanıcı onayladı).
2. **Auth web UI & session** — sign-up / sign-in / sign-out ekranları, session-aware (client-side) layout, korumalı route group, workspace listesi/oluşturma ekranı; gerekli shadcn bileşenleri (`@pusula/ui`). Bkz. [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.1. — `Done` (`FE-2026-05-12-001` / [DEM-22](https://linear.app/demirkol/issue/DEM-22); QA + verifier PASS, commit `cefd148`, kullanıcı onayladı).
3. **Workspace davet akışı** — `workspace_invitations` tablosu (süreli, tek kullanımlık token), `members.invite` + `invitations.{list,revoke,mine,accept,decline}` procedure'leri, davet bildirimi (`notification_outbox`); web: davet et dialog'u + bekleyen davetler bölümü ([`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.1); davet akışı kuralları [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Workspace davet akışı). — `Done` (`API-2026-05-12-002` / [DEM-23](https://linear.app/demirkol/issue/DEM-23); backend + web UI tamam — db + domain + api + Vitest (46 test) + `apps/web` davet UI + RTL, migration `0002`+`0003`, QA + verifier PASS, commit `bca834a` (backend) + `a3fba50` (web); kullanıcı onayladı. Ertelenen: davet rol seçimi + gönderilmiş davet yönetimi UI'ı).
4. **`workspace.delete`** (ek iş) — owner-only **kalıcı silme** (input'ta workspace adı `confirmName` birebir eşleşmeli; `DELETE FROM workspaces` → üye/davet/board… cascade; `archive`'dan ayrı, geri dönüşsüz; cascade nedeniyle DB içi iz tutulmaz). Bkz. [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md). — `In Progress` (`API-2026-05-12-003` / [DEM-24](https://linear.app/demirkol/issue/DEM-24); kullanıcı kararı: hard delete; backend implemente ediliyor).
5. **Workspace yönetim ekranı (web)** (ek iş) — backend'de var olan `workspace.update`/`archive` + `workspace.members.{list,updateRole,remove}` procedure'lerini UI'ye bağla: workspace rename/archive + üye listesi/rol değiştir/üye çıkar (owner/admin'e açık). Davet UI'ı (alt iş 3) eklendi; bu iş rename/archive + üye yönetimini kapsar. Bkz. [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.1. `doc-denetim` F6 ile açıldı. — `Todo` (`FE-2026-05-12-003` / [DEM-39](https://linear.app/demirkol/issue/DEM-39); `blockedBy` DEM-20 — backend hazır).

## Faz 2 alt işleri

Faz 2 ([DEM-25](https://linear.app/demirkol/issue/DEM-25) — epic) beş alt işe bölündü (sıra: 2.0 → 2A → (2B ∥ 2C) → 2D).
Linear'da hepsi DEM-25 altında, `Faz 2 — Board/List/Card CRUD` milestone'unda; durum `Sonraki Faz` —
`Backlog` ile `Todo` arasında ara katman ("bir sonraki faz, planlı"). Faz 2 geliştirmesi başlayınca her alt iş `Todo`'ya
alınır. İş kayıt defteri satırları Faz 2.0 işinde eklenir ([`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)).
Karar: `move`/reorder mutation'ları (list/kart taşıma) Faz 2 değil **Faz 3** kapsamı ([DEM-26](https://linear.app/demirkol/issue/DEM-26)) — Faz 2 = statik CRUD (create sona ekler, alan güncelle, arşivle).

1. **Faz 2.0 — Önce belge** — `docs/architecture/03-backend.md` (`boardProcedure`/`cardProcedure` + `board.*`/`list.*`/`card.*` procedure listesi), [`../architecture/04-veri-katmani.md`](../architecture/04-veri-katmani.md) (boards/lists/cards şema + `position` kolonları), [`../architecture/05-board-mekanigi.md`](../architecture/05-board-mekanigi.md) (CRUD veri akışı), [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (board/list/card invariant'ları), [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (procedure → rol haritası), bu dosyanın "Faz 2 alt işleri" bölümü + `05-is-kayit-defteri.md` satırları. **Kontrol odası tab'ında** yapılır ([`../kontrol-odasi/README.md`](../kontrol-odasi/README.md)). — `Sonraki Faz` ([DEM-33](https://linear.app/demirkol/issue/DEM-33)). Bağımlılık: yok; 2A öncesi tamamlanır.
2. **Faz 2A — Board CRUD (backend)** — `boardProcedure` middleware (board resolve + `effectiveBoardRole`, `ctx.board`), `board.{list,create,get,update,archive}`, server-side permission enforcement (`@pusula/domain/permissions`), `activity_events` (`board.*`) aynı transaction. Şema mevcut (Faz 0); gerekirse migration. — `Sonraki Faz` ([DEM-34](https://linear.app/demirkol/issue/DEM-34)). Bağımlılık: Faz 1A (DEM-20, Done) + Faz 2.0.
3. **Faz 2B — List CRUD (backend)** — `list.{create,update,archive}` (`boardProcedure` üzerinde), create = board sonuna fractional `position` (`@pusula/domain/position`), board-edit permission, `activity_events` (`list.*`), arşivli liste aktif kart almaz. — `Sonraki Faz` ([DEM-35](https://linear.app/demirkol/issue/DEM-35)). Bağımlılık: Faz 2A; 2C ile paralel.
4. **Faz 2C — Card CRUD (backend)** — `cardProcedure` context, `card.{create,get,update,archive}`, create = liste sonuna fractional `position`, **kart ⊆ liste.board invariant'ı** + arşivli liste aktif kart eklemesi/taşıması almaz, board-edit permission, `activity_events` (`card.*`). — `Sonraki Faz` ([DEM-36](https://linear.app/demirkol/issue/DEM-36)). Bağımlılık: Faz 2A; 2B ile paralel.
5. **Faz 2D — Temel board ekranı (web)** — workspace içi board listesi + board detay sayfası (`(app)/workspaces/[id]/boards/[id]`): kolon + kart render, oluştur/yeniden adlandır/arşivle akışları (form/buton, **drag-drop yok**), shadcn (`@pusula/ui`), Türkçe metinler `strings.ts`, RTL testleri. Optimistic UI bu fazda zorunlu değil (Faz 4 — DEM-27). — `Sonraki Faz` ([DEM-37](https://linear.app/demirkol/issue/DEM-37)). Bağımlılık: Faz 2A + 2B + 2C.

Her fazın teknik ayrıntısı ilgili `docs/architecture/` dosyalarında; ilgili iş kuralları
`docs/domain/` dosyalarında. Faz sırası kullanıcı aksini istemedikçe bu şekilde ilerler.
