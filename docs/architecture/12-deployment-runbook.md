---
title: "12 — Üretim Deploy Runbook'u"
description: "Dokploy 'Docker Compose' servis tipiyle Pusula v2'yi üretime alma: VDS temizliği, ilk deploy, migration, smoke test, erişimi açma, sürekli deploy, rollback, yedekleme."
aliases:
  - 'Deployment Runbook'
  - 'Üretim Deploy Adımları'
  - 'VDS Deploy'
tags:
  - 'pusula'
  - 'architecture/deployment'
  - 'runbook'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/10-platform|10 — Platform]]'
  - '[[docs/architecture/02-teknoloji-kararlari|02 — Teknoloji Kararları]]'
updated: 2026-07-06
---

# 12 — Üretim Deploy Runbook'u (Dokploy "Docker Compose" servis tipi)

> Eksen: **tasarım / teknik**. Deployment **kararı** ve mimari özet → [`10-platform.md`](10-platform.md) §10.3
> ve [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) (ADR-lite 2026-05-12, [DEM-59](https://linear.app/demirkol/issue/DEM-59)).
> Bu dosya **operasyonel adımlardır**: v2'yi VDS'e ilk kez alma + sonrası. Adımları sırayla uygula;
> her aşamanın sonunda "doğrulama" satırını geç.

---

## 12.1 Yaklaşım ve önkoşullar

**Yaklaşım:** Dokploy'da her servisi tek tek "Application" olarak tanımlamak **yok**. Dokploy'da
**tek bir "Docker Compose" servisi** açılır → GitHub repo + branch + repo kökündeki `compose.prod.yml`
→ tüm stack (web · api · worker · postgres · redis · minio) **tek ünite** olarak deploy edilir.
Dokploy'un payı: Traefik + Let's Encrypt TLS, `git push` → otomatik build/deploy webhook'u, build logu,
env yönetimi, rollback. Compose dosyası git'te durduğu için "infrastructure as code" budur — Dokploy
ayarlarını ayrıca kod/Terraform ile yönetmeye gerek yok.

**Önkoşullar:**

- VDS'te Dokploy kurulu ve çalışıyor (panel erişimi var).
- Domain(ler) hazır ve A kaydı VDS IP'sine bakıyor: web **kök domain**de (`<domain>` → web, `www.<domain>`
  → köke kalıcı yönlendirme — Traefik `redirectregex` middleware'i), `api.<domain>` → api.
  MinIO S3 endpoint'i için **ayrı bir subdomain gerekir** (ör. `s3.<domain>`): avatarlar (DEM-160) public-read
  `avatars/*` objeleri olarak tarayıcıdan doğrudan yüklenir; `S3_PUBLIC_URL` bu subdomain'e bakar. Konsol
  (`:9001`) opsiyoneldir, açılırsa ayrı subdomain.
- Repo GitHub'da; Dokploy'un repoya erişimi var (GitHub App veya deploy key).
- `compose.prod.yml` ve `apps/{api,web}/Dockerfile` repoda mevcut — **[DEM-60](https://linear.app/demirkol/issue/DEM-60) ile eklendi** (2026-05-16): repo kökünde `compose.prod.yml` + `.dockerignore`, `apps/api/Dockerfile` (api+worker+migrate ortak), `apps/web/Dockerfile` (Next standalone). Aşağıdaki §12.2 bunların kaynağı/açıklamasıdır.
- Eski v1'i indirme penceresi belli (kullanıcı: "birkaç günlüğüne erişimi kapatıp v2 deploy edeceğiz").

---

## 12.2 Repo tarafı — `compose.prod.yml` + `Dockerfile`'lar

> **Wired ([DEM-60](https://linear.app/demirkol/issue/DEM-60), 2026-05-16):** Aşağıdaki bloklar artık **gerçek dosya**dır — `compose.prod.yml`, `.dockerignore` (repo kökü), `apps/api/Dockerfile`, `apps/web/Dockerfile`. Build context = **repo kökü**. Kanonik kaynak repodaki dosyalardır; aşağıdaki listeler açıklama amaçlıdır. Template'ten bilinçli sapmalar:
> - **`.dockerignore` eklendi** (template'te yoktu) — `node_modules`/`dist`/`.next`/`.turbo`/`.env*`/log/test çıktıları hariç tutulur; `.env`'in image katmanına sızması engellenir, build context küçük kalır.
> - **`apps/web/next.config.ts`** `output: 'standalone'` + `outputFileTracingRoot` (monorepo kök tracing) taşır — web Dockerfile'ı bunu varsayar.
> - **`migrate` ve `worker`** `build:` yerine `image: pusula-api:latest` kullanır (yalnız `api` build eder; üç servis tek image paylaşır → tek build).
> - Servislere **`restart: unless-stopped`** (migrate hariç — `restart: "no"`).
> - **`minio` healthcheck'i yok** — `minio/minio` image'ında `mc`/`curl` gömülü değil; template'in `mc ready local` check'i çalışmaz. Hiçbir servis minio'ya `service_healthy` ile bağlanmadığı için sorun değil.
> - **Doğrulama:** `docker compose -f compose.prod.yml config` parse temiz; `docker compose build api` tam geçti. `web` image build'i `next build` type-check aşamasında, doğrulama anındaki ilgisiz bir working-tree WIP'i nedeniyle bir kez takıldı; Dockerfile/pipeline doğru — temiz working tree'de `docker compose build web` tek koşuyla geçer.

### 12.2.1 `apps/api/Dockerfile` — api **ve** worker bu image'ı paylaşır

api ve worker aynı image'dan **farklı `command`** ile koşar (CLAUDE.md §3). Monorepo için
`turbo prune --docker` ile sadece gerekli workspace'ler çıkarılır:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2 prune @pusula/api-server @pusula/worker --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm dlx turbo@^2 run build --filter=@pusula/api-server --filter=@pusula/worker
# NOT: db migrate tooling'i (`tsx`, `drizzle-kit`) image'da kalsın — `migrate` servisi `pnpm db:migrate`
# çağırır. Bu yüzden `pnpm prune --prod` yapılmıyor (ya da yapılırsa @pusula/db dev deps hariç tutulur).

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app .
USER app
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]   # worker servisinde compose `command:` ile override edilir
```

### 12.2.2 `apps/web/Dockerfile` — Next.js

Next.js için `apps/web/next.config` içinde `output: 'standalone'` açık olmalı (image küçük + tek
`server.js`). `NEXT_PUBLIC_API_URL` **build zamanında** inline edilir → build arg olarak verilmeli.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2 prune @pusula/web --docker

FROM base AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm dlx turbo@^2 run build --filter=@pusula/web

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

### 12.2.3 `compose.prod.yml` — iskelet

> Yerel `docker-compose.yml`'den **ayrı**: prod'da Postgres internete açılmaz, named volume + yedek,
> dev kimlik bilgileri (`pusula:pusula`, `minioadmin`) yok. Env değerleri Dokploy'da girilir; aşağıda
> `${VAR}` referansları Dokploy'un servise enjekte ettiği değişkenlerdir.

```yaml
name: pusula

services:
  migrate: # tek seferlik — şema migration'ları
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: ['pnpm', 'db:migrate']
    environment:
      DATABASE_URL: ${DATABASE_URL}
    depends_on:
      postgres: { condition: service_healthy }
    restart: 'no'

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      AUTH_SECRET: ${AUTH_SECRET}
      APP_URL: ${APP_URL}
      API_URL: ${API_URL}
      API_PORT: 3001
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_REGION: ${S3_REGION}
      S3_BUCKET: ${S3_BUCKET}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      SENTRY_DSN_API: ${SENTRY_DSN_API}
    depends_on:
      migrate: { condition: service_completed_successfully }
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    # Traefik (Dokploy) — domain'i ya bu label'larla ya da Dokploy UI "Domains" sekmesinden ver:
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.pusula-api.rule=Host(`api.${ROOT_DOMAIN}`)'
      - 'traefik.http.routers.pusula-api.entrypoints=websecure'
      - 'traefik.http.routers.pusula-api.tls.certresolver=letsencrypt'
      - 'traefik.http.services.pusula-api.loadbalancer.server.port=3001'

  worker:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: ['node', 'apps/worker/dist/index.js']
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_BUCKET: ${S3_BUCKET}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      SENTRY_DSN_WORKER: ${SENTRY_DSN_WORKER}
    depends_on:
      migrate: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    # worker'a Traefik label yok — HTTP açmaz.

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL} # = https://api.${ROOT_DOMAIN}
        NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN} # build'e inline edilir — boş bırakılabilir
    environment:
      NODE_ENV: production
      PORT: 3000
    depends_on:
      api: { condition: service_started }
    labels:
      - 'traefik.enable=true'
      # Web kök domain'de; www. → köke kalıcı yönlendirilir.
      - 'traefik.http.routers.pusula-web.rule=Host(`${ROOT_DOMAIN}`) || Host(`www.${ROOT_DOMAIN}`)'
      - 'traefik.http.routers.pusula-web.entrypoints=websecure'
      - 'traefik.http.routers.pusula-web.tls.certresolver=letsencrypt'
      - 'traefik.http.routers.pusula-web.middlewares=pusula-www-redirect'
      - 'traefik.http.services.pusula-web.loadbalancer.server.port=3000'
      - 'traefik.http.middlewares.pusula-www-redirect.redirectregex.regex=^https?://www\.(.+)'
      - 'traefik.http.middlewares.pusula-www-redirect.redirectregex.replacement=https://$${1}'
      - 'traefik.http.middlewares.pusula-www-redirect.redirectregex.permanent=true'

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: Europe/Istanbul
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 5s
      timeout: 5s
      retries: 20
    # ports: YOK — Postgres internete açılmaz. Erişim gerekiyorsa SSH tüneli.

  redis:
    image: redis:7-alpine
    command: ['redis-server', '--appendonly', 'yes']
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 20

  minio:
    image: minio/minio:latest
    command: ['server', '/data', '--console-address', ':9001']
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY_ID}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_ACCESS_KEY}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'mc', 'ready', 'local']
      interval: 10s
      timeout: 5s
      retries: 10
    # S3 endpoint'ini app'ler internal ad (`http://minio:9000`) ile kullanır; konsol gerekiyorsa
    # ayrı subdomain + Traefik label ekle (`...loadbalancer.server.port=9001`).

