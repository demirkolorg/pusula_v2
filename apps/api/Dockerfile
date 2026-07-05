# syntax=docker/dockerfile:1
# Production image for @pusula/api-server AND @pusula/worker (DEM-60).
# Both run from this one image with a different `command:` (CLAUDE.md §3):
#   api    → node apps/api/dist/index.js   (default CMD)
#   worker → node apps/worker/dist/index.js (compose `command:` override)
#   migrate→ pnpm db:migrate                (compose `command:` override)
# Build context = repo root. `turbo prune --docker` keeps only the needed
# workspaces. db migrate tooling (tsx / drizzle-kit) is intentionally kept in
# the final image so the `migrate` service can run `pnpm db:migrate`.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# --- prune: extract only @pusula/api-server + @pusula/worker + their deps ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @pusula/api-server @pusula/worker --docker

# --- builder: install + build the pruned subset ---
FROM base AS builder
# pnpm, her `pnpm run <script>` öncesi verify-deps-before-run ile node_modules'u
# lockfile'a karşı doğrular ve gerekirse frozen install tetikler. Aşağıdaki turbo
# build iki paketi (@pusula/api-server + @pusula/worker) paralel çalıştırınca iki
# eşzamanlı install AYNI node_modules'ta hoisting yapıp çakışır →
# "ENOENT: unlink '/app/node_modules/.pnpm/node_modules/debug'" (worker build fail,
# deploy patladı — 2026-07-05). Deps zaten aşağıda `pnpm install --frozen-lockfile`
# ile kuruluyor; build öncesi yeniden doğrulama gereksiz. (pnpm .npmrc anahtarını
# npm_config_* env'den okur; .npmrc dosyası güvenlik kuralıyla yasak olduğundan env.)
ENV npm_config_verify_deps_before_run=false
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# --concurrency=1: env var'a ek ikinci katman — build'i serileştirerek olası
# paralel install yarışını tümden eler (iki küçük tsup build; hız kaybı ihmal edilebilir).
RUN pnpm dlx turbo@2 run build --filter=@pusula/api-server --filter=@pusula/worker --concurrency=1

# --- runner: non-root, ships the built monorepo subset ---
FROM base AS runner
ENV NODE_ENV=production

# Faz 13I (DEM-265) — Chromium runtime for Puppeteer PDF render worker.
# Shared image: only `worker` cmd uses it (`api` cmd ignores), but installing
# in the shared base is simpler than building two images. ~150 MB layer cost;
# alternatives (split images, sidecar) add operational complexity without
# meaningful savings. Standard Alpine pattern — `apk add chromium` is the
# Puppeteer-recommended Docker route (not `@sparticuz/chromium` which targets
# Lambda glibc; Alpine is musl). `PUPPETEER_EXECUTABLE_PATH` is read by
# `apps/worker/src/jobs/report-render.ts` via `apps/worker/src/env.ts`.
# See `docs/architecture/16-raporlama-mimarisi.md` §16.8.
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app .
USER app
EXPOSE 3001
# api default; `worker` and `migrate` services override this in compose.prod.yml.
CMD ["node", "apps/api/dist/index.js"]
