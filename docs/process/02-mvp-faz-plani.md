# 02 — MVP Faz Planı

> Eksen: **süreç**. Statü değiştiğinde bu dosyayı güncelle (kaynak: bu dosya).

| Faz | İçerik | Çıktı | Durum |
| --- | --- | --- | --- |
| **0 — Temel altyapı** | Monorepo (pnpm + Turborepo), TypeScript strict, `apps/` + `packages/` iskeleti, Drizzle migration sistemi, Better Auth bağlantısı, yerel Docker Compose (Postgres/Redis/MinIO) | Boş ama çalışan web/api/worker uygulamaları; Drizzle şema iskeleti; docker-compose | ✅ Tamam |
| **1 — Auth & Workspace** | Better Auth sign-in/up/out akışları, session yönetimi, Workspace CRUD, workspace member modeli, permission helper'ları procedure'lere bağlı | Kullanıcı login olup workspace görebilir | ⏳ Sıradaki |
| **2 — Board/List/Card CRUD** | Board/List/Card CRUD (tRPC + Drizzle), temel board ekranı, transaction yapısı | Kullanıcı pano/liste/kart oluşturabilir | — |
| **3 — Drag-Drop** | Atlassian Pragmatic Drag and Drop ile web board drag-drop; liste reorder, kart reorder, listeler arası taşıma; position/ranking algoritması; Playwright drag-drop testleri | Drag-drop akıcı ve backend ile tutarlı | — |
| **4 — Optimistic UI** | TanStack Query cache modeli, `clientMutationId`, optimistic move/create/update, rollback, mutation failure testleri | UI network beklemeden tepki verir | — |
| **5 — Realtime** | Socket.IO server, board room, user room, Redis adapter, event envelope, client reconciliation | İki kullanıcı aynı board'da değişiklikleri canlı görür | — |
| **6 — Bildirim** | Activity event, notification outbox, worker processor, in-app notification center, badge, Expo push token modeli, push gönderimi | Atama/mention/yorum bildirimleri çalışır | — |
| **7 — Mobil** | Expo app, auth, board listesi, board görüntüleme, card detail, notification center, push deep link | Mobil temel görev yönetimi + bildirim | — |
| **8 — Sertleştirme** | E2E testler, load test, error tracking, audit log, PostgreSQL full-text search, MinIO attachment, permission edge case'leri | Beta yayına hazır ürün | — |

Her fazın teknik ayrıntısı ilgili `docs/architecture/` dosyalarında; ilgili iş kuralları
`docs/domain/` dosyalarında. Faz sırası kullanıcı aksini istemedikçe bu şekilde ilerler.
