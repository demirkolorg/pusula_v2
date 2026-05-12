# 02 — Teknoloji Kararları

> Eksen: **tasarım / teknik**. Bu dosya **kararların kaydıdır** — yerleşik kabul edilir;
> kullanıcı açıkça istemedikçe yeniden açma. Karar değişirse aşağıdaki "Karar kaydı"na tarihli satır ekle.

## Sabit kararlar

| Konu | Karar |
| --- | --- |
| Paket yöneticisi | **pnpm** (yalnızca; npm/yarn/bun/npx yok) |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js App Router |
| Backend HTTP | Hono |
| API sözleşmesi | tRPC (tek ana sözleşme; Hono RPC ile paralel API yok) |
| Client cache | TanStack Query |
| Mobil | Expo + Expo Router |
| Database | PostgreSQL |
| ORM | Drizzle (`casing: 'snake_case'`) |
| Queue | BullMQ + Redis |
| Realtime | Socket.IO + Redis adapter; DB/outbox source of truth |
| Push | Expo Notifications |
| Drag-drop | Atlassian Pragmatic Drag and Drop (yalnızca web) |
| Auth | Better Auth |
| Web UI sistemi | shadcn/ui (yalnızca); başka web component library yok |
| İkonlar | lucide-react |
| Styling | Tailwind CSS v4 |
| Deployment | Self-hosted Dokploy |
| Object storage | Self-hosted MinIO (S3 uyumlu SDK üzerinden) |
| Email | Resend |
| Search | MVP: PostgreSQL full-text search; ileri aşama: Meilisearch |
| Observability | Sentry + OpenTelemetry + structured logs |
| Test | Vitest, Playwright, React Testing Library |
| Billing/subscription | Yok |
| TypeScript | strict mode |
| Node | `>=22` |

## Karar kaydı (ADR-lite)

Yeni teknoloji kararı / değişiklik geldiğinde buraya **tarih — karar — gerekçe** satırı ekle.

- **2026-05-12** — Belgeler tasarım / iş kuralı / süreç eksenlerine ayrıldı (`docs/architecture/`, `docs/domain/`, `docs/process/`). Gerekçe: tek dosyada karışık kuralların yönetilebilirliği düşük; eksen ayrımı "neyi nerede ararım?" sorusunu netleştirir.
- **2026-05-12** — Paket yöneticisi olarak **pnpm** netleştirildi (CLAUDE.md'deki "bun" ifadesi gerçek scaffold ile çelişiyordu: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json` `packageManager: pnpm@11.1.0`, README corepack pnpm). Gerekçe: kod gerçeği pnpm; tek kaynak.
- _(Önceki temel kararlar — Next.js / Hono / tRPC / Drizzle / Socket.IO / Better Auth / shadcn / Dokploy / MinIO / Resend / Pragmatic DnD — v2 başlangıç kararlarıdır; ayrıntılı gerekçeler ilgili `docs/architecture/` dosyalarında.)_

## Açık noktalar (henüz karara bağlanmadı)

- Offline çalışma ne kadar güçlü olacak?
- Mobil drag-drop ileriki fazda araştırılacak mı (ilk sürümde "move to list" picker tercih ediliyor)?
- Meilisearch'e geçiş hangi kullanım metriğinde tetiklenecek?
- Realtime için tek API instance ile mi başlanacak, yoksa ilk günden Redis adapter + sticky session testleri mi yapılacak?
