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
updated: 2026-05-16
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
- Domain(ler) hazır ve A kaydı VDS IP'sine bakıyor: ör. `app.<domain>` → web, `api.<domain>` → api.
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
      SENTRY_DSN: ${SENTRY_DSN}
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
      SENTRY_DSN: ${SENTRY_DSN}
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
    environment:
      NODE_ENV: production
      PORT: 3000
    depends_on:
      api: { condition: service_started }
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.pusula-web.rule=Host(`app.${ROOT_DOMAIN}`)'
      - 'traefik.http.routers.pusula-web.entrypoints=websecure'
      - 'traefik.http.routers.pusula-web.tls.certresolver=letsencrypt'
      - 'traefik.http.services.pusula-web.loadbalancer.server.port=3000'

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

1. Dokploy panel → **New Project** → ad: `pusula-v2`.
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
| `APP_URL`                                             | `https://app.${ROOT_DOMAIN}`                                                                                 |
| `API_URL`                                             | `https://api.${ROOT_DOMAIN}`                                                                                 |
| `NEXT_PUBLIC_API_URL`                                 | `https://api.${ROOT_DOMAIN}` — **build arg** (web image'ına inline edilir)                                   |
| `S3_ENDPOINT`                                         | `http://minio:9000` (app'ler internal kullanır)                                                              |
| `S3_PUBLIC_URL`                                       | Avatarların tarayıcıya açık MinIO origin'i (Traefik subdomain, ör. `https://s3.${ROOT_DOMAIN}`) — DEM-160; `S3_ENDPOINT` internal olduğu için ayrı |
| `S3_REGION`                                           | `us-east-1` (MinIO için fark etmez)                                                                          |
| `S3_BUCKET`                                           | `pusula`                                                                                                     |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`           | MinIO root kimliği — güçlü, dev `minioadmin`'den farklı                                                      |
| `RESEND_API_KEY`                                      | Resend prod API key                                                                                          |
| `EMAIL_FROM`                                          | `Pusula <no-reply@${ROOT_DOMAIN}>` (gönderen domain Resend'de doğrulanmış olmalı)                            |
| `SENTRY_DSN`                                          | Sentry prod DSN (opsiyonel)                                                                                  |
| `MEILISEARCH_URL` / `MEILISEARCH_API_KEY`             | ileri faz — şimdilik boş                                                                                     |

Kurallar: secret'lar yalnızca server/worker tarafında; `NEXT_PUBLIC_` prefix'i **bilerek client'a açılan**
değerlerde. `.env` dosyaları git'e girmez — bu değerler Dokploy'da yaşar (ve bir parola yöneticisinde yedeklenir).

---

## 12.6 Aşama 3 — Domain + TLS

İki yol var, biri yeter:

- **(A) Compose içinde Traefik label'ları** (§12.2.3'teki gibi) — `Host()` kuralı + `certresolver=letsencrypt`.
- **(B) Dokploy UI "Domains" sekmesi** — compose servisindeki ilgili container'a (`web` → 3000, `api` → 3001)
  domain ata, "HTTPS / Let's Encrypt" işaretle.

Her iki yolda da DNS A kayıtları VDS IP'sine bakmalı: `app.${ROOT_DOMAIN}` → web, `api.${ROOT_DOMAIN}` → api.
Sertifika ilk istekte üretilir; DNS yayılımı tamamlanmadan deploy edersen Let's Encrypt başarısız olur,
DNS oturunca redeploy. **CORS:** Hono `apps/api` `APP_URL`'i allowed origin olarak okur — `APP_URL` doğru olmalı
(→ [`03-backend.md`](03-backend.md)).

---

## 12.7 Aşama 4 — İlk deploy + migration + MinIO bucket

1. Dokploy compose servisinde **Deploy**'a bas. Build logunu izle (web + api/worker image'ları build edilir).
2. Sıra: `postgres` healthy → `migrate` koşar ve `service_completed_successfully` olur → `api`/`worker` başlar → `web` başlar.
   `migrate` fail ederse logdan bak (`DATABASE_URL` yanlış / şema sorunu); düzelt, redeploy.
3. **MinIO bucket'ı oluştur + avatar prefix'ini aç** (bir kerelik): MinIO konsoluna gir (geçici port-forward veya konsol subdomain'i)
   ya da `mc` ile:
   `mc alias set local http://<vds>:... <key> <secret> && mc mb local/pusula && mc anonymous set download local/pusula/avatars`.
   Son komut `avatars/` prefix'ini anonim okumaya açar (DEM-160 — yüklenen avatarlar kalıcı public URL olarak çözülür); bucket'ın geri kalanı (kart ekleri) private kalır. (İleride init container'a alınabilir.)
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

## İlgili belgeler

- Deployment kararı + mimari özet: [`10-platform.md`](10-platform.md) §10.3, [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) (ADR-lite 2026-05-12).
- Backend HTTP kabuğu (CORS, healthcheck, Socket.IO mount): [`03-backend.md`](03-backend.md).
- Worker / outbox / kuyruk: [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md).
- Veri katmanı / migration disiplini: [`04-veri-katmani.md`](04-veri-katmani.md).
- Object storage / attachment: [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md).
- Dış linkler (Dokploy, Traefik): [`11-referanslar.md`](11-referanslar.md).
- İş kaydı: `docs/process/05-is-kayit-defteri.md` ([DEM-59](https://linear.app/demirkol/issue/DEM-59) — karar + runbook; [DEM-60](https://linear.app/demirkol/issue/DEM-60) — gerçek `compose.prod.yml`/`Dockerfile`'lar).
