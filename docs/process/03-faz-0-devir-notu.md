---
title: 'Pusula v2 — Faz 0 Devir Notu'
description: 'Faz 0 kapanış, kurulum, doğrulama ve sonraki adım notları.'
aliases:
  - 'Faz 0 Devir Notu'
  - 'Phase 0 Handoff'
tags:
  - 'pusula'
  - 'process/handoff'
  - 'phase-0'
type: 'handoff'
axis: 'process'
status: 'done'
parent: '[[docs/process/README|Süreç]]'
updated: 2026-05-12
---

# Pusula v2 — Faz 0 Devir Notu

> Bu dosya bir **anlık durum / handoff** notudur. Yeni işlerde varsayılan başlangıç
> kaynağı değildir. Her yeni iş/oturum için genel başlangıç dosyası
> [`00-calisma-baslangic-rehberi.md`](00-calisma-baslangic-rehberi.md), faz planının
> kanonik kaynağı ise [`02-mvp-faz-plani.md`](02-mvp-faz-plani.md). Bu dosya yalnızca
> Faz 0 sonunda elde ne olduğunu ve kurulum bağlamını hatırlamak için kullanılır.

## Durum

**Faz 0 (temel altyapı) tamamlandı.** Monorepo iskeleti kuruldu, `pnpm typecheck`
ve `pnpm lint` 7/7 temiz, uçtan uca smoke test geçti (Docker infra + DB +
API + web ayağa kalktı, sağlık endpoint'leri 200 döndü, `next build`/`next dev`
çalıştı).

## Ne kuruldu

