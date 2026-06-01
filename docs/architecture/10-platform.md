---
title: '10 — Platform'
description: 'Test, CI/CD, deployment, environment, observability, güvenlik ve performans ilkeleri.'
aliases:
  - 'Platform'
  - 'Deployment Observability'
tags:
  - 'pusula'
  - 'architecture/platform'
  - 'deployment'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: 2026-05-16
---

# 10 — Platform (Test · CI/CD · Deployment · Environment · Observability · Güvenlik · Performans)

> Eksen: **tasarım / teknik**.

---

## 10.1 Test stratejisi

- **Unit (Vitest):** domain helper, permission, ranking/position hesaplama, notification rule.
- **Integration:** tRPC procedure, database transaction, outbox üretimi, auth/permission akışı (Testcontainers veya Docker Compose test DB).
- **Component (React Testing Library):** bileşen davranışı.
- **E2E (Playwright):** login, board/list/card oluşturma, drag-drop, optimistic rollback, notification center. Harness repo kökünde **`e2e/`** (paket değil — `playwright.config.ts` + `e2e/*.spec.ts` + `e2e/fixtures/`; `@playwright/test` repo-kökü devDep; `playwright.config.ts` `webServer` ile `apps/api` + `apps/web`'i ayağa kaldırır, test DB `docker-compose.yml` Postgres/Redis'e bağlanır + migrate + seed). Faz 3D ([DEM-45](https://linear.app/demirkol/issue/DEM-45)) harness'ı + drag-drop alt kümesini kurar; **Faz 8A ([DEM-284](https://linear.app/demirkol/issue/DEM-284)) geniş suite + CI matrix'i kurar** (aşağıda). Pragmatic DnD native drag event'leri kullandığından sürükleme Playwright'ta `mouse.move` adımlarıyla (gerekirse `dragstart`/`drop` event dispatch'iyle) yapılır.
- **Her zaman test edilir:** permission edge case'leri, position/ranking hesaplama, optimistic rollback, realtime reconciliation, notification outbox üretimi, duplicate mutation / idempotency davranışı, drag-drop aynı liste içi + listeler arası taşıma. Drag-drop özel testleri: aynı listede taşıma, farklı listeye taşıma, liste taşıma, mutation failure → rollback, realtime event → cache reconciliation, iki kullanıcı aynı kartı taşırsa son durum.

### Faz 8A — E2E pyramid + CI matrix ([DEM-284](https://linear.app/demirkol/issue/DEM-284))

Mevcut Playwright suite (drag-drop + realtime + search + share + attachment + mobile) **7 yeni kritik akış spec'i** ile genişler:

| # | Spec dosyası | Kapsam |
|---|---|---|
| 1 | `e2e/auth-flow.spec.ts` | signup + e-posta doğrulama + login + logout + şifre sıfırlama + şifre değiştir |
| 2 | `e2e/workspace-lifecycle.spec.ts` | workspace create + üye davet/kabul/reddet + rol değiştir + üye çıkar + workspace sil |
| 3 | `e2e/board-lifecycle.spec.ts` | board create + üye davet + etiket yönet + rename + arşivle + sil |
| 4 | `e2e/card-collaboration.spec.ts` | kart oluştur + yorum + mention + checklist + atama + due date + kapak rengi + tamamla + arşivle |
| 5 | `e2e/notification-flow.spec.ts` | bildirim üret (yorum/mention/atama) + in-app + email (Resend test mode) + push token revoke + ayar override |
| 6 | `e2e/permission-matrix.spec.ts` | viewer/member/admin/owner her rol × her mutation matris (read/write/delete reject) |
| 7 | `e2e/full-text-search.spec.ts` | board/card/comment/label içeriğinde arama + boş state + permission filter |

**Flake quarantine:** `@flaky` annotation + nightly suite'ten ayrı kuşak (PR/main bloklamaz, takip edilir). Flake rate threshold + tracking (Faz 8D dashboard).

**Test fixture genişletme:** Faz 6 (notification) + Faz 9 (share) + Faz 10 (notification preferences) fixture'ları `e2e/fixtures/seed.ts`'e ekle; `mocksmith` agent'ı ile realistic test data.

---

## 10.2 CI/CD

Pipeline: `install → typecheck → lint → unit tests → integration tests → build → e2e smoke tests`.
Zorunlu kapılar: TypeScript strict pass · lint pass · migration check · unit test pass · API
contract build pass · web build pass · (mobil geldiğinde) mobile typecheck pass.

### Faz 8A — E2E CI matrix ([DEM-284](https://linear.app/demirkol/issue/DEM-284))

| Trigger | Suite | Süre | Amaç |
|---|---|---|---|
| **PR** | `e2e:smoke` (3-4 kritik senaryo — auth + board create + drag-drop) | 5-10 dk | Hızlı feedback; PR bloklayıcı |
| **Main push** | `e2e:critical` (7 yeni + mevcut suite) | 20-30 dk | Merge sonrası regression yakalama; main bloklayıcı |
| **Nightly cron** | `e2e:full` (her şey + flake retry 2x + load smoke) | 60+ dk | Comprehensive; flake izleme |

`.github/workflows/e2e.yml` (yeni) Playwright project matrix kullanır — `--project=smoke` / `critical` / `full` flag'leri. PR smoke fail → merge bloklanır. Main critical fail → revert öner + Sentry alert. Nightly fail → Slack uyarı (8D alerting).

**Faz 8G — Auto-deploy** ([DEM-279](https://linear.app/demirkol/issue/DEM-279)): Dokploy native Git polling — Dokploy UI'da "Auto Deploy" toggle açılır; Dokploy 60sn aralıkla `main` branch'ı kontrol eder, değişiklik varsa otomatik build + deploy. GitHub Action gerekmez. Smoke test: deploy sonrası Dokploy webhook → `/health` + key endpoint check; başarısızsa Dokploy UI'da gösterilir + Sentry alert (8D). Detay [`12-deployment-runbook.md`](12-deployment-runbook.md) "Auto-deploy" bölümü.

---

## 10.3 Deployment (Dokploy — "Docker Compose" servis tipi)

Self-hosted **Dokploy** (Docker/Traefik). Dokploy **tek bir "Docker Compose" servisi** olarak
kullanılır: GitHub repo + branch + repo kökündeki `compose.prod.yml` → tüm stack tek ünite olarak
deploy edilir. Her servisi Dokploy UI'ında ayrı "Application" olarak elle tanımlama **yapılmaz**
(önceki sürümde bu zahmet yarattı). Dokploy'un payı: Traefik + Let's Encrypt TLS, git-push-to-deploy
webhook'u, build logu, env yönetimi, rollback. Compose dosyası git'te → "infrastructure as code"
budur; Dokploy ayarlarını ayrıca kod/Terraform ile yönetmeye gerek yok.

Stack servisleri (`compose.prod.yml`): web (Next.js container), api (Hono Node container), worker
(background jobs), postgres, redis, minio, meilisearch (ileride). API ve worker **aynı image'dan
farklı command** ile koşar ama **ayrı process** (`apps/api/Dockerfile` paylaşılır; worker servisi
`command: node apps/worker/dist/index.js`). Image'lar monorepo'dan multi-stage build edilir
(pnpm + `turbo prune --docker`). Migration (`pnpm db:migrate`) request-path'te değil; deploy sırasında
tek seferlik bir job/komut olarak koşturulur. PostgreSQL / Redis / MinIO / Meilisearch için named
volume + zamanlanmış `pg_dump` + MinIO yedeği production öncesi tanımlanır. Mobil: EAS Build + EAS Update.

Adım adım üretim deploy'u (VDS temizliği → ilk deploy → smoke test → erişimi açma → rollback →
yedekleme → sorun giderme): **[`12-deployment-runbook.md`](12-deployment-runbook.md)**.

Yerel altyapı: repo kökünde `docker-compose.yml` (`pnpm infra:up` / `infra:down` / `infra:logs`) —
Postgres, Redis, MinIO. **Üretim `compose.prod.yml`'i yerel `docker-compose.yml`'den ayrıdır**
(prod'da Postgres internete açılmaz, named volume + yedek, dev kimlik bilgileri kullanılmaz).

### Realtime altyapısı (Faz 5 — [DEM-28](https://linear.app/demirkol/issue/DEM-28))

Socket.IO server `apps/api` HTTP server'ına attach edilir (aynı port 3001; HTTP + WebSocket tek port). Detay → [`03-backend.md`](03-backend.md) "Faz 5 — Socket.IO server"; yayın akışı → [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md) "Realtime event yayın katmanı (Faz 5)".

- **Redis adapter zorunlu:** `@socket.io/redis-adapter` + mevcut `ioredis` (BullMQ ile aynı Redis instance; farklı pub/sub kanalı — `socket.io` namespace). Faz 5 başlangıcında **tek `apps/api` instance** olsa bile adapter kurulur — gerekçe: (a) worker → API publish için Redis pub/sub kanalı zaten lazım; (b) multi-instance scale-out'a hazırlık (kod değişikliği gerekmez). Compose `apps/api` ile `redis` aynı network'te.
- **Sticky session:** Faz 5'te `transports: ['websocket']` (long-polling fallback yok) → WebSocket handshake tek HTTP request'i upgrade eder, sticky session **ihtiyacı yok** (Redis adapter cross-instance fan-out yapar). Long-polling fallback ileride açılırsa Dokploy/Traefik'te `affinity` cookie + Redis adapter birlikte test edilir.
- **Dokploy compose:** `apps/api` servisi `EXPOSE 3001` (HTTP + WebSocket); Traefik `entrypoints: websecure` + WebSocket upgrade header'ları default geçer (`Connection: Upgrade` + `Upgrade: websocket`). `compose.prod.yml`'de ek config yok — mevcut HTTP reverse proxy WebSocket'i şeffaf taşır.
- **Healthcheck:** `apps/api` `/health` endpoint'i Socket.IO server `engine.clientsCount` (bağlı socket sayısı) ve Redis adapter `pubClient.status === 'ready'` kontrolü ekler (sonraki tur). Faz 5'te basit `200 OK` yeterli.
- **Multi-instance scale-out:** Faz 5 başlangıcı tek instance; >100 eşzamanlı socket için scale-out. Redis pub/sub mesaj boyutu büyük olabilir (board cache eventleri payload taşır) — gerekirse event payload'larında kart/liste sadece ID + `seq` tutulup client `board.get` refetch eder ("notification-style" event'ler — sonraki tur optimizasyon). Faz 8 load test bu kararı netleştirir.

---

## 10.4 Environment

Runtime env Zod ile doğrulanır (her app'te `src/env.ts`; `@pusula/db` `DATABASE_URL`'i doğrular).
Repo kökündeki `.env` (`env.example`'dan kopyala) docker compose + db tooling'i besler; app'ler
dev'de best-effort yükler. Web `NEXT_PUBLIC_API_URL`'i `apps/web/.env.local`'den okur (kodda
varsayılan `http://localhost:3001`). Beklenen anahtarlar:

```txt
DATABASE_URL  REDIS_URL  AUTH_SECRET  APP_URL  API_URL  API_PORT  WEB_PORT
NEXT_PUBLIC_API_URL  EXPO_PUBLIC_API_URL  EXPO_ACCESS_TOKEN
NEXT_PUBLIC_SENTRY_DSN  SENTRY_DSN_API  SENTRY_DSN_WORKER  SENTRY_AUTH_TOKEN  SENTRY_ORG
S3_ENDPOINT  S3_REGION  S3_BUCKET  S3_ACCESS_KEY_ID  S3_SECRET_ACCESS_KEY
RESEND_API_KEY  EMAIL_FROM  MEILISEARCH_URL  MEILISEARCH_API_KEY
```

Secret'lar yalnızca server/worker tarafında. Public env prefix'leri (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`)
yalnızca client'a açılması istenen değerlerde. `.env` dosyaları git'e eklenmez.

---

## 10.5 Observability

Metrikler: API latency, tRPC procedure latency, mutation error rate, drag-drop mutation failure
rate, notification delivery success/failure, queue retry count, websocket connected client count,
DB slow queries. Araçlar: Sentry, OpenTelemetry, Pino (veya benzeri structured logger), Postgres
slow query log. Log alanları: `requestId, userId, workspaceId, boardId, procedure, clientMutationId, durationMs, status`.

### Faz 8D — Sertleştirme dilimi ([DEM-281](https://linear.app/demirkol/issue/DEM-281))

Mevcut observability iskeleti (Sentry hata izleme aktif — DEM-162) **Faz 8D'de** structured logging + dashboard + alerting ile tamamlanır.

#### Structured logging (Pino JSON)

- **Şu an:** mixed (`console.log` + Pino — `apps/api`, `apps/worker` kısmen).
- **Hedef:** tüm runtime'da tutarlı JSON log (Pino) — `apps/api` + `apps/worker` + `apps/web` server-side. `console.log` yasak (ESLint rule + custom plugin).
- **Log seviyeleri:** `info` (normal işlemler), `warn` (recoverable — örn. retry), `error` (Sentry'a + log).
- **Context bindings:** her log satırında `requestId, userId, workspaceId, boardId, procedure, clientMutationId, durationMs, status`. Hono middleware (`apps/api/src/middleware/request-context.ts` yeni) Pino bindings'i request başında set eder; tRPC procedure context'ten devralır.

#### Dashboard (Sentry Insights — V1)

Stratejik karar: **Sentry Insights** kullan (Grafana + Prometheus stack kurmaktan kaçın — minimum konfigürasyon, mevcut Sentry SDK zaten metrik gönderir). V2'de gerekirse Grafana eklenir.

| Dashboard | İçerik |
|---|---|
| **API latency** | tRPC procedure başına p50/p95/p99 (Sentry transaction'larından) + DB query duration p95 (Drizzle log) |
| **Error rate** | 5xx + tRPC error (Sentry error tracking — son 1 saat, son 24 saat trend) |
| **BullMQ queue** | `pusula-notifications`, `pusula-realtime-publish`, `pusula-attachment-cleanup` per queue: waiting/active/completed/failed (Sentry custom metric — worker push) |
| **Realtime** | Socket connection count (`engine.clientsCount` Sentry metric) + events/sec (publish count) |
| **DB** | Slow query log (>500 ms) + connection pool durumu |

#### Alerting

- **Sentry error spike:** 5 dk içinde 10+ yeni hata → email (workspace owner + dev team).
- **Queue pending threshold:** `notification_outbox` pending > 100 (60 saniyeden uzun) → email.
- **Deploy fail:** Faz 8G smoke test FAIL → Dokploy UI + Sentry alert.
- **Nightly E2E fail:** Faz 8A nightly suite FAIL → Slack (V1 alternatif: email).

### 10.5.1 Sentry hata izleme

Sentry'de **3 ayrı proje** tutulur — hatanın hangi katmandan geldiği DSN'den net olsun
(Sentry'nin kendi önerisi; karar 2026-05-16, [DEM-162](https://linear.app/demirkol/issue/DEM-162)):

| Sentry projesi  | Platform | App           | SDK              | DSN env             |
| --------------- | -------- | ------------- | ---------------- | ------------------- |
| `pusula-web`    | Next.js  | `apps/web`    | `@sentry/nextjs` | `NEXT_PUBLIC_SENTRY_DSN` |
| `pusula-api`    | Node.js  | `apps/api`    | `@sentry/node`   | `SENTRY_DSN_API`    |
| `pusula-worker` | Node.js  | `apps/worker` | `@sentry/node`   | `SENTRY_DSN_WORKER` |

Kurallar:

- **DSN gizli değildir** — yalnız olay göndermeye izin verir, okumaya değil. Web DSN'i tarayıcı
  bundle'ına girdiği için `NEXT_PUBLIC_` prefix'lidir (ve `compose.prod.yml`'de web image'ına
  **build arg** olarak verilir, `NEXT_PUBLIC_API_URL` gibi). API/worker DSN'leri server-side.
- **DSN boşsa `Sentry.init` no-op** — lokal dev ve test ortamı Sentry'siz çalışır; DSN zorunlu değil.
- **Node app'lerinde init en üstte**: `apps/api` ve `apps/worker` ilk satırda `instrument.ts`'i
  import eder (`Sentry.init` diğer modüllerden önce çalışmalı — auto-instrumentation gereği).
- **Hata yakalama noktaları**: web → `instrumentation.ts` `onRequestError` + `global-error.tsx`;
  api → Hono `app.onError` içinde `Sentry.captureException`; worker → BullMQ `Worker`'ın
  `failed`/`error` event'lerinde `captureException`.
- **Source map yükleme** — **Faz 8D'de zorunlu hale geldi** (`@sentry/webpack-plugin`, [DEM-281](https://linear.app/demirkol/issue/DEM-281)):
  - `apps/web/next.config.js` `withSentryConfig` wrapper'ı build time'da source-map otomatik upload.
  - `apps/api/tsup.config.ts` + `apps/worker/tsup.config.ts` `@sentry/esbuild-plugin` (tsup esbuild kullanır).
  - Env: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (Dokploy + GitHub Actions secrets — build-time only, runtime'da yok).
  - Token yoksa atlanır (lokal dev + token'sız CI). tRPC permission/validation hataları beklenen akış olduğundan Sentry'ye gürültü olarak gitmemeli — yalnız beklenmeyen 5xx/exception raporlanır.
- **Tunnel route** — `apps/web/next.config.ts` içinde `withSentryConfig`'e `tunnelRoute: '/monitoring'` geçilir. Tarayıcı Sentry envelope'ünü direkt `*.ingest.de.sentry.io`'ya değil same-origin `/monitoring` Next route'una POST eder; Next route Sentry'ye proxy'ler. Gerekçe: reklam engelleyiciler (uBlock Origin, Brave Shields, Pi-hole, AdGuard) `sentry.io` ingest endpoint'lerini otomatik filtreler → olaylar `ERR_BLOCKED_BY_CLIENT` ile düşer ve istemci tarafı hata raporu eksik kalır. CSP `connect-src` Sentry origin'i defense-in-depth olarak korunur (tunnel kapatılırsa hazır).

OpenTelemetry standalone export bu kapsamın dışındadır (V2 — gerekirse Grafana stack'i ile).

---

## 10.6 Güvenlik başlıkları

Procedure-level authorization (kurallar → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)) ·
workspace/board erişim kontrolü · rate limiting · CSRF/CORS konfigürasyonu · input validation (Zod) ·
file upload MIME/type/size kontrolü · audit log · session invalidation · invite token expiration ·
webhook signature verification. Hardcoded secret yok; secret'lar env'den, eksikse açık hata.

---

## 10.7 Performans ilkeleri

İlk board render hızlı · drag sırasında network beklenmez · kart sayısı artınca render patlamaz ·
realtime event yalnızca ilgili cache parçasını günceller · büyük board'larda pagination/virtualization.
Teknik: board query şişirilmez · kart detayları lazy load · comment/activity timeline ayrı query ·
listeler/kartlar stable key ile render · drag sırasında pahalı derived state hesaplanmaz · server
mutation'ları tek transaction içinde kısa.

---

## 10.8 Load test profili (Faz 8C — [DEM-280](https://linear.app/demirkol/issue/DEM-280))

**Araç: k6** (karar 2026-05-24 — [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı). Gerekçe: Grafana entegrasyonu, JS DSL (TS desteği), `xk6-websockets` extension (Socket.IO test), Go single-binary (CI'da kolay kurulum), Sentry/observability stack ile uyumlu.

### Senaryolar

`tests/load/` (yeni klasör) — k6 senaryolar (TypeScript ile, `k6-template-typescript` paterni).

| # | Senaryo | Profil | Hedef |
|---|---|---|---|
| 1 | `auth-and-navigation.ts` | 100 concurrent user, 5 dk ramp + 10 dk steady | login → workspace listesi → board listesi → board detay; p95 latency + error rate ölçer |
| 2 | `board-collaborative-writes.ts` | 50 concurrent user, 15 dk | board CRUD + list CRUD + card CRUD optimistic mutations (10/sn mutation rate); conflict + idempotency davranışı |
| 3 | `realtime-socket-fanout.ts` | **1000+ socket connections**, 15 dk | aynı board'a join + card move event broadcast (Socket.IO + Redis adapter throughput); message delivery latency ölçer |
| 4 | `search-and-notification.ts` | 50 concurrent user, 10 dk | full-text search query + notification fan-out (worker queue throughput) |

### SLO eşikleri

| Metrik | Eşik | Failure aksiyonu |
|---|---|---|
| tRPC procedure p95 latency | < 200 ms | Optimization issue + Sentry alert |
| `board.get` (full payload) p95 | < 500 ms | Query inceleme (N+1?) |
| HTTP error rate | < 0.1% | Sentry investigate |
| Socket message delivery p95 | < 100 ms (publish → tüm receiver) | Redis adapter / fan-out tuning |
| API container memory | < 512 MiB peak | Memory leak inceleme |
| Worker container memory | < 256 MiB peak | Queue concurrency tuning |

### CI/CD

- `package.json` script: `pnpm load:smoke` (5 dk, 1 senaryo) + `pnpm load:full` (60 dk, 4 senaryo).
- `.github/workflows/load-test.yml` (yeni) — **nightly job** (PR-only değil; uzun). Sonuçlar artifact olarak yüklenir + Sentry custom metric'e push.
- SLO ihlali → otomatik issue (`labels: ['performance', 'slo-violation']`) + Slack/email alert.

### Sonuç raporu

Her load test koşusunun sonucu `docs/architecture/10-platform.md` "Load test sonuçları" bölümünde özetlenir (Faz 8C kapanışında manuel). Trendi takip için Sentry custom metric dashboard'ı (8D — "Load test history").
