# 10 — Platform (Test · CI/CD · Deployment · Environment · Observability · Güvenlik · Performans)

> Eksen: **tasarım / teknik**.

---

## 10.1 Test stratejisi

- **Unit (Vitest):** domain helper, permission, ranking/position hesaplama, notification rule.
- **Integration:** tRPC procedure, database transaction, outbox üretimi, auth/permission akışı (Testcontainers veya Docker Compose test DB).
- **Component (React Testing Library):** bileşen davranışı.
- **E2E (Playwright):** login, board/list/card oluşturma, drag-drop, optimistic rollback, notification center.
- **Her zaman test edilir:** permission edge case'leri, position/ranking hesaplama, optimistic rollback, realtime reconciliation, notification outbox üretimi, duplicate mutation / idempotency davranışı, drag-drop aynı liste içi + listeler arası taşıma. Drag-drop özel testleri: aynı listede taşıma, farklı listeye taşıma, liste taşıma, mutation failure → rollback, realtime event → cache reconciliation, iki kullanıcı aynı kartı taşırsa son durum.

---

## 10.2 CI/CD

Pipeline: `install → typecheck → lint → unit tests → integration tests → build → e2e smoke tests`.
Zorunlu kapılar: TypeScript strict pass · lint pass · migration check · unit test pass · API
contract build pass · web build pass · (mobil geldiğinde) mobile typecheck pass.

---

## 10.3 Deployment (Dokploy)

Self-hosted **Dokploy** (Docker/Traefik). Ayrı servisler: web (Next.js container), api (Hono Node
container), worker (background jobs), postgres, redis, minio, meilisearch (ileride). API ve worker
aynı image'dan farklı command ile koşabilir ama **ayrı process**. PostgreSQL / Redis persistence /
MinIO / Meilisearch için backup + volume stratejisi production öncesi tanımlanır. Mobil: EAS Build + EAS Update.

Yerel altyapı: repo kökünde `docker-compose.yml` (`pnpm infra:up` / `infra:down` / `infra:logs`) —
Postgres, Redis, MinIO.

---

## 10.4 Environment

Runtime env Zod ile doğrulanır (her app'te `src/env.ts`; `@pusula/db` `DATABASE_URL`'i doğrular).
Repo kökündeki `.env` (`env.example`'dan kopyala) docker compose + db tooling'i besler; app'ler
dev'de best-effort yükler. Web `NEXT_PUBLIC_API_URL`'i `apps/web/.env.local`'den okur (kodda
varsayılan `http://localhost:3001`). Beklenen anahtarlar:

```txt
DATABASE_URL  REDIS_URL  AUTH_SECRET  APP_URL  API_URL  API_PORT  WEB_PORT
NEXT_PUBLIC_API_URL  EXPO_PUBLIC_API_URL  EXPO_ACCESS_TOKEN  SENTRY_DSN
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