**Kök** (`d:\projects\pusula_v2`) — pnpm 11 + Turborepo, Node 22, TS strict,
`git init` (commit yok). `package.json`, `pnpm-workspace.yaml`
(+ `allowBuilds`: esbuild/sharp/msgpackr-extract), `turbo.json`, `tsconfig.json`,
`eslint.config.mjs`, `prettier.config.mjs`, `.gitignore`, `.nvmrc`, `env.example`,
`docker-compose.yml`, `README.md`, `.env` (oluşturuldu, gitignore'lu).

### packages/

| Paket            | İçerik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pusula/config` | tsconfig presetleri (`base` / `library` / `node` / `nextjs`) + flat ESLint base (`eslint-base.mjs` / `eslint-next.mjs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@pusula/domain` | `constants` (workspace/board/card rolleri, activity tipleri, kanal/mute/outbox/entity literal'ları), `roles` (zod enum + `workspaceRoleAtLeast`/`boardRoleAtLeast`), `permissions` (`canAccessWorkspace`/`canManageWorkspace`/`canViewBoard`/`canEditBoardContent`/`canManageBoard`, `effectiveBoardRole`), `position` (`fractional-indexing` → `positionBetween`/`positionsBetween`/`firstPosition`), `events` (`RealtimeEventEnvelope` + `realtimeEventEnvelopeSchema` + `roomName`), `schemas` (workspace/board/list/card zod input'ları: `createWorkspaceInput`, `moveListInput`, `moveCardInput`, `clientMutationIdSchema` + `withClientMutationId` mixin, `paginationInputSchema`/`paginated`)                                                                                                                                                          |
| `@pusula/db`     | Drizzle şeması — **24 tablo**: Better Auth (`users`/`sessions`/`accounts`/`verifications`) + `workspaces`/`workspace_members`, `boards`/`board_members`/`labels`, `lists`, `cards`/`card_members`/`card_labels`/`checklists`/`checklist_items`, `comments`/`attachments`, `activity_events`/`realtime_events`, `notifications`/`notification_preferences`/`notification_outbox`/`push_tokens`, `search_documents`. `casing: 'snake_case'` (TS'te camelCase, DB'de snake_case), `position` kolonları **TEXT** (LexoRank), `realtime_events.sequence` bigserial, `boards.version` int (kaçırılan event tespiti için), pgEnum'lar `@pusula/domain` literal'larından. `client.ts` (`createDb`/`getDb`/`getPool`/`db` proxy, `casing: snake_case`), `drizzle.config.ts`, `migrate.ts`, `seed.ts`. Üretilen migration: `packages/db/drizzle/0000_nasty_rattler.sql` |
| `@pusula/api`    | tRPC init (superjson transformer, zodError formatter), `Context` (session + db + requestId/ip/userAgent), `publicProcedure` / `protectedProcedure` (`enforceAuth` middleware — session'ı non-null daraltır), `appRouter` = `health` (ping / db round-trip) · `auth` (me / requireMe) · `workspace` (list / create — transaction'lı, slug üretimi, conflict kontrolü). `RouterInputs` / `RouterOutputs` export                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@pusula/ui`     | shadcn/ui new-york `Button` + `buttonVariants`, `cn`, `components.json` (shadcn CLI için yapılandırıldı), `theme.css` (neutral, Tailwind v4 `@theme inline` token'ları + `.dark` + `@layer base`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### apps/

| App (paket adı)                   | İçerik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` (`@pusula/api-server`) | Hono server — `requestId` + `logger` + `cors` (APP_URL, credentials), Better Auth → `/api/auth/*`, tRPC → `/trpc/*` (`@trpc/server/adapters/fetch`; Hono request'inden Better Auth session çözülüp tRPC context'e konuyor), `/health` + `/`. `env.ts` (zod, port 3001), `auth.ts` (Better Auth + `drizzleAdapter`, e-posta/parola etkin), `tsup.config.ts` (prod build, `@pusula/*` bundle'lanır)                                                                                                                                                                                                                                                                 |
| `apps/worker` (`@pusula/worker`)  | BullMQ + ioredis (`maxRetriesPerRequest: null`), 3 kuyruk (`pusula:notifications` / `pusula:realtime-publish` / `pusula:scheduled`), worker stub'ları (sadece log), graceful shutdown, `env.ts` (zod), `tsup.config.ts`. **Çalıştırılmadı**, sadece typecheck. Gerçek processor'lar Faz 5–6                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web` (`@pusula/web`)        | Next.js 16 App Router (`src/app`), Tailwind v4 (`globals.css` → `@import "tailwindcss"` + `@import "@pusula/ui/theme.css"` + `@source` ile UI paketini tarama), `next.config.ts` (`transpilePackages`), tRPC client (`@trpc/tanstack-react-query` + superjson + `credentials:'include'`; `src/trpc/query-client.ts` + `src/trpc/client.tsx` → `TRPCReactProvider`/`useTRPC`), Better Auth React client (`src/lib/auth-client.ts`), `ApiStatus` widget'ı (`src/components/api-status.tsx` — `health` router'ını çağırır), `Button` demo'su. `@/*` → `src/*`. `apps/web/env.example` (`NEXT_PUBLIC_API_URL`, kod içinde default `http://localhost:3001`). Port 3000 |

### Altyapı

`docker-compose.yml` — Postgres 17 / Redis 7 / MinIO (+ `pusula` bucket'ını oluşturan
`minio-setup`). **Compose proje adı `pusula_v2`**, host portları:
**Postgres `5436` · Redis `6380` · MinIO `9100` (S3) / `9101` (konsol)** — v1 projesiyle
(`D:\projects\pusula`: Postgres `5435`, MinIO `9000/9001`, proje adı `pusula`)
çakışmasın diye. `env.example` (kökte) bu portlara göre.

### Skill

`.claude/skills/kontrol/SKILL.md` — `/kontrol` ile çağrılır; implementasyon sözleşmesi.
`docs/architecture` · `docs/domain` · `docs/process` yapısına ve gerçek paket
adlarına/dosya yollarına referans verir.

## Repo yapısı

```txt
pusula_v2/
├─ apps/
│  ├─ api/        @pusula/api-server   (Hono + tRPC + Better Auth)
│  ├─ web/        @pusula/web          (Next.js App Router)
│  └─ worker/     @pusula/worker       (BullMQ stub)
├─ packages/
│  ├─ api/        @pusula/api          (tRPC router / context)
│  ├─ db/         @pusula/db           (Drizzle schema + migrations)
│  ├─ domain/     @pusula/domain       (zod, roller, permissions, position, events)
│  ├─ ui/         @pusula/ui           (shadcn/ui + theme.css)
│  └─ config/     @pusula/config       (tsconfig + eslint)
├─ docs/          architecture/ · domain/ · process/ · README.md
├─ .claude/skills/kontrol/SKILL.md
├─ docker-compose.yml · env.example · turbo.json · pnpm-workspace.yaml
└─ CLAUDE.md      (çalışma protokolü)
```

## Nasıl ayağa kaldırılır

```bash
pnpm install
cp env.example .env          # AUTH_SECRET üret: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# (opsiyonel) cp apps/web/env.example apps/web/.env.local
pnpm infra:up                # Postgres + Redis + MinIO (compose proje: pusula_v2)
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                     # web :3000, api :3001, worker
```

Komutlar: `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm db:studio` ·
`pnpm db:reset` (yok — gerekiyorsa eklenecek) · `pnpm infra:down`.
Not: `pnpm db:push` (drizzle-kit) **etkileşimli onay** ister → otomasyon/CI için
`db:generate` + `db:migrate` kullan.

## Doğrulanmış olanlar

- `pnpm typecheck` → 7/7 ✓ · `pnpm lint` → 7/7 ✓ (0 hata)
- DB: migration uygulandı (24 tablo), seed çalıştı (1 workspace / 1 board / 3 list / 2 card)
- API: `/health`, `/`, `/trpc/health.ping`, `/trpc/health.db` (DB round-trip ~17ms),
  `/trpc/auth.me` → `null`, `/api/auth/ok` → `{ok:true}` — hepsi 200 ✓
- `pnpm --filter @pusula/web build` ✓ · `next dev` → `/` 200, sayfa (ApiStatus dahil) render ediyor ✓
- Test sonrası `docker compose down` yapıldı

## Açık noktalar / dikkat

1. **`CLAUDE.md` ↔ mimari doküman çelişkisi** — eski `CLAUDE.md` "sadece bun" diyordu;
   mimari doküman + kullanıcının açık kararı + bu skill **pnpm + Turborepo** diyor.
   Kurulu olan **pnpm**'dir. (Kullanıcı `CLAUDE.md`'yi ayrıca düzenliyor; çelişme
   olursa kurulu durum — pnpm — geçerlidir.)
2. **v1 docker etkilendi (geri alınabilir)** — ilk denemede compose proje-adı çakışması
   yüzünden v1'in `pusula-postgres` / `pusula-minio` **container'ları silindi**.
   **Veri volume'leri (`pusula_pg_data`, `pusula_minio_data`) sağlam.** `D:\projects\pusula`
   içinde `docker compose up -d` ile geri gelir; veri kaybı yok. `pusula-adminer` çalışıyor.
3. Kanonik skill dosyası `.claude/skills/kontrol/SKILL.md`. Eski `docs/SKILL.md` benzeri bir
   kopya geri eklenirse bu dosyayla senkron tutulmalı veya yalnızca yönlendirme dosyası olmalı.
4. `apps/mobile` boş dizini bir ara oluşmuştu, silindi. Mobil kapsamda değil.
5. Commit yok — hazır olunca `git add -A && git commit`.
6. `apps/web/next-env.d.ts` gitignore'lu (Next regenerate eder); `apps/web` typecheck'i
   ilk `next dev`/`next build`'den önce çalıştırılırsa Next tip artırımları eksik olabilir
   — CI'da `build` sırası bunu çözer.
7. `apps/web/eslint.config.mjs` şimdilik sadece base config (Next 16 + typescript-eslint v8
   peer seti pinlenince `next/core-web-vitals` FlatCompat ile eklenecek — TODO not düşüldü).

## Sıradaki adımlar

> Kanonik faz planı: [`02-mvp-faz-plani.md`](02-mvp-faz-plani.md). Aşağısı kısa özet.

**Faz 1 — Auth + Workspace (sıradaki iş)**

- Better Auth giriş/kayıt/çıkış/parola-sıfırlama akışları (`apps/api` tarafı `/api/auth/*`
  zaten mount'lu; web'de `auth-client.ts` var → `/giris` `/kayit` ekranları)
- `protectedProcedure` üzerine workspace/board erişim katmanı:
  `@pusula/domain/permissions` helper'larını kullanan `workspaceProcedure`/`boardProcedure`
  middleware zinciri (session → workspace üyeliği → board rolü → card izni)
- `workspace` router'ını genişlet: get / update / archive, member ekle/çıkar, davet token'ı
  - e-posta (Resend), `notification_preferences` defaults, ilk `activity_events` yazımı
- Web: workspace listesi + oluşturma ekranı, layout/nav iskeleti
- Çıktı: kullanıcı login → workspace görür/oluşturur

**Faz 2 — Board/List/Card CRUD** — board/list/card tRPC router'ları (zod şemaları
`@pusula/domain` içinde hazır), Drizzle transaction yapısı, `boards.version` bump,
basit board ekranı (kolonlar + kartlar, salt görüntüleme)

**Faz 3 — Drag-Drop** — Atlassian Pragmatic Drag and Drop (web), `moveListInput` /
`moveCardInput` (hazır), server move akışı (yetki → durum doğrula → position hesapla/doğrula
→ tx → activity_events → realtime_events → notification_outbox), `@pusula/domain/position`
helper'ları, Playwright testleri (aynı liste / farklı liste / liste reorder / rollback / concurrent)

**Faz 4 — Optimistic UI** — TanStack Query `onMutate`/`onError`/`onSuccess`/`onSettled`,
`clientMutationId` ile kendi echo'sunu yoksayma, rollback snapshot, board cache normalizasyonu,
mutation-failure testleri

**Faz 5 — Realtime** — Socket.IO + Redis adapter, `workspace:` / `board:` / `card:` / `user:`
room'ları, `RealtimeEventEnvelope` (hazır), after-commit publisher (worker'da
`pusula:realtime-publish` kuyruğu zaten stub), `sequence`/`boardVersion` ile kaçırılan
event tespiti → ilgili query refetch

**Faz 6 — Bildirim** — `notification_outbox` → worker processor (zaten stub kuyruk) →
`notifications` tablosu + socket badge + Expo push, in-app notification center,
`push_tokens` yönetimi (logout'ta pasifleştir)

**Faz 7 — Mobil** (Expo) — **henüz scaffold yok, kasıtlı**; istenince `apps/mobile`.
Mobilde drag-drop ilk sürümde hedeflenmez; "liste değiştir" picker'ı

**Faz 8 — Sertleştirme** — PostgreSQL FTS (`search_documents` tablosu hazır; `tsvector` +
GIN + maintenance trigger için ayrı migration), MinIO attachment (presigned URL flow,
`attachments` tablosu hazır), e2e/load test, audit log, observability (Sentry + OTel),
Dokploy deploy hardening, backup stratejisi

## Yeni oturumda başlarken

- Dizin: `d:\projects\pusula_v2`
- `/kontrol` skill'ini kullan (implementasyon sözleşmesi). Detay gerektiğinde
  `docs/architecture/` (tasarım) veya `docs/domain/` (iş kuralı) altındaki ilgili dosyayı aç;
  kod yazmadan önce o dosyayı güncelle (tasarım kuralı → `docs/architecture/`,
  iş kuralı → `docs/domain/`).
- Paket yöneticisi: **pnpm** (kurulu olan bu).
- v1 referansı: `D:\projects\pusula` — UI/UX ve domain mantığı için referans, stack için
  değil (Prisma→Drizzle, NextAuth→Better Auth, dnd-kit→Pragmatic DnD, Bun→pnpm farklı).
