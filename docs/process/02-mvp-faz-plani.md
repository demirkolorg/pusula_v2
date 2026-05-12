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
> Pusula projesinde bir **milestone**; Faz 2–8 ayrıca birer faz-seviyesi **epic** issue taşır.

| Faz | İçerik | Çıktı | Durum | Linear |
| --- | --- | --- | --- | --- |
| **0 — Temel altyapı** | Monorepo (pnpm + Turborepo), TypeScript strict, `apps/` + `packages/` iskeleti, Drizzle migration sistemi, Better Auth bağlantısı, yerel Docker Compose (Postgres/Redis/MinIO) | Boş ama çalışan web/api/worker uygulamaları; Drizzle şema iskeleti; docker-compose | ✅ Tamam | _Faz 0_ milestone · [DEM-18](https://linear.app/demirkol/issue/DEM-18) |
| **1 — Auth & Workspace** | Better Auth sign-in/up/out akışları, session yönetimi, Workspace CRUD, workspace member modeli, permission helper'ları procedure'lere bağlı | Kullanıcı login olup workspace görebilir | 🚧 Devam ediyor | _Faz 1_ milestone · [DEM-20](https://linear.app/demirkol/issue/DEM-20) (Done), [DEM-22](https://linear.app/demirkol/issue/DEM-22) (Review), [DEM-23](https://linear.app/demirkol/issue/DEM-23) (Todo), [DEM-24](https://linear.app/demirkol/issue/DEM-24) (Backlog) |
| **2 — Board/List/Card CRUD** | Board/List/Card CRUD (tRPC + Drizzle), temel board ekranı, transaction yapısı | Kullanıcı pano/liste/kart oluşturabilir | — | _Faz 2_ milestone · [DEM-25](https://linear.app/demirkol/issue/DEM-25) (epic) |
| **3 — Drag-Drop** | Atlassian Pragmatic Drag and Drop ile web board drag-drop; liste reorder, kart reorder, listeler arası taşıma; position/ranking algoritması; Playwright drag-drop testleri | Drag-drop akıcı ve backend ile tutarlı | — | _Faz 3_ milestone · [DEM-26](https://linear.app/demirkol/issue/DEM-26) (epic) |
| **4 — Optimistic UI** | TanStack Query cache modeli, `clientMutationId`, optimistic move/create/update, rollback, mutation failure testleri | UI network beklemeden tepki verir | — | _Faz 4_ milestone · [DEM-27](https://linear.app/demirkol/issue/DEM-27) (epic) |
| **5 — Realtime** | Socket.IO server, board room, user room, Redis adapter, event envelope, client reconciliation | İki kullanıcı aynı board'da değişiklikleri canlı görür | — | _Faz 5_ milestone · [DEM-28](https://linear.app/demirkol/issue/DEM-28) (epic) |
| **6 — Bildirim** | Activity event, notification outbox, worker processor, in-app notification center, badge, Expo push token modeli, push gönderimi | Atama/mention/yorum bildirimleri çalışır | — | _Faz 6_ milestone · [DEM-29](https://linear.app/demirkol/issue/DEM-29) (epic) |
| **7 — Mobil** | Expo app, auth, board listesi, board görüntüleme, card detail, notification center, push deep link | Mobil temel görev yönetimi + bildirim | — | _Faz 7_ milestone · [DEM-30](https://linear.app/demirkol/issue/DEM-30) (epic) |
| **8 — Sertleştirme** | E2E testler, load test, error tracking, audit log, PostgreSQL full-text search, MinIO attachment, permission edge case'leri | Beta yayına hazır ürün | — | _Faz 8_ milestone · [DEM-31](https://linear.app/demirkol/issue/DEM-31) (epic) |

> Faz 2–8 epic'leri Linear'da `Backlog`'tadır; ilgili fazın geliştirmesi başlayınca epic alt issue'lara bölünür
> ve her alt iş [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)'ye satır olarak eklenir.

## Faz 1 alt işleri

Faz 1, alt işlere bölündü (sıra: 1 → 2 → 3; `workspace.delete` ek iş). Her biri iş kayıt defterinde
ayrı satır ve Pusula projesi `Faz 1 — Auth & Workspace` milestone'unda bir Linear issue taşır
([`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)).

1. **Workspace alanı (backend)** — `workspaceProcedure` middleware (bkz. [`../architecture/03-backend.md`](../architecture/03-backend.md)), Workspace CRUD (create / list / get / update / archive), workspace member listesi + rol yönetimi, permission enforcement (`@pusula/domain/permissions`), ilgili `activity_events`. Procedure → rol haritası: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md). — `Done` (`API-2026-05-12-001` / [DEM-20](https://linear.app/demirkol/issue/DEM-20); QA + verifier PASS, commit `97cd9b8`, kullanıcı onayladı).
2. **Auth web UI & session** — sign-up / sign-in / sign-out ekranları, session-aware (client-side) layout, korumalı route group, workspace listesi/oluşturma ekranı; gerekli shadcn bileşenleri (`@pusula/ui`). Bkz. [`../architecture/08-web-ve-mobil.md`](../architecture/08-web-ve-mobil.md) §8.1.1. — `Review` (`FE-2026-05-12-001` / [DEM-22](https://linear.app/demirkol/issue/DEM-22); QA + verifier PASS, commit `cefd148`, kullanıcı onayı bekliyor).
3. **Workspace davet akışı** — davet token tablosu (süreli, tek kullanımlık), invite / accept / decline procedure'leri, davet bildirimi (`notification_outbox`). Bkz. [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.6. — `Todo` (`API-2026-05-12-002` / [DEM-23](https://linear.app/demirkol/issue/DEM-23)).
4. **`workspace.delete`** (ek iş) — owner-only soft-delete + `activity_events` izi; `workspace.list`/`get` silinmiş workspace'i hariç tutar. Bkz. [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md). — `Backlog` (`API-2026-05-12-003` / [DEM-24](https://linear.app/demirkol/issue/DEM-24)).

Her fazın teknik ayrıntısı ilgili `docs/architecture/` dosyalarında; ilgili iş kuralları
`docs/domain/` dosyalarında. Faz sırası kullanıcı aksini istemedikçe bu şekilde ilerler.
