---
title: "02 — Teknoloji Kararları"
description: "Sabit teknoloji kararları, ADR-lite kayıtları ve açık karar noktaları."
aliases:
  - "Teknoloji Kararları"
  - "ADR Lite"
tags:
  - "pusula"
  - "architecture/decisions"
  - "adr"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
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
| Deployment | Self-hosted Dokploy — **"Docker Compose" servis tipi** (repo'daki `compose.prod.yml` tek ünite; Traefik + Let's Encrypt + git-push-to-deploy + build logu Dokploy'da; servisleri tek tek "Application" olarak tanımlama yok). Runbook → [`12-deployment-runbook.md`](12-deployment-runbook.md) |
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
- **2026-05-12** — Faz 2.5 ([DEM-48](https://linear.app/demirkol/issue/DEM-48)) "önce belge" kararları (kullanıcı onayıyla — DEM-49): (1) **Kart detay görünümü = modal + `?card=<id>` query param** (shadcn `Dialog`, board arkada; Next.js intercepting/parallel route yok — `useSearchParams` + shallow routing). Gerekçe: Trello hissi + paylaşılabilir derin link, ama intercepting route karmaşıklığı olmadan. (2) **Karta üye (assignee/watcher) adayı** o board'a effective erişimi olan kullanıcı olmalı (`effectiveBoardRole !== null` — explicit board üyesi veya workspace owner/admin). Gerekçe: "atanmış ama göremeyen" kullanıcıyı engeller. (3) **`board.members.add` workspace-dışı kişiyi de davet edebilir** → yeni `board_invitations` tablosu (`workspace_invitations` ile aynı disiplin: token, süreli, tek kullanımlık), e-posta + outbox; kabulde davetli workspace `guest`'i + board üyesi olur. Gerekçe: Trello "board'a misafir ekle" akışı; workspace `guest` rolü tam bu senaryo için var. Detay → `03-backend.md` (Faz 2.5 procedure'leri), `04-veri-katmani.md` (Faz 2.5 kapsamı + `board_invitations`), `08-web-ve-mobil.md` §8.1.5–8.1.6, `domain/01-urun-modeli.md` (invariant 12–13), `domain/02-yetkilendirme-kurallari.md`.
- **2026-05-12** — DEM-55 (profil / hesap ayarları ekranı, `bosluk-tara` G5) "önce belge" kararları (kullanıcı onayıyla): (a) **Avatar = basit URL** — şimdilik yükleme yok; `users.image`'a doğrudan URL girilir (ileride Faz 8 MinIO attachment altyapısına bağlanabilir). Gerekçe: profil ekranını attachment altyapısını beklemeden teslim etmek. (b) **Hesap silmede son owner ise → engelle** — kullanıcı herhangi bir workspace'in `owner`'ıysa hesap silme engellenir (ownership transfer henüz yok; `workspaces.ownerId` `onDelete: 'restrict'` zaten DB'de reddeder, Better Auth `beforeDelete` hook'u açıklayıcı hata döndürür). Domain kuralı `@pusula/domain` `canDeleteOwnAccount`. (c) Bunlar için **yeni tRPC `user.*` router'ı eklenmez** — ad/avatar/parola/silme doğrudan Better Auth client uçlarına (`updateUser`/`changePassword`/`deleteUser`) gider; sunucu tarafı yalnızca `user.deleteUser.enabled` + `beforeDelete` hook. Gerekçe: Better Auth bu uçları zaten sağlıyor + `currentPassword` doğrulamasını yapıyor; ince bir tRPC katmanı değer katmaz, user tablosunun sahipliği tek yerde kalır. Detay → `07-auth.md` (Profil & hesap yönetimi), `08-web-ve-mobil.md` §8.1.7, `domain/01-urun-modeli.md` (invariant 14), `domain/02-yetkilendirme-kurallari.md` (Hesap (User) — öz-yönetim).
- **2026-05-12** — Deployment: Dokploy **"Docker Compose" servis tipi** kararı ([DEM-59](https://linear.app/demirkol/issue/DEM-59), kullanıcı önerisiyle). VDS'te Dokploy'da her servisi (web/api/worker/postgres/redis/minio) ayrı "Application" olarak tanımlamak yerine **tek bir "Docker Compose" servisi** kullanılır: GitHub repo + branch + repo kökündeki `compose.prod.yml` → stack tek ünite olarak deploy edilir. Gerekçe: önceki sürümde servis-servis kurulum çok zahmetliydi; compose dosyası git'te → tek-dosya reprodüksiyon + IaC, Dokploy'dan da Traefik + Let's Encrypt TLS, git-push-to-deploy webhook'u, build logu, rollback alınır ("hem Dokploy hem Docker"in pratik karşılığı). Detay → `10-platform.md` §10.3 + yeni `12-deployment-runbook.md` (VDS temizliği → ilk deploy → smoke test → erişimi açma → rollback → yedekleme). Takip işi: gerçek `compose.prod.yml` + `apps/{web,api,worker}/Dockerfile` (multi-stage `turbo prune --docker`) + migration one-off job → [DEM-60](https://linear.app/demirkol/issue/DEM-60) (v2 yazımı ilerleyince).
- **2026-05-12** — **Faz 2.7 ([DEM-58](https://linear.app/demirkol/issue/DEM-58)) açıldı — UI tasarım dili & board/kart cilalama** (Faz 2.5 ↔ Faz 3 arası; sıra: Faz 2.7 → Faz 3). Mevcut web UI fonksiyonel ama görsel olarak ham; bu faz tasarım dili (yeni renk paleti + token sistemi → yeni `09-ui-tasarim-dili.md`) + board/kolon/kart anatomisi (renkli şerit, metadata satırı, tamamla toggle) + kart detay modalı yeniden yapı (iki-kolon + kapak-renkli başlık + sağ panel) + ortak bileşenler (Avatar/SectionHeader/Progress/EmptyState/MetaChip). Referans = **karma** (eski Pusula projesi `D:\projects\pusula` UI'ı layout/anatomi/token sistemi baz + Trello iyileştirmeleri; eski projenin kodu birebir kopyalanmaz — `@base-ui/react` getirmemek için shadcn/Radix üzerine yeniden kurulur). **Rich text editör kararı (kullanıcı onayı):** kart açıklaması + yorumlar **Tiptap** ile (headless editör — component library değil; "yalnızca shadcn/ui + Tailwind + lucide" kuralının istisnası değil, ek; yeni bağımlılık `@tiptap/*`). **Palet kararı (kullanıcı onayı):** eski projenin paleti aynen taşınmaz — Faz 2.7.0 önce-belgesinde 2-3 palet/yoğunluk/font seçeneği hazırlanır → kullanıcı seçer. İki-ajan analizi (eski Pusula UI + mevcut `pusula_v2` web UI envanteri) + ekran görüntüleri + Trello karşılaştırması sonrası alındı. Detay → `09-ui-tasarim-dili.md` (Faz 2.7.0'da), `08-web-ve-mobil.md`, `process/02-mvp-faz-plani.md` (Faz 2.7 alt işleri).
- _(Önceki temel kararlar — Next.js / Hono / tRPC / Drizzle / Socket.IO / Better Auth / shadcn / Dokploy / MinIO / Resend / Pragmatic DnD — v2 başlangıç kararlarıdır; ayrıntılı gerekçeler ilgili `docs/architecture/` dosyalarında.)_

## Açık noktalar (henüz karara bağlanmadı)

- Offline çalışma ne kadar güçlü olacak?
- Mobil drag-drop ileriki fazda araştırılacak mı (ilk sürümde "move to list" picker tercih ediliyor)?
- Meilisearch'e geçiş hangi kullanım metriğinde tetiklenecek?
- Realtime için tek API instance ile mi başlanacak, yoksa ilk günden Redis adapter + sticky session testleri mi yapılacak?