volumes:
  pg_data:
  redis_data:
  minio_data:
```

> **Dokploy ağı:** Dokploy compose servislerini kendi Traefik'iyle eşlemek için servislerin
> `dokploy-network` (external) ağına bağlanması gerekir — Dokploy "Docker Compose" servisi bunu
> çoğunlukla otomatik enjekte eder; etmezse compose'a `networks:` bloğu eklenir. Detayı Dokploy
> compose dokümanından doğrula (→ [`11-referanslar.md`](11-referanslar.md)).

### 12.2.4 Migration disiplini

Migration request-path'te değil (CLAUDE.md §2): `migrate` servisi deploy sırasında tek seferlik koşar
(`pnpm db:migrate` = `@pusula/db` `tsx src/migrate.ts`), `restart: "no"`; `api`/`worker` onun
`service_completed_successfully` durumunu bekler. Alternatif: Dokploy "pre-deploy command" alanında
`pnpm db:migrate` çalıştırmak — ama compose içinde tutmak deploy'u tek üniteye sokar, tercih bu.

> **⚠️ Journal `when` damgaları monotonik artmalı.** Drizzle bir migration'ın "pending" olup
> olmadığına `drizzle/meta/_journal.json`'daki `when` zaman damgasına bakarak karar verir: yeni
> migration'ın `when`'i son uygulanandan KÜÇÜKSE Drizzle onu "zaten uygulanmış" sayıp **sessizce
> atlar** — tablo hiç oluşmaz. (DEM-205, 2026-05-19: `quick_notes` tablosu canlıda oluşmadı,
> `migrate` "applied" dedi ama 0034'ü atladı.) `drizzle-kit generate` `when`'i gerçek `Date.now()`
> ile damgalar; bazı eski migration'lar elle gelecek-tarihli yazıldığından taze üretilen bir
> migration onların altına düşebilir. **Her `pnpm db:generate` sonrası** yeni entry'nin `when`
> değerinin `_journal.json`'daki en büyük değer olduğunu doğrula; değilse mevcut en üst değerin
> üzerine elle çek. Koruma: `migrate.ts` çalışmadan önce `assertJournalMonotonic` ile journal'ı
> doğrular (bozuksa deploy gürültülü kırılır), aynı kontrol `journal-monotonic.test.ts` ile
> CI'da da koşar.

---

## 12.3 Aşama 0 — VDS temizliği (eski v1'i indirme)

> Amaç: v1'i güvenle durdurmak, **verisini yedeklemek**, v2 için port/volume/disk çakışmasını
> önlemek. v1 ile v2 farklı projeler/stack'ler — v1'i **silmeden önce mutlaka yedek al**.

1. **Bakım moduna al / erişimi kapat.** v1'in domain'ini geçici bir "bakımdayız" sayfasına yönlendir
   ya da v1 web servisini durdur. Kullanıcılar birkaç gün erişemeyecek — duyuruyu önceden yap.
2. **v1 veritabanı yedeği:** `docker exec <v1-postgres> pg_dump -U <user> -d <db> -Fc > pusula-v1-$(date +%F).dump`
   ve dosyayı VDS dışına kopyala (scp). (Aynısını gerekiyorsa v1 MinIO bucket'ı için `mc mirror` ile yap.)
3. **v1'i durdur:** Dokploy'da v1 projesinin tüm servislerini Stop et (henüz silme — yedek doğrulanana
   kadar dursun). Doğrula: `docker ps` v1 container'ları görünmüyor.
4. **Yedeği doğrula:** `pg_restore --list pusula-v1-*.dump` çıktısı tabloları gösteriyor; dosya boyutu
   makul. (İstersen ayrı bir test container'da restore dene.)
5. **v1'i kaldır:** Yedek sağlamsa Dokploy'da v1 projesini sil. Sonra artık container/volume/ağ:
   `docker container prune` → `docker image prune -a` → `docker volume ls` (v1 volume'larını gözle
   kontrol edip `docker volume rm <...>`) → `docker network prune`. **`docker volume prune`'u körlemesine
   çalıştırma** — Dokploy/Traefik volume'larını da silebilir; v1'e ait olanları tek tek kaldır.
6. **Disk & port:** `df -h` yeterli yer var; v2'nin kullanacağı portlar (Traefik 80/443 zaten Dokploy'da)
   boş. v2 servisleri host port publish etmiyor (yalnızca Traefik), o yüzden çakışma riski düşük.
7. **Doğrulama:** `docker ps` yalnızca Dokploy/Traefik (+ varsa başka projeler); v1'den iz yok; disk uygun.

---

## 12.4 Aşama 1 — Dokploy'da v2 "Docker Compose" servisi

1. Dokploy panel → **New Project** → ad: `pusula` (v1 silindiği için ad serbest; `compose.prod.yml` `name: pusula` ile de örtüşür).
2. Proje içinde **Create Service → Compose** (Application **değil** — bütün stack'i tek serviste tutuyoruz).
3. **Source:** GitHub → repo `pusula_v2` → branch `main`.
4. **Compose Path:** `compose.prod.yml` (repo kökü).
5. **Build:** Dokploy compose'daki `build:` blokları üzerinden image'ları kendi build eder; ekstra ayar gerekmez.
   (Build arg'ları — `NEXT_PUBLIC_API_URL` — env'den compose `args:` ile geçer; §12.5.)
6. Henüz **Deploy etme** — önce env (§12.5) ve domain (§12.6) gir.

---

## 12.5 Aşama 2 — Environment değişkenleri

Dokploy compose servisinin **Environment** sekmesinde tüm anahtarları gir. Kaynak: [`10-platform.md`](10-platform.md) §10.4 + `env.example`. Üretim değerleri:

| Anahtar                                               | Üretim değeri                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ROOT_DOMAIN`                                         | ana domain (ör. `pusula.example.com`) — Traefik label'ları bunu kullanır                                     |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | güçlü, dev'den farklı; `pusula` / `<rastgele>` / `pusula`                                                    |
| `DATABASE_URL`                                        | `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` (internal host `postgres`) |
| `REDIS_URL`                                           | `redis://redis:6379` (internal host `redis`)                                                                 |
| `AUTH_SECRET`                                         | `openssl rand -base64 32` ile üret; **kaydet** (rotate edersen tüm session'lar düşer)                        |
| `APP_URL`                                             | `https://${ROOT_DOMAIN}` (web kök domain'de)                                                                 |
| `API_URL`                                             | `https://api.${ROOT_DOMAIN}`                                                                                 |
| `NEXT_PUBLIC_API_URL`                                 | `https://api.${ROOT_DOMAIN}` — **build arg** (web image'ına inline edilir)                                   |
| `S3_ENDPOINT`                                         | `http://minio:9000` (app'ler internal kullanır)                                                              |
| `S3_PUBLIC_URL`                                       | Avatarların tarayıcıya açık MinIO origin'i (Traefik subdomain, ör. `https://s3.${ROOT_DOMAIN}`) — DEM-160; `S3_ENDPOINT` internal olduğu için ayrı |
| `S3_REGION`                                           | `us-east-1` (MinIO için fark etmez)                                                                          |
| `S3_BUCKET`                                           | `pusula`                                                                                                     |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`           | MinIO root kimliği — güçlü, dev `minioadmin`'den farklı                                                      |
| `RESEND_API_KEY`                                      | Resend prod API key                                                                                          |
| `EMAIL_FROM`                                          | `Pusula <no-reply@${ROOT_DOMAIN}>` (gönderen domain Resend'de doğrulanmış olmalı)                            |
| `NEXT_PUBLIC_SENTRY_DSN`                              | `pusula-web` Sentry DSN — **build arg** (web image'ına inline edilir; opsiyonel)                            |
| `SENTRY_DSN_API`                                      | `pusula-api` Sentry DSN (opsiyonel; boşsa Sentry kapalı)                                                     |
| `SENTRY_DSN_WORKER`                                   | `pusula-worker` Sentry DSN (opsiyonel; boşsa Sentry kapalı)                                                  |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG`                    | Source map yükleme — yalnız CI/build; boşsa source map yüklenmez                                             |
| `MEILISEARCH_URL` / `MEILISEARCH_API_KEY`             | ileri faz — şimdilik boş                                                                                     |

Kurallar: secret'lar yalnızca server/worker tarafında; `NEXT_PUBLIC_` prefix'i **bilerek client'a açılan**
değerlerde. `.env` dosyaları git'e girmez — bu değerler Dokploy'da yaşar (ve bir parola yöneticisinde yedeklenir).

---

## 12.6 Aşama 3 — Domain + TLS

İki yol var, biri yeter:

- **(A) Compose içinde Traefik label'ları** (§12.2.3'teki gibi) — `Host()` kuralı + `certresolver=letsencrypt`.
- **(B) Dokploy UI "Domains" sekmesi** — compose servisindeki ilgili container'a (`web` → 3000, `api` → 3001)
  domain ata, "HTTPS / Let's Encrypt" işaretle.

Her iki yolda da DNS A kayıtları VDS IP'sine bakmalı: `${ROOT_DOMAIN}` + `www.${ROOT_DOMAIN}` → web, `api.${ROOT_DOMAIN}` → api.
Sertifika ilk istekte üretilir; DNS yayılımı tamamlanmadan deploy edersen Let's Encrypt başarısız olur,
DNS oturunca redeploy. **CORS:** Hono `apps/api` `APP_URL`'i allowed origin olarak okur — `APP_URL` doğru olmalı
(→ [`03-backend.md`](03-backend.md)).

---

## 12.7 Aşama 4 — İlk deploy + migration + MinIO bucket

1. Dokploy compose servisinde **Deploy**'a bas. Build logunu izle (web + api/worker image'ları build edilir).
2. Sıra: `postgres` healthy → `migrate` koşar ve `service_completed_successfully` olur → `api`/`worker` başlar → `web` başlar.
   `migrate` fail ederse logdan bak (`DATABASE_URL` yanlış / şema sorunu); düzelt, redeploy.
3. **MinIO bucket + policy bootstrap'ı `minio-setup` servisi otomatik yapar** (compose'da; her deploy'da idempotent koşar — DEM-276 follow-up 2026-06-01):
   - **Yapılanlar (otomatik):**
     - `mc mb --ignore-existing local/pusula` — attachments + avatars bucket'ı
     - `mc mb --ignore-existing local/pusula-reports` — Faz 13I rapor render asset'leri (`S3_REPORTS_BUCKET`)
     - `mc anonymous set download local/pusula/avatars` — DEM-160 public-read avatar prefix'i
     - `mc admin policy create local pusula-app /policies/pusula-app.json` — service account policy (iki bucket'a RW + List); modern mc'de aynı isim overwrite eder. Policy kaynak dosyası: `infra/minio/policies/pusula-app.json` (volume mount `:ro`).
   - **Manuel kalan tek adım — service account oluşturma** (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` ilk üretimi):
     ```sh
     mc admin user svcacct add local <MINIO_ROOT_USER> \
       --access-key <ACCESS_KEY> \
       --secret-key <SECRET> \
       --policy pusula-app
     ```
     Üretilen credentials'i Dokploy `web`/`api`/`worker` Environment'ına ekle. Bu adım secret üretimi içerir, bootstrap'a girmez. Service account bir kez kurulur; sonraki deploy'larda policy üzerinden bucket erişimi senkron kalır (yeni bucket eklenirse `policies/pusula-app.json` güncellenir, bir sonraki deploy uygular).
   - **Opsiyonel — bucket CORS (`Access-Control-Allow-Origin`):** Web `app.${ROOT_DOMAIN}` origin'inden kart kapağı görselinin baskın rengini canvas örneklemesiyle çıkarıp modal banner arkaplanına uygulamak için (`apps/web` `card-cover-image.tsx` → `onDominantColor`), MinIO bucket'ına `https://app.${ROOT_DOMAIN}` origin'i için CORS izni eklenmelidir. CORS yoksa modal kapak banner'ı sessizce `bg-muted` fallback'inde kalır — kapak görseli yine yüklenir, sadece dominant renk uygulanmaz. `mc` ile: bucket için bir CORS JSON (`AllowedOrigins: ["https://app.${ROOT_DOMAIN}"]`, `AllowedMethods: ["GET"]`, `AllowedHeaders: ["*"]`) hazırlanıp `mc anonymous set-json` benzeri politika veya MinIO konsolundan **Buckets → pusula → Configure → CORS** üzerinden tanımlanır.
   - **Yeni bucket eklerken:** `infra/minio/policies/pusula-app.json` resource listesine `arn:aws:s3:::<bucket>` + `arn:aws:s3:::<bucket>/*` ekle, `docker-compose.yml` + `compose.prod.yml` `minio-setup` entrypoint'ine `mc mb --ignore-existing local/<bucket>` satırı ekle, commit + deploy. Sonraki deploy `minio-setup` yeni bucket'ı + güncel policy'yi uygular.
4. **Doğrulama:** `docker ps` — `pusula-api`, `pusula-worker`, `pusula-web`, `pusula-postgres`, `pusula-redis`, `pusula-minio` ayakta, healthcheck'ler `healthy`; `migrate` `Exited (0)`.

---

## 12.8 Aşama 5 — Smoke test

- `https://api.${ROOT_DOMAIN}/healthz` (veya `apps/api`'deki healthcheck rotası) → 200.
- `https://app.${ROOT_DOMAIN}` açılıyor; sayfa render oluyor (NEXT_PUBLIC_API_URL doğru → API çağrıları gidiyor).
- Hesap oluştur → giriş yap (Better Auth çalışıyor, session set ediliyor).
- Workspace + board + liste + kart oluştur; kartı sürükle-bırak başka listeye taşı (optimistic UI + persist).
- İkinci sekme/kullanıcı aç → realtime board sync geliyor mu (Socket.IO + Redis adapter).
- Davet/e-posta tetikleyen bir akış dene → `notification_outbox` doluyor, `worker` işliyor, Resend e-postası geliyor.
- Bir attachment yükle (varsa) → MinIO'ya yazılıyor, geri okunuyor.
- Sentry/loglar: hata akıyor mu (varsa DSN).

Hepsi yeşilse → Aşama 6.

---

## 12.9 Aşama 6 — Erişimi açma

1. Bakım sayfasını kaldır / v1 yönlendirmesini sök.
2. Asıl public domain v2 web'e bakacak şekilde DNS/Traefik kuralını netleştir (geçişte `app.` subdomain'i
   üzerinden test ettiysen, asıl domain'i de buraya yönlendir).
3. Kullanıcılara "v2 yayında" duyurusu; v1 verisi taşınacaksa taşıma planını uygula (v1 dump'ından
   migrasyon/aktarım — kapsam dışı, ayrı iş).
4. v1 yedeklerini güvenli bir yerde sakla (silme).

---

## 12.10 Sürekli deploy (git push → build)

- Dokploy compose servisinde **Auto Deploy / Webhook**'u aç → `main`'e her push'ta Dokploy yeniden
  build + deploy eder. Build logunu Dokploy panelinden izlersin (kullanıcının "push sonrası build'leri
  izlemek için mantıklı" dediği kazanç burada).
- Her deploy'da `migrate` servisi tekrar koşar; idempotent (uygulanmış migration'ları atlar).
- İstersen "production" branch'i ayrı tutup `main` → staging, `production` → prod ayrımı yapılabilir
  (şimdilik tek `main` yeterli).
- **Faz 8G** ([DEM-279](https://linear.app/demirkol/issue/DEM-279)) sertleştirme detayı + Sentry source-map + off-site yedek + restore tatbikatı + Dokploy Auto Deploy aktivasyonu için → §12.15.

---

## 12.11 Rollback

- **Dokploy:** compose servisinin **Deployments** geçmişinden önceki başarılı deployment'a "Redeploy/Rollback".
- **Kod:** `git revert <bozuk-commit>` → push → otomatik deploy (ileri-yönlü rollback, geçmişi temiz tutar).
- **Şema:** Drizzle migration'ları ileri-yönlüdür; geri almak için **yeni** bir migration yaz (down migration
  varsaymıyoruz). Bu yüzden riskli şema değişikliklerinde önce yedek (`pg_dump`), sonra deploy.
- **Veri:** Felaket durumunda `pg_restore` ile son `pg_dump`'tan dön (→ §12.12).

---

## 12.12 Yedekleme & volume

- Named volume'lar: `pg_data` (Postgres), `redis_data` (AOF), `minio_data` (object storage). Bunlar
  silinmez — `docker volume prune` körlemesine çalıştırılmaz.
- **Zamanlanmış `pg_dump`:** VDS'te cron (ya da Dokploy "Schedule" özelliği) ile günlük
  `docker exec pusula-postgres pg_dump -U <user> -d <db> -Fc > /backups/pusula-$(date +%F).dump`,
  N gün sakla, off-site (S3/başka sunucu) kopyala.
- **MinIO yedeği:** `mc mirror` ile periyodik olarak başka bir hedefe.
- **Redis:** kritik değil (queue + Socket.IO adapter; source of truth Postgres + outbox) — AOF yeterli,
  ayrı yedek şart değil.
- Restore tatbikatı: ara sıra dump'tan ayrı bir ortama restore edip smoke test (yedeğin gerçekten çalıştığını gör).
- **Faz 8G** ([DEM-279](https://linear.app/demirkol/issue/DEM-279)) — off-site yedek somutlaştırma (rclone → S3/B2/R2), 90 gün retention, restore tatbikatı runbook → §12.15.

---

## 12.13 Sorun giderme (uğraştırmamak için)

| Belirti                                                     | Bak / yap                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dokploy'da "her servisi tek tek tanımlamam mı lazım?" hissi | Hayır — **Compose servis tipi** kullan; `compose.prod.yml` tek üniteyi yönetir. Bu runbook bunun içindir.                                                        |
| TLS sertifikası gelmiyor                                    | DNS A kaydı VDS IP'sine bakıyor mu? DNS yayıldı mı? `certresolver` adı Dokploy Traefik ile aynı mı? DNS oturunca redeploy.                                       |
| Web açılıyor ama API çağrıları başarısız                    | `NEXT_PUBLIC_API_URL` build arg'ı doğru mu (build zamanı inline)? Yanlışsa web image'ını yeniden build et. CORS: `apps/api` `APP_URL`'i origin olarak okuyor mu? |
| `migrate` servisi fail                                      | `DATABASE_URL` (`@postgres:5432`, prod parola) doğru mu? Postgres `healthy` mı? Log: hangi migration patladı?                                                    |
| api/worker "ECONNREFUSED redis"                             | `REDIS_URL=redis://redis:6379` (internal host adı), `redis` `healthy` mı? `depends_on` koşulu var mı?                                                            |
| Build çok yavaş                                             | `output: 'standalone'` açık mı (web)? `turbo prune --docker` kullanılıyor mu (gereksiz workspace'ler image'a girmesin)? Dokploy build cache açık mı?             |
| Build logunu nereden görürüm                                | Dokploy panel → compose servisi → Deployments → ilgili deploy → Logs. Runtime log: aynı yerde container logları.                                                 |
| Container ayakta ama 502                                    | Traefik label'daki `loadbalancer.server.port` container'ın gerçekte dinlediği port mu (web 3000, api 3001)?                                                      |
| Disk doldu                                                  | `docker image prune -a` (kullanılmayan eski build'ler), eski yedek dump'larını rotate et.                                                                        |

---

## 12.14 Mobil iOS yayını (EAS Build + App Store) — Faz 7O

Bu bölüm `apps/mobile` Expo uygulamasının App Store yayınını yürütür ([DEM-191](https://linear.app/demirkol/issue/DEM-191)). Android (Google Play) ilk turda ertelenmişti (kullanıcı kararı 2026-05-19) — iOS öncelikli; **Google Play yayını artık [§12.17](#1217-mobil-android-yayını-eas-build--google-play)'de** (2026-07-06 turu). Adımları sırayla uygula.

### 12.14.1 Önkoşullar

- Apple Developer Program üyeliği **aktif** (Individual / Sole Proprietor) — "Welcome to the Apple Developer Program" e-postası geldi, App Store Connect erişimi açık.
- Expo hesabı + EAS CLI: `pnpm dlx eas-cli@latest` (ya da global `eas-cli`).
- `app.config.ts` `extra.eas.projectId` bağlı (✓ 2026-05-18) · 1024×1024 opak `assets/icon.png` (**alpha kanalsız** — `Format24bppRgb`; safe-zone + renk kuralları → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.9; ✓ DEM-191, DEM-235) · `eas.json` production profili `EXPO_PUBLIC_API_URL=https://api.pusulaportal.com` (✓ DEM-191) · `version: '1.0.0'` + `ITSAppUsesNonExemptEncryption=false` (✓ DEM-191).
- **Sentry mobil** — `@sentry/react-native` plugin aktif + EAS env'leri yerinde (`SENTRY_AUTH_TOKEN` Secret · `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_URL` · `EXPO_PUBLIC_SENTRY_DSN`); production profilinde `SENTRY_DISABLE_AUTO_UPLOAD` kaldırıldı, symbol upload açık (✓ [DEM-234](https://linear.app/demirkol/issue/DEM-234), 2026-05-21). Sentry-plugin'li ilk production build'de doğrulanmalı: `sentry-cli` "Upload Debug Symbols" build phase kraşsız + Sentry'ye test crash event + source map symbolicate. Sorun çıkarsa DEM-234 reopen.

### 12.14.2 Adımlar

1. **EAS hesap girişi** — `eas login` (interaktif, Expo kimliği), `eas whoami` ile doğrula. `projectId` config'te zaten bağlı; ayrı `eas init` gerekmez.
2. **İlk dev build** — `eas build --profile development --platform ios`. EAS, Apple ile iletişime geçip imzalama sertifikası + provisioning profile üretir (interaktif Apple ID girişi); bu noktada **Apple Team ID** kesinleşir. Build cihaza kurulduktan sonra **7L doğrulaması**: gerçek-cihaz push teslimi (telefona bildirim düşüyor mu) + deep link açılışı.
3. **Universal link doğrulama dosyası (AASA)** — `apps/web/src/app/.well-known/apple-app-site-association/route.ts` Next.js route handler'ı (statik dosya değil — `NextResponse.json` `Content-Type: application/json` garantiler; `force-static`). `appID = W86CKUEB82.com.pusula.app` (Team ID 2026-05-20 EAS build'inde kesinleşti), `paths: ["*"]` — tüm yollar (kullanıcı kararı 2026-05-18). Web deploy sonrası `https://pusulaportal.com/.well-known/apple-app-site-association` 200 + `application/json` + yönlendirmesiz erişilebilir olmalı. (`assetlinks.json` Android — ertelendi.) — `apps/web` commit'lendi 2026-05-21.
4. **Production build** — `eas build --profile production --platform ios`. `appVersionSource: remote` + `autoIncrement: true` → build numarası EAS'te otomatik artar.
5. **App Store Connect kaydı** — [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → yeni app: ad "Pusula", bundle id `com.pusula.app`, birincil dil Türkçe. Metadata (alt başlık / açıklama / anahtar kelimeler — App Store metin asset'leri) · kategori Productivity · yaş derecelendirme · ekran görüntüleri (zorunlu iPhone + iPad boyutları — `supportsTablet: true`) · **App Privacy** veri-toplama beyanı · gizlilik politikası URL'i (zorunlu).
6. **Gönderim** — `eas submit --platform ios`. `eas.json` `submit.production` boş → interaktif Apple kimliği sorar; tekrar edilebilirlik için App Store Connect API key (`ascApiKeyPath` + key id) `eas.json`'a yazılabilir.
7. **App Review** — önce TestFlight internal test (önerilir), sonra "Submit for Review". Apple incelemesi genelde 24–48 saat. Onay sonrası elle ya da otomatik yayın.

### 12.14.3 OTA güncellemeler (EAS Update)

`eas.json` her profilde `channel` taşır (`production` → `production`). **Native değişmeyen** (yalnız JS/asset) güncellemeler store'a uğramadan: `eas update --branch production`. Native bağımlılık, izin ya da `app.config.ts` değişirse yeni store build'i + review gerekir.

### 12.14.4 İlerleme

| # | Adım | Durum |
| - | ---- | ----- |
| 0 | Apple Developer üyeliği aktif | ✅ aktif (adım 4–6 — production build + TestFlight — bunu doğruluyor) |
| 0 | Build-öncesi config sertleştirme (DEM-191) | ✅ commit `e70acb7` |
| 1 | `eas login` | ✅ 2026-05-20 |
| 2 | İlk dev build + 7L doğrulama (push + deep link) | ✅ 2026-05-20 |
| 3 | `apple-app-site-association` route handler | ✅ kod commit'li — web deploy bekliyor |
| 4 | Production build (build 5 — 7 bug fix dahil) | ✅ 2026-05-21 |
| 5 | App Store Connect kaydı (App ID `6771500786`) | ✅ EAS otomatik oluşturdu |
| 6 | `eas submit` → TestFlight | ✅ build 5 TestFlight'ta, 7 bug doğrulandı |
| 7 | Web redeploy (`/gizlilik` + 404 + AASA canlı) | ⬜ |
| 8 | App Store Connect metadata + ekran görüntüleri + App Privacy | ⬜ |
| 9 | Submit for Review | ⬜ |
| 10 | App Review + yayın | ⬜ |

### 12.14.5 App Store metin asset'leri (taslak)

Adım 5'te App Store Connect'e girilir. Karakter sınırları Apple kuralıdır. **Taslaktır** — kullanıcı yayından önce gözden geçirip onaylar; ürün konumlandırması netleşince güncellenir.

| Alan              | TR                                                              | EN                                                            | Sınır |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ----- |
| Uygulama adı      | Pusula                                                          | Pusula                                                        | 30    |
| Alt başlık        | Panolarla ekip iş yönetimi                                      | Boards for team task flow                                     | 30    |
| Anahtar kelimeler | pano,görev,kart,liste,kanban,proje,ekip,işbirliği,planlama,takip | board,task,card,list,kanban,project,team,collaboration,planner,todo | 100   |
| Kategori          | Verimlilik (Productivity)                                       | —                                                             | —     |

**Tanıtım metni** (170 karakter — build'siz sonradan değişebilir):

- TR: "İşlerini panolara, listelere ve kartlara dök; ekibinle gerçek zamanlı planla, sürükle-bırak ile düzenle."
- EN: "Organize your work into boards, lists and cards; plan with your team in real time and arrange it all with drag and drop."

**Açıklama** (4000 karakter):

TR:

> Pusula, ekiplerin işlerini panolar, listeler ve kartlarla düzenlediği bir görev yönetim uygulamasıdır.
>
> • **Panolar & listeler** — işini görsel sütunlara ayır, akışını bir bakışta gör.
> • **Kartlar** — her iş bir kart: kontrol listesi, etiket, son tarih, üye, ek dosya, yorum ve zengin açıklama.
> • **Sürükle-bırak** — kartları akıcı şekilde taşı, sıralamayı anında düzenle.
> • **Gerçek zamanlı** — ekip arkadaşının değişikliği anında panonda görünür.
> • **Bildirimler** — atandığın iş, yaklaşan son tarih ve yorumlar için anlık bildirim.
> • **Çalışma alanları & roller** — workspace ve pano düzeyinde rol-bazlı erişim.
> • **Arama** — kart, pano ve içerikte hızlı arama.
> • **Açık & koyu tema.**
>
> Pusula web ve mobilde aynı hesapla çalışır.

EN:

> Pusula is a task management app where teams organize their work with boards, lists and cards.
>
> • **Boards & lists** — split your work into visual columns and see your flow at a glance.
> • **Cards** — every task is a card: checklist, labels, due date, members, attachments, comments and a rich description.
> • **Drag and drop** — move cards smoothly and reorder instantly.
> • **Real time** — a teammate's change appears on your board immediately.
> • **Notifications** — instant alerts for assigned work, upcoming due dates and comments.
> • **Workspaces & roles** — role-based access at workspace and board level.
> • **Search** — fast search across cards, boards and content.
> • **Light & dark theme.**
>
> Pusula works with the same account on web and mobile.

### 12.14.6 App Privacy beyanı (taslak)

App Store Connect "App Privacy" bölümünde her veri tipi için: toplanıyor mu · kimliğe bağlı mı · izleme için mi · hangi amaç. Pusula **kullanıcı izleme (tracking) yapmaz** ve üçüncü-taraf reklam SDK'sı içermez → "Data Not Used to Track You".

| Veri tipi (Apple kategorisi)   | Pusula'daki karşılığı                       | Amaç                          | Kimliğe bağlı | İzleme |
| ------------------------------ | ------------------------------------------- | ----------------------------- | ------------- | ------ |
| Contact Info — E-posta         | Better Auth hesabı                          | App Functionality             | Evet          | Hayır  |
| Contact Info — Ad              | Kullanıcı profili adı                       | App Functionality             | Evet          | Hayır  |
| User Content — Fotoğraf/Video  | Kart eki (kamera/galeri yüklemesi)          | App Functionality             | Evet          | Hayır  |
| User Content — Diğer içerik    | Kart başlık/açıklama/yorum/kontrol listesi  | App Functionality             | Evet          | Hayır  |
| Identifiers — Kullanıcı ID     | Hesap kimliği                               | App Functionality             | Evet          | Hayır  |
| Diagnostics — Çökme verisi     | Sentry çökme/performans raporu              | App Functionality / Analytics | Sentry yapılandırmasına göre | Hayır |

Notlar:

- Push bildirim token'ı cihaz bildirimi içindir — Apple beyanında ayrı "data type" değil; bildirim altyapısının parçası.
- **Gizlilik politikası URL'i zorunlu** (Adım 5). `pusulaportal.com` üzerinde bir gizlilik politikası sayfası yayınlanmış olmalı — yoksa Adım 5 öncesi oluşturulmalı (**açık iş**).
- Konum, kişi rehberi, sağlık, finans ve reklam verisi **toplanmaz**.

---

## 12.15 Faz 8G — Production sertleştirme ([DEM-279](https://linear.app/demirkol/issue/DEM-279))

Üretim ortamı (`pusulaportal.com` — DEM-164 ile canlı 2026-05-16) için DEM-164 kapanış follow-up'larını sertleştirir. Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) "Karar kaydı" 2026-05-24.

### 12.15.1 Auto-deploy (Dokploy native Git polling)

**Karar:** Dokploy native "Auto Deploy" (Git polling) — GitHub Action workflow gerekmez (daha basit, mevcut Dokploy webhook altyapısı yeterli). Polling aralığı Dokploy default (60 saniye).

**Adımlar:**
1. Dokploy UI → `pusula` compose servisi → **Settings** → **Auto Deploy** toggle: **ON**.
2. Git branch: `main` (varsayılan).
3. Build trigger: `git push` → Dokploy 60sn içinde değişikliği görür → otomatik `docker compose build --pull` + `up -d`.
4. `migrate` servisi her deploy'da koşar (idempotent — uygulanmış migration'ları atlar).
5. Build log: Dokploy panel → Deployments → ilgili deploy → Logs.

**Smoke test (deploy sonrası otomatik):**
- Dokploy "Healthcheck" tanımı: `compose.prod.yml` `healthcheck` direktifleri (api: `/health` 200, web: `/` 200).
- Healthcheck FAIL → Dokploy deploy `unhealthy` damgalar; UI'da kırmızı + Sentry alert (Faz 8D).
- **Faz 8G manuel smoke test runbook** (deploy sonrası operator):
  ```bash
  curl -fsS https://pusulaportal.com/health
  curl -fsS https://api.pusulaportal.com/health
  curl -fsS -o /dev/null -w "%{http_code}\n" https://pusulaportal.com/login
  # Expected: 200 / 200 / 200
  ```
- Smoke test fail → Dokploy "Rollback" (§12.11).

### 12.15.2 Sentry source-map upload (Faz 8D ile koordine)

**Karar:** `@sentry/webpack-plugin` (web) + `@sentry/esbuild-plugin` (api + worker, tsup esbuild kullanır). Build time'da source-map otomatik upload — minified stack trace yerine gerçek satır/dosya.

**Env (Dokploy build args + GitHub Actions secrets):**
- `SENTRY_AUTH_TOKEN` (Sentry org settings → Auth Tokens → "Project: Releases" scope).
- `SENTRY_ORG` (örn. `pusula`).
- `SENTRY_PROJECT` (üç ayrı: `pusula-web`, `pusula-api`, `pusula-worker`).

**Config (`apps/web/next.config.js`):**
```js
const { withSentryConfig } = require('@sentry/nextjs')

module.exports = withSentryConfig(
  /* mevcut nextConfig */,
  {
    org: process.env.SENTRY_ORG,
    project: 'pusula-web',
    silent: !process.env.SENTRY_AUTH_TOKEN, // token yoksa atla
    widenClientFileUpload: true,
  }
)
```

**Token yoksa:** `silent: !process.env.SENTRY_AUTH_TOKEN` → upload atlanır (lokal dev + token'sız CI çalışır).

**Runtime'da yok:** `SENTRY_AUTH_TOKEN` yalnız build time secret; runtime container env'inde tutulmaz.

### 12.15.3 Off-site yedek (rclone)

**Karar:** `rclone` ile MinIO + Postgres dump'ları → harici S3-uyumlu target (Backblaze B2 önerilen — maliyet/güven oranı; AWS S3 veya Cloudflare R2 alternatif).

**Adımlar:**
1. VDS'te rclone kurulumu (`apt install rclone` veya `curl https://rclone.org/install.sh | sudo bash`).
2. `rclone config` → harici target (Backblaze B2 için: bucket + access key + secret).
3. Cron entry (gece 06:00 — Dokploy backup'tan 1 saat sonra):
   ```cron
   0 6 * * * rclone sync /backups/postgres b2:pusula-backups-offsite/postgres --transfers=4
   0 6 * * * rclone sync /var/lib/docker/volumes/minio_data b2:pusula-backups-offsite/minio --transfers=4
   ```
4. **90 gün retention** off-site target'ta (Backblaze B2 lifecycle policy):
   - 30 gün hot (sık erişim).
   - 30-90 gün cold storage (B2 "long-term").
   - 90 gün sonrası otomatik silinir.

**Maliyet (Backblaze B2 örnek, 2026):** ~$6/TB/ay (hot) + ~$1/TB/ay (cold). 50 GB tahmini yıllık → ~$1/ay.

**Faz 8G dışı (V2):** Multi-region replication, encryption-at-rest key yönetimi.

### 12.15.4 Restore tatbikatı runbook

**Sıklık:** 6 ayda bir (kapanış: Faz 8G ilk tatbikat).

**Tatbikat adımları (staging ortamında, prod'a dokunmadan):**

1. **Yedek seç:** `rclone ls b2:pusula-backups-offsite/postgres` → en son `pusula-YYYY-MM-DD.dump` dosyasını listele; 7 gün önceki yedeği seç.
2. **İndir:** `rclone copy b2:pusula-backups-offsite/postgres/pusula-2026-05-17.dump /tmp/restore/`.
3. **Staging DB'ye restore:**
   ```bash
   docker exec -i pusula-postgres-staging pg_restore -U pusula -d pusula_staging --clean --if-exists < /tmp/restore/pusula-2026-05-17.dump
   ```
4. **Sanity check:** Staging API'ye smoke test (auth + board create + card create); satır sayıları (`SELECT COUNT(*) FROM workspaces/boards/cards`) prod ile kıyaslanabilir mi.
5. **MinIO restore:** `rclone sync b2:pusula-backups-offsite/minio /var/lib/docker/volumes/minio_data_staging` (staging MinIO container).
6. **Staging URL'den manuel UI test** (login → board aç → kart önizle → attachment indir).
7. **Tatbikat raporu:** `docs/process/05-is-kayit-defteri.md`'ye `INFRA-YYYY-MM-DD-XXX` satır ekle (tatbikat tarihi + bulgular + RTO/RPO ölçümü).

**Beklenen RTO (Recovery Time Objective):** < 2 saat (yedek seç + indir + restore + smoke).
**Beklenen RPO (Recovery Point Objective):** < 25 saat (gece 05:00 + 06:00 yedek window).

### 12.15.5 Açık follow-up'lar (V2)

- Multi-region off-site (B2 + S3 — geographic redundancy).
- Encryption-at-rest key yönetimi (KMS).
- Automated restore test (CI nightly — staging'e otomatik restore + smoke).
- PgBackRest entegrasyonu (incremental backup — büyük DB'lerde faydalı).

---

## 12.16 Faz 13 — Raporlama sistemi yayını ([DEM-276](https://linear.app/demirkol/issue/DEM-276))

Faz 13'ün (DEM-256..276) production yayını additive: yeni `report_*` tabloları + yeni queue'lar; mevcut endpoint'ler / kuyruklar dokunulmaz. Rolling update zero-downtime. Bu bölüm 13T'nin (DEM-276) deploy adımlarını + smoke + dry-run geçişi + rollback'i toplar.

### 12.16.1 Önkoşullar

- Bağımlı işlerin Linear durumu `Done`: 13A-13Q + 13R (E2E) + 13S (mobil) ya da skip kararı.
- `WORKER_SHARED_SECRET` üretildi (`openssl rand -base64 48`, min 32 char) — api + worker AYNI değer.
- `S3_REPORTS_BUCKET=pusula-reports` MinIO konsoluyla **manuel oluşturulmuş**, private, lifecycle policy 90g (worker yedeği).
- Resend production paid plan + `EMAIL_FROM` domain Resend dashboard'unda **verified**.
- Sentry projeleri (`pusula-api`, `pusula-worker`) DSN'leri Dokploy env'ine girilmiş.

### 12.16.2 Dokploy env (yeni anahtarlar)

| Anahtar | Üretim değeri | Notlar |
| --- | --- | --- |
| `WORKER_SHARED_SECRET` | `openssl rand -base64 48` çıktısı | api + worker AYNI; her ikisinin de production hardening guard'ı boş bırakılırsa boot'u durdurur |
| `S3_REPORTS_BUCKET` | `pusula-reports` | MinIO konsolundan **manuel oluştur** (private + lifecycle 90g) |
| `INTERNAL_API_URL` | compose'da `http://api:3001` hard-coded | env'de geçersiz kılabilirsin (özel iç DNS gerekirse) |
| `REPORT_RETENTION_DRY_RUN` | İLK HAFTA `true` | 7g log incelemesi sonrası kullanıcı onayıyla `false` + worker restart |
| `REPORT_RETENTION_KEEP_VERSIONS` | `5` (default) | Override istenirse Dokploy env panelinden |
| `REPORT_RETENTION_MAX_AGE_DAYS` | `90` (default) | Override istenirse Dokploy env panelinden |

### 12.16.3 MinIO bucket oluşturma (manuel)

```bash
mc alias set prod https://s3.${ROOT_DOMAIN} <root-key> <root-secret>
mc mb prod/pusula-reports
mc anonymous set none prod/pusula-reports
# Lifecycle policy: 90g sonra otomatik silme (worker retention'ın yedeği)
mc ilm rule add --id "expire-90d" --expire-days 90 prod/pusula-reports
```

Private kalmalı; rapor PDF/Excel asset'lerine yalnızca signed URL ile erişilir (1sa render butonu, 24sa email link). Public access YASAK.

### 12.16.4 Deploy

1. Dokploy panelinden yeni env'leri kaydet → "Apply & Restart" worker + api'yı yeniden başlatır.
2. `git push origin main` → Dokploy webhook tetikler → build (worker image Chromium katmanı ile ~+150MB, ilk build ~5-10dk yavaşlar) → rolling apply.
3. `migrate` servisi otomatik koşar — yeni `report_*` tabloları + 4 enum (~5-10sn).
4. Health: `docker ps` worker `Up (healthy)`; worker stdout'unda `[reportRetentionWorker] cron registered` log'u görünmeli; `getOrLaunchBrowser` ilk PDF tetikleneşe kadar lazy.

### 12.16.5 8 smoke senaryo

Production workspace'inde sırayla (her senaryo tamam olmadan diğerine geçme):

1. **Ad-hoc PDF render**: pano → Raporlar butonu → `board.health` preset → PDF İndir → ≤30sn'de toast + MinIO `workspace/<wsId>/<renderId>.pdf` görünür.
2. **Saved report**: composer'dan Kaydet → workspace `/reports` listesinde başlık görünür → aç → panel render eder + micro-report'lar.
3. **Scheduled rapor**: saved report'a daily 09:00 schedule + recipient (test email) → `runNow` → ≤60sn'de Resend gönderir → email içeriğindeki signed URL açılıyor + PDF iniyor.
4. **Stale rozeti**: iki sekme (admin /reports/<id> açık + member aynı board'da kart taşıyor) → admin'de 1-2sn içinde "Veriler güncellendi" rozeti.
5. **Excel export**: saved report → Excel İndir → ≤10sn'de `.xlsx` → metadata sheet + micro-report sheet'leri.
6. **PNG export**: saved report → bir widget → ⋮ → "Resim olarak indir" → PNG açılır + chart 2x retina net.
7. **Restricted scope**: workspace member (kısıtlı) hesabıyla workspace raporu aç → "Kısıtlı görünüm" rozeti görünür; admin hesabıyla rozet YOK.
8. **Comparison delta**: composer → comparison toggle on → KPI'da ↑/↓ rozeti + chart'ta noktalı önceki seri.

**Mobile smoke (13S Done ise):** TestFlight/Android internal build → Workspace → Raporlar → liste → detay (WebView) → PDF indir → share sheet.

**Diagnostic — render fail olursa:** Worker stdout'unda `[report-render] page JS error` / `[report-render] page non-OK response` / `[reports/print] verifyToken fetch fail` prefix'li satırlar görünür (Faz 13T, DEM-276 sessiz 404 izleme). Token query string PII; log toplama (Loki/Sentry) regex maske ile temizlemeli.

### 12.16.6 Sentry alert kuralları (panel — 4 kural)

| Kural | Koşul | Aksiyon |
| --- | --- | --- |
| PDF render fail rate | `apps/worker` `report-render` `job_failed` > 5 / 15dk | Email + on-call |
| Puppeteer timeout | `PUPPETEER_TIMEOUT` / `pdf_render_failed` > 3 / 1sa | Alert (Chromium memory leak şüphesi) |
| MinIO upload fail | `S3PutObjectFailed` `report-render` > 1 / 15dk | Alert (MinIO down veya disk full) |
| Schedule worker idle | `report-schedule-tick` no success > 5dk | Alert (cron tetiklenmiyor) |

Bonus (V2): `report.cache.hit` / `report.cache.miss` custom metric Grafana dashboard (13E telemetri).

### 12.16.7 Dry-run → live geçişi (ilk hafta sonu)

7 gün boyunca worker stdout'unda `[DRY-RUN] would delete X` sayımları izlenir. Aşırı silme adayı yoksa + worker fail rate sıfıra yakınsa:

1. Kullanıcı onayı al.
2. Dokploy env `REPORT_RETENTION_DRY_RUN=false`.
3. Worker restart (Dokploy panel "Restart container").
4. İlk live tick log'unu izle — `[reportRetentionWorker] deleted N renders` görünmeli.

### 12.16.8 Rollback

**Hızlı (1-2 dk) — feature kapatma:**
- Dokploy "Deployments" geçmişinden önceki başarılı deployment'a "Redeploy".
- Worker mevcut iş kuyruklarını bitirir + yeni iş almaz; api/web raporlama UI'ı kalır ama backend 404.

**Orta (5-10 dk) — şema geri al:**
- Kullanıcı onayıyla manuel SQL (tablolar additive, mevcut veri etkilenmez):
  ```sql
  DROP TABLE report_render_assets;
  DROP TABLE report_renders;
  DROP TABLE report_schedules;
  DROP TABLE saved_reports;
  DROP TYPE report_render_format;
  DROP TYPE report_render_status;
  DROP TYPE report_schedule_cadence;
  DROP TYPE report_scope_kind;
  ```

**Worker partial rollback — sadece render queue:**
- Sorunlu kuyruğu Redis CLI ile manuel pause:
  ```bash
  docker exec pusula-redis redis-cli -a $REDIS_PASSWORD SET "bull:pusula-report-render:meta-paused" 1
  ```
- Render request'leri kuyrukta birikir; UI "hazırlanıyor" toast'unda kalır. Sorun çözülünce resume.

**Backup:** Faz 13 deploy öncesi günlük `pg_dump` zaten alınıyor (§12.12) — felaket durumunda son `pg_dump`'tan dön.

---

## 12.17 Mobil Android yayını (EAS Build + Google Play)

`apps/mobile` Expo uygulamasının Google Play yayınını yürütür. iOS yayını ([§12.14](#1214-mobil-ios-yayını-eas-build--app-store--faz-7o)) tamamlandıktan sonra ertelenen (kullanıcı kararı 2026-05-19) Android turu budur. **Aynı kod tabanı, aynı `app.config.ts`** — Android'e özel farklar: FCM push credential'ı, Play Console service account'ları, Data Safety formu, App Signing. Adımları sırayla uygula.

> **Bireysel hesap uyarısı (2026-07-06 kullanıcı durumu):** Play Console **bireysel** developer hesabı. Google, Kasım 2023 sonrası açılan bireysel hesaplar için **production'a çıkmadan önce en az 20 test kullanıcısıyla 14 gün kesintisiz kapalı test (closed testing)** şartı koyar. **Internal testing bu kurala tabi değildir** — bu ilk tur internal testing hedefli; build + submit hattını doğrularız. Production yolu: internal test ✅ → closed test (14 gün / 20 kişi) → production review.

### 12.17.1 Önkoşullar

- **Google Play Console** developer hesabı **aktif** (bireysel, $25 tek seferlik + kimlik/adres doğrulaması tamam).
- Expo hesabı + EAS CLI (iOS turunda zaten kurulu; `eas whoami` ile doğrula). `projectId` bağlı (✓).
- `app.config.ts` Android bloğu hazır (✓): `package: 'com.pusula.app'` · `adaptiveIcon` (fg + `#0f9171` bg) · `edgeToEdgeEnabled` · `intentFilters` (App Links, `autoVerify: true`) · `expo-splash-screen` `#0f9171`. `newArchEnabled: true`.
- ⚠️ `android/` klasörü git'te tracked değil (`.gitignore`'da) — **ama EAS cloud build yine de fiziksel `android/`'yi "bare" algılayıp kullanır** (prebuild yapmaz); yerel `gradle.properties` cloud'u **ETKİLER**. Bu yüzden ABI için `eas.json` production `env`'inde `ORG_GRADLE_PROJECT_reactNativeArchitectures` **şart** (bkz. adım 3), yoksa AAB yerel emülatör ayarına göre `x86_64`-only çıkar ve gerçek arm64 telefonlar "uyumlu değil" verir. `.easignore` ile `/android` hariç tutma **işe yaramaz** (bare detection klasör varlığına bakar). Kaynak: [[eas-android-abi-x86-only-fix]] (2026-07-06 incident).
- 1024×1024 opak ikon (`assets/icon.png`, alpha kanalsız) + `adaptive-icon.png` (Android adaptive foreground). shadcn/marka safe-zone → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.9.
- Gizlilik politikası URL'i canlı (`https://pusulaportal.com/gizlilik`) — Play Store listing + Data Safety **zorunlu**.

### 12.17.2 Adımlar

1. **Play Console'da uygulama oluştur** — [play.google.com/console](https://play.google.com/console) → **Create app**: ad "Pusula", varsayılan dil Türkçe, tip **App**, ücretsiz. Paket adı build'den gelir (`com.pusula.app`); burada girilmez.
2. **Service account (submit otomasyonu için)** — ⚠️ Google 2024+ akışında Play Console'daki eski "API access" sayfası **kaldırıldı**. Güncel akış: **Google Cloud Console** → [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → proje oluştur/seç → **Create service account** (rol vermeden) → [Google Play Android Developer API](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com)'yi **Enable** → SA'ya **Keys → Add key → JSON** → indir. Sonra **Play Console → Kullanıcılar ve izinler → Yeni kullanıcı davet et** → SA e-postasını (`...iam.gserviceaccount.com`) yapıştır → **Yönetici (tüm uygulamalar)**. Key'i repoya **koyma**; `apps/mobile/google-play-service-account.json` yoluna yerleştir (`.gitignore`'da). `eas.json` `submit.production.android.serviceAccountKeyPath` bunu okur. Doğrulama (build harcamadan): SA JWT → `androidpublisher.../applications/com.pusula.app/edits` POST 200 mü (bkz. [[eas-android-abi-x86-only-fix]] komşusu [[play-store-yayin-durumu]]). Kaynak: `expo.fyi/creating-google-service-account`.
3. **Production build (AAB)** — `eas build --profile production --platform android` (`eas` global değil → `pnpm exec eas`). İlk çalıştırmada EAS **Android upload keystore**'u otomatik üretmeyi teklif eder → kabul et (EAS yönetir; Google Play App Signing ile önerilen akış). `appVersionSource: remote` + `autoIncrement: true` → `versionCode` EAS'te otomatik artar. **ABI kontrolü (zorunlu):** `eas.json` production `env`'inde `ORG_GRADLE_PROJECT_reactNativeArchitectures: "armeabi-v7a,arm64-v8a,x86,x86_64"` **olmalı** — yoksa yerel `android/gradle.properties` sızıp AAB `x86_64`-only çıkar. Build sonrası doğrula: AAB'yi indir (`eas build:view <id> --json` → `artifacts.applicationArchiveUrl` → curl) → `unzip -l app.aab | grep base/lib` → `arm64-v8a` görünmeli (sağlıklı AAB ~89MB, x86_64-only ~48MB).
4. **FCM push credential (Android bildirim teslimi)** — bkz. [§12.17.3](#12173-fcm-push-credential-android). Internal test'te bildirim doğrulaması için gerekli; uygulama kurulumunu bloklamaz ama push'suz kalmamak için build sonrası kur.
5. **Gönderim (internal track)** — `eas submit --profile production --platform android`. `eas.json` `track: internal` → build internal testing kanalına yüklenir. İlk submit'te Play Console uygulamayı build'in imzasıyla eşler; App Signing anahtarı Google'da oluşur.
6. **Internal test dağıtımı** — Play Console → **Testing → Internal testing** → test kullanıcısı e-posta listesi (kendi hesabın + varsa ekip) → **opt-in linki** ile cihaza kur. Smoke test: login → board → drag-drop → realtime → bildirim (FCM kuruluysa) → deep link (`pusulaportal.com/...`).
7. **App Links doğrulama (`assetlinks.json`)** — bkz. [§12.17.4](#12174-app-links-assetlinksjson). App Signing SHA-256 gerektirir; Adım 5'ten sonra üretilebilir. Doğrulanmazsa uygulama çalışır, yalnız `https://pusulaportal.com` linkleri otomatik uygulamada açılmaz.
8. **Production'a giden yol** — internal test yeşilse: **Store listing** (metin + ekran görüntüleri + feature graphic) + **Data Safety** ([§12.17.6](#12176-data-safety-formu-taslak)) + **Content rating** anketi + **Target audience** → **closed testing** (14 gün / 20 kişi, bireysel hesap şartı) → **production review**.

### 12.17.3 FCM push credential (Android)

Android'de Expo push token teslimi **Firebase Cloud Messaging V1** gerektirir (iOS'un APNs karşılığı). Repoda `google-services.json` **yok** → Android push henüz hiç kurulmadı; iOS'ta çalışan bildirim zinciri Android'de FCM olmadan **teslim edilmez** (token üretilir, push düşmez).

**Kurulum:**

1. [Firebase Console](https://console.firebase.google.com) → proje oluştur (veya submit için açılan Google Cloud projesini kullan) → Android app ekle, paket `com.pusula.app`.
2. **FCM V1**: Firebase → Project Settings → **Service accounts** → **Generate new private key** (JSON).
3. Bu JSON'u EAS'e yükle: `eas credentials -p android` → **"Google Service Account" → "Manage your Google Service Account Key for Push Notifications (FCM V1)"** → dosyayı seç. (Submit key'inden **ayrı** bir credential'dır; aynı service account gerekli rollerle kullanılabilir ama Expo ayrı yönetir.)
4. Managed workflow'da `google-services.json` gerekmez — EAS credential'ı üzerinden çözülür. (Bare/yerel build isteniyorsa `google-services.json` `app.config.ts` `android.googleServicesFile` ile bağlanır; cloud managed akışında gerekmez.)
5. Doğrulama: internal test build'i gerçek cihaza kur → worker bir bildirim üretsin (kart atama vb.) → cihaza push düşmeli. Düşmezse `expo-notifications` token log'u + EAS FCM credential + worker push log'u (`push-sweeper`) sırayla kontrol.

### 12.17.4 App Links (`assetlinks.json`)

`app.config.ts` `android.intentFilters` `autoVerify: true` → Android, `https://pusulaportal.com` linklerini uygulamada açmadan önce **Digital Asset Links** doğrular. iOS AASA'nın ([§12.14](#1214-mobil-ios-yayını-eas-build--app-store--faz-7o) Adım 3) Android karşılığı:

- Dosya: `https://pusulaportal.com/.well-known/assetlinks.json` (web'de route handler — AASA ile aynı desen, `apps/web/src/app/.well-known/`).
- İçerik: paket `com.pusula.app` + **App Signing anahtarının SHA-256 fingerprint'i**. Fingerprint kaynağı: Play Console → **Setup → App signing → App signing key certificate → SHA-256**. (EAS App Signing kullanıyorsa Google'ın imzaladığı anahtarın SHA-256'sı — upload key'inki değil.)
- Bu yüzden Adım 5 (ilk submit → App Signing anahtarı oluşur) **öncesinde** üretilemez. Fingerprint netleşince web'e `assetlinks.json` route'u eklenir + deploy edilir.

### 12.17.5 İlerleme

| # | Adım | Durum |
| - | ---- | ----- |
| 0 | Play Console bireysel hesap aktif | ✅ 2026-07-06 |
| 0 | `eas.json` `submit.production.android` (track: internal) + gitignore | ✅ bu tur |
| 1 | Play Console → Create app "Pusula" | ⬜ |
| 2 | Service account + JSON key (submit) | ⬜ |
| 3 | Production AAB build (`eas build -p android`) | ✅ 2026-07-06 (vc 2 **x86_64-only bug** → `ORG_GRADLE_PROJECT` env fix → **vc 4 tüm ABI**, keystore `e55Rw3hPQv`) |
| 4 | FCM V1 credential (push) | ⬜ |
| 5 | `eas submit` → internal testing | ✅ 2026-07-06 (COMPLETED, vc 4, `pusula-eas-submit` SA) |
| 6 | Internal test smoke (login/board/drag/realtime/push/deep link) | ✅ 2026-07-06 (Redmi 2312DRA50G arm64 — kuruldu, açıldı, sorunsuz) |
| 7 | `assetlinks.json` (App Signing SHA-256) → web deploy | ⬜ |
| 8 | Store listing + Data Safety + Content rating + Target audience | ⬜ |
| 9 | Closed testing (14 gün / 20 kişi — bireysel hesap şartı) | ⬜ |
| 10 | Production review + yayın | ⬜ |

### 12.17.6 Data Safety formu (taslak)

Play Console "Data safety" bölümü (Apple "App Privacy" karşılığı). Pusula **kullanıcı izleme yapmaz**, üçüncü-taraf reklam SDK'sı içermez. Metin asset'leri iOS ile ortak — [§12.14.5](#12145-app-store-metin-assetleri-taslak) (ad/alt başlık/açıklama TR+EN aynen kullanılır).

| Veri tipi (Play kategorisi) | Pusula karşılığı | Toplanıyor | Paylaşılıyor | Amaç |
| --------------------------- | ---------------- | ---------- | ------------ | ---- |
| Personal info — E-posta adresi | Better Auth hesabı | Evet | Hayır | App functionality, Account management |
| Personal info — Ad | Kullanıcı profili | Evet | Hayır | App functionality |
| Photos and videos | Kart eki (kamera/galeri) | Evet | Hayır | App functionality |
| App activity — diğer kullanıcı içeriği | Kart/liste/yorum/kontrol listesi | Evet | Hayır | App functionality |
| App info & performance — Crash logs | Sentry çökme/performans | Evet | Hayır | App functionality, Analytics |

Notlar:

- **Encryption in transit:** Evet (HTTPS/TLS). **Kullanıcı verisini silme talebi:** hesap silme akışı üzerinden.
- Push token bildirim altyapısının parçası — ayrı "data type" değil.
- Konum, kişi rehberi, sağlık, finans, reklam verisi **toplanmaz**.

---

## İlgili belgeler

- Deployment kararı + mimari özet: [`10-platform.md`](10-platform.md) §10.3, [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) (ADR-lite 2026-05-12).
- Backend HTTP kabuğu (CORS, healthcheck, Socket.IO mount): [`03-backend.md`](03-backend.md).
- Worker / outbox / kuyruk: [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md).
- Veri katmanı / migration disiplini: [`04-veri-katmani.md`](04-veri-katmani.md).
- Object storage / attachment: [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md).
- Dış linkler (Dokploy, Traefik): [`11-referanslar.md`](11-referanslar.md).
- İş kaydı: `docs/process/05-is-kayit-defteri.md` ([DEM-59](https://linear.app/demirkol/issue/DEM-59) — karar + runbook; [DEM-60](https://linear.app/demirkol/issue/DEM-60) — gerçek `compose.prod.yml`/`Dockerfile`'lar).
