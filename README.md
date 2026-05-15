---
title: 'Pusula'
description: 'Pusula v2 monorepo başlangıç, çalışma ve yol haritası notu.'
aliases:
  - 'Pusula Ana Sayfa'
  - 'Pusula v2'
tags:
  - 'pusula'
  - 'project/index'
  - 'obsidian/vault'
type: 'project-index'
axis: 'root'
status: 'active'
related:
  - '[[docs/README|Pusula Belgeleri]]'
  - '[[CLAUDE|Çalışma Protokolü]]'
updated: 2026-05-12
---

# Pusula

Trello benzeri görev yönetim ürünü — monorepo (pnpm + Turborepo).

> Bu, `D:\projects\pusula` projesinin 2. versiyonudur. Sıfırdan yazılmasının iki
> nedeni: (1) mobil uygulamanın ihtiyaç duyduğu API katmanı eski sürümde Next.js
> içine gömülüydü; bu sürümde **web / mobil / API ayrı katmanlar** ve paylaşılan
> paketler. (2) Teknoloji seçimleri yenilendi (ör. Prisma → Drizzle).
>
> Belgeler (tasarım / iş kuralı / süreç ekseninde ayrı): [`docs/`](docs/README.md) —
> [`docs/architecture/`](docs/architecture/README.md) · [`docs/domain/`](docs/domain/README.md) · [`docs/process/`](docs/process/README.md).
> Çalışma protokolü: [`CLAUDE.md`](CLAUDE.md) · Implementasyon sözleşmesi (Claude Code skill `kontrol`):
> [`.claude/skills/kontrol/SKILL.md`](.claude/skills/kontrol/SKILL.md).

## Obsidian kasası

Bu proje kökü Obsidian kasası olarak açılabilir. Başlangıç için [`docs/README.md`](docs/README.md)
ana harita notunu kullan; teknik mimari, domain kuralları ve süreç belgeleri alt MOC dosyalarından
gezilir. Tüm proje Markdown notları Obsidian Properties için frontmatter, hızlı açma için `aliases`
ve graph/tag filtreleri için `tags` taşır.

Yeni veya değişen dokümanlarda yazım standardı: [`docs/process/06-obsidian-dokumantasyon-kurallari.md`](docs/process/06-obsidian-dokumantasyon-kurallari.md).

## Yapı

```
apps/
  web/        Next.js App Router web uygulaması
  api/        Hono HTTP server + tRPC endpoint + Better Auth
  worker/     BullMQ queue / outbox / scheduled job tüketicileri
  mobile/     (ileri faz — şimdilik yok)

packages/
  api/        tRPC router, procedure, context
  db/         Drizzle schema, migration, transaction helper'ları
  domain/     Zod schema, domain tipleri, roller, permission helper'ları, position
  ui/         shadcn/ui tabanlı web component'leri
  config/     ortak tsconfig + eslint
```

Ana API tek bir kaynak: `apps/api` (`@pusula/api` router'larını mount eder). Next.js
route handler'ları yalnızca web'e özel BFF/callback için kullanılır.

## Gereksinimler

- Node `>=22` (`.nvmrc` → 22)
- pnpm `11.x` (corepack: `corepack enable && corepack prepare pnpm@11.1.0 --activate`)
- Docker (PostgreSQL + Redis + MinIO için)

## Başlangıç

```bash
# 1. Bağımlılıklar
pnpm install

# 2. Ortam değişkenleri
cp env.example .env
#   AUTH_SECRET üret:  openssl rand -base64 32   (Windows: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
#   (opsiyonel) cp apps/web/env.example apps/web/.env.local

# 3. Altyapıyı ayağa kaldır (Postgres, Redis, MinIO)
pnpm infra:up

# 4. Veritabanı şemasını uygula  (CI/yerel: migration üret + uygula)
pnpm db:generate && pnpm db:migrate
#   ve örnek veri:
pnpm db:seed

# 5. Geliştirme (web + api + worker birlikte)
pnpm dev
```

Portlar: web → `http://localhost:3000`, api → `http://localhost:3001`,
Postgres → `5436`, Redis → `6380`, MinIO → `9100` (S3) / `9101` (konsol).
Compose proje adı `pusula_v2` ve bu portlar, v1 projesiyle (`D:\projects\pusula` — Postgres `5435`, MinIO `9000/9001`, proje adı `pusula`) çakışmasın diye seçildi.

> Not: `db:push` (drizzle-kit) etkileşimli onay ister; otomasyon/CI için `db:generate` + `db:migrate` kullanın.

## Komutlar

| Komut                          | Açıklama                                             |
| ------------------------------ | ---------------------------------------------------- |
| `pnpm dev`                     | Tüm uygulamaları geliştirme modunda çalıştır         |
| `pnpm build`                   | Tüm workspace'leri derle                             |
| `pnpm typecheck`               | Tip kontrolü (tüm workspace)                         |
| `pnpm lint`                    | ESLint (tüm workspace)                               |
| `pnpm test`                    | Testler (Vitest)                                     |
| `pnpm format`                  | Prettier ile biçimlendir                             |
| `pnpm db:push`                 | Drizzle şemasını veritabanına uygula (migration'sız) |
| `pnpm db:generate`             | Migration SQL üret                                   |
| `pnpm db:migrate`              | Migration'ları uygula                                |
| `pnpm db:studio`               | Drizzle Studio                                       |
| `pnpm db:seed`                 | Seed verisi                                          |
| `pnpm infra:up` / `infra:down` | Docker altyapısını başlat / durdur                   |

## Yol haritası (özet)

Detay: [`docs/process/02-mvp-faz-plani.md`](docs/process/02-mvp-faz-plani.md). **Faz 0 (temel altyapı)**
tamam: monorepo, paketler, web/api/worker uygulamaları, Drizzle şema iskeleti, Better Auth
bağlantısı, docker-compose. Sıradaki adımlar: Faz 1 (auth + workspace), Faz 2 (board/list/card
CRUD), Faz 3 (drag-drop) ...
