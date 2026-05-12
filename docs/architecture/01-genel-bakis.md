# 01 — Genel Bakış

> Eksen: **tasarım / teknik**. Ürün modeli ve domain kuralları için [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md).

## Ürün hedefi (özet)

Pusula; kullanıcıların çalışma alanları (workspace), panolar (board), listeler (list)
ve kartlar (card) üzerinden görev yönetimi yaptığı, Trello benzeri bir üründür. Web,
mobil ve backend ayrı katmanlardır ve **aynı API sözleşmesini** (tRPC) paylaşır.

Bu, `D:\projects\pusula` projesinin **v2** yazımıdır. Yeniden yazma nedenleri:
(1) mobilin ihtiyaç duyduğu API katmanı eski sürümde Next.js içine gömülüydü — artık
ayrı `apps/api`; (2) teknoloji seçimleri yenilendi (Prisma → Drizzle). Eski web app
UI/UX ve domain mantığı için geçerli bir referanstır; stack seçimleri için **değil**.

## Kalite hedefleri (cross-cutting)

- Drag-drop hissi çok akıcı; kart/liste taşıma optimistic UI ile anında görünür.
- Mobil ve web aynı API sözleşmesini kullanır.
- Bildirim sistemi ürünün merkezindedir.
- Realtime senkronizasyon gecikmesi düşüktür; realtime kalıcı kaynak değildir.
- Backend type-safe, test edilebilir, strict transaction disiplinli.

## Monorepo yapısı

`apps/*` ve `packages/*` ile **pnpm workspaces + Turborepo** üzerinde koşar. Node `>=22`,
pnpm `11.x` (corepack). Paket yöneticisi olarak **yalnızca `pnpm`** kullanılır.

```txt
apps/
  web/        Next.js App Router web uygulaması              → @pusula/web
  api/        Hono HTTP server + tRPC + Better Auth + Socket.IO → @pusula/api-server
  worker/     BullMQ queue / outbox / scheduled job tüketicileri → @pusula/worker
  mobile/     (ileri faz — henüz yok)                        → (yok)

packages/
  api/        tRPC router, procedure, context                → @pusula/api
  db/         Drizzle schema, migration, transaction helper  → @pusula/db
  domain/     Zod schema, domain/event tipleri, roller, permission helper, position → @pusula/domain
  ui/         shadcn/ui tabanlı web component'leri + design token → @pusula/ui
  config/     ortak tsconfig + eslint config                 → @pusula/config
```

> Dikkat: tRPC paketi `@pusula/api` (`packages/api`); Hono server app `@pusula/api-server` (`apps/api`).
> Ana API Next.js'in **dışında**dır. Next.js route handler'ları yalnızca web'e özel BFF / callback için;
> paylaşılan web/mobil API kaynağı `apps/api` + `packages/api`.

Katman sorumlulukları için kök [`../../CLAUDE.md`](../../CLAUDE.md) §3 "Katmanlar" tablosuna bak.
Monorepo zorunluluğunun nedeni: web ve mobil aynı domain tiplerini, aynı API contract'ını ve aynı
validasyon şemalarını paylaşır. TypeScript strict mode + project references + ortak lint/format.

## Teknoloji özeti

| Katman | Seçim | Sebep (özet) |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Hızlı workspace yönetimi, cache, task orchestration |
| Web | Next.js App Router | Modern React, SSR/RSC, route-level optimizasyon |
| Backend HTTP | Hono | Hafif, hızlı, Web Standard tabanlı HTTP katmanı |
| API sözleşmesi | tRPC | Web + mobil arası type-safe API |
| Client cache | TanStack Query | Optimistic UI, cache invalidation, mutation lifecycle |
| Mobil | Expo + Expo Router | RN geliştirme hızı, OTA + push entegrasyonu |
| Database | PostgreSQL | Transaction, relational model, index, JSONB |
| ORM | Drizzle | Type-safe SQL, migration kontrolü, transaction netliği |
| Queue | BullMQ + Redis | Bildirim, outbox, retry, scheduled job |
| Realtime | Socket.IO + Redis adapter | Board event, presence, room modeli, yatay ölçek |
| Push | Expo Notifications | iOS/Android push token + gönderim |
| Drag-drop | Atlassian Pragmatic Drag and Drop | Trello/Jira hissi, performans odaklı nested taşıma |
| Auth | Better Auth | Self-hosted, TypeScript odaklı kimlik yönetimi |
| Web UI | shadcn/ui (tek standart) + Tailwind + lucide-react | Tek web component sistemi |
| Deployment | Self-hosted Dokploy | Docker/Traefik tabanlı self-hosted yayın |
| Object storage | Self-hosted MinIO (S3 uyumlu SDK) | S3 uyumlu attachment depolama |
| Email | Resend | Transactional email + digest |
| Search | MVP: PostgreSQL FTS; ileri: Meilisearch | Önce basitlik, büyüyünce typo-tolerant arama |
| Observability | Sentry + OpenTelemetry + structured logs | Hata, performans, distributed trace |
| Test | Vitest, Playwright, React Testing Library | Unit, integration, e2e |
| Billing | Yok | — |
