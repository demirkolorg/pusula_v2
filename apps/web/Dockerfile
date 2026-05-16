# syntax=docker/dockerfile:1
# Production image for @pusula/web (DEM-60) — Next.js standalone output.
# `next.config.ts` sets `output: 'standalone'` + `outputFileTracingRoot` (repo
# root) so the build emits a self-contained `apps/web/server.js`.
# `NEXT_PUBLIC_API_URL` is inlined at BUILD time → passed as a build arg.
# Build context = repo root.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# --- prune: extract only @pusula/web + its deps ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @pusula/web --docker

# --- builder: install + build (NEXT_PUBLIC_API_URL inlined here) ---
FROM base AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm dlx turbo@2 run build --filter=@pusula/web

# --- runner: non-root, ships only the standalone bundle ---
FROM base AS runner
ENV NODE_ENV=production
# Next standalone server binds to HOSTNAME; must be 0.0.0.0 inside a container.
ENV HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# standalone bundle (server.js + minimal node_modules, repo-root tracing)
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
