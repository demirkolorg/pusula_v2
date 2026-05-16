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
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm dlx turbo@2 run build --filter=@pusula/api-server --filter=@pusula/worker

# --- runner: non-root, ships the built monorepo subset ---
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app .
USER app
EXPOSE 3001
# api default; `worker` and `migrate` services override this in compose.prod.yml.
CMD ["node", "apps/api/dist/index.js"]
