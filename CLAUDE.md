# Pusula — Çalışma Protokolü (Claude Code)

Sen Pusula için çalışan otonom bir Full-Stack Mimar ve proje yöneticisisin. Hedef:
web, mobil ve backend katmanları olan, akıcı sürükle-bırak deneyimi sunan,
optimistic UI ve bildirim mantığı güçlü bir Trello alternatifi. Bu dosya **ince bir
yönlendirici**dir; ayrıntılı kurallar `docs/` altında, eksenlerine ve katmanlara göre ayrılmıştır.

## 0. Belge Mimarisi — tasarım / iş kuralı / süreç ayrımı

Pusula belgeleri üç eksende ayrılmıştır. Yeni bir kural eklerken **doğru eksene** yaz;
aynı dosyada tasarım + iş kuralı karıştırma.

| Eksen | "Sorduğu soru" | Nerede | Örnek |
| --- | --- | --- | --- |
| **Tasarım / teknik** (`docs/architecture/`) | _Nasıl inşa ediyoruz?_ | stack, monorepo, pattern, altyapı, transport, deployment | "Realtime için Socket.IO + Redis adapter" |
| **İş / domain** (`docs/domain/`) | _Ürün ne yapıyor, kim ne yapabilir?_ | domain modeli, invariant'lar, yetkilendirme, bildirim/sıralama/aktivite kuralları | "Bir kart aynı anda tek bir listeye aittir" |
| **Süreç** (`docs/process/`) | _Nasıl çalışıyoruz?_ | Linear iş akışı, otomatik senkron protokolü, iş kayıt defteri, MVP faz planı | "Geliştirmeye başlamadan Linear issue aç" |

Giriş noktaları: [`docs/README.md`](docs/README.md) · [`docs/architecture/README.md`](docs/architecture/README.md) · [`docs/domain/README.md`](docs/domain/README.md) · [`docs/process/README.md`](docs/process/README.md)
İmplementasyon sözleşmesi (Claude Code skill): [`.claude/skills/kontrol/SKILL.md`](.claude/skills/kontrol/SKILL.md)

## 1. Her görevde önce oku

Bir özellik / refactor / bug fix isteği geldiğinde, ilgili eksenleri oku ve **kararları yeniden açma** (kullanıcı açıkça istemedikçe):

- Stack / kod organizasyonu / pattern → `docs/architecture/`
- Domain modeli / yetki / bildirim / sıralama kuralı → `docs/domain/`
- Linear / faz → `docs/process/`

## 2. Vazgeçilmez kurallar (özet — gerekçeler `docs/`'ta)

1. **Paket yöneticisi & monorepo:** `pnpm` + Turborepo. Tüm script, install ve workspace komutları `pnpm` ile. (`npm` / `yarn` / `bun` / `npx` kullanma.) Node `>=22`.
2. **API sözleşmesi:** Ana sözleşme **tRPC**. Hono yalnızca HTTP kabuğu (CORS, request id, log, rate limit, auth context, healthcheck, metrics, webhook, tRPC + Better Auth mount). Hono RPC ile paralel ana API **oluşturma**.
3. **Veri & ORM:** PostgreSQL + Drizzle. Şema, migration ve transaction Drizzle ile; strict transaction disiplini. Drizzle instance `casing: 'snake_case'` — TS'te camelCase kolon anahtarı yaz, DB kolonları snake_case.
4. **Sıralama:** Liste/kart sırasında tam sayı `order` **yok**; LexoRank benzeri string (fractional) pozisyon — `@pusula/domain/position` helper'ları.
5. **Optimistic UI:** TanStack Query + tRPC. Collaborative her mutation `clientMutationId` taşır; drag sırasında backend mutation atılmaz, sadece `onDragEnd` sonrası — optimistic, rollback'li, idempotent.
6. **Realtime:** Socket.IO + Redis adapter. Realtime kalıcı kaynak **değil**, sadece taşıma katmanı. Source of truth PostgreSQL + outbox tabloları.
7. **Bildirim & outbox:** Push (Expo) / Email (Resend) **asla** request döngüsünde gönderilmez. Domain event'ler transaction içinde `notification_outbox`'a yazılır, worker işler.
8. **Web UI:** Yalnızca **shadcn/ui** + Tailwind CSS + lucide-react. Başka component library (MUI, Chakra, Ant, Mantine, Headless UI) yok. Radix yalnızca shadcn/ui parçası olarak. UI bileşenleri **hardcode metin içermez**, entity-bağımsız ve i18n uyumlu.
9. **Auth ≠ Authorization:** Kimlik doğrulama Better Auth. Workspace/board/card yetkilendirmesi auth'a gömülmez; her tRPC procedure içinde server-side kontrol edilir (`@pusula/domain/permissions`).
10. **Drag-drop:** Web tarafında yalnızca Atlassian Pragmatic Drag and Drop.
11. **Billing yok.** `apps/mobile` kullanıcı istemeden oluşturulmaz.

> Tam liste, gerekçeler ve "kaçınılması gerekenler": `docs/architecture/02-teknoloji-kararlari.md` ve `docs/architecture/README.md`.

## 3. Katmanlar — her app/package'ın sorumluluğu

Monorepo `apps/*` ve `packages/*` ile Turborepo üzerinde koşar. Bir kod parçası **doğru katmana** ait olmalı:

| Paket | Adı | BURAYA | BURAYA DEĞİL | İlgili belge |
| --- | --- | --- | --- | --- |
| `packages/domain` | `@pusula/domain` | Saf domain: Zod şema, rol/permission helper, position helper, domain/event tipleri — **framework-bağımsız** | DB erişimi, tRPC, React, env okuma | `docs/domain/*` |
| `packages/db` | `@pusula/db` | Drizzle schema (snake_case), migration, transaction helper, seed; Better Auth tabloları | İş mantığı, permission kontrolü, HTTP | `docs/architecture/04-veri-katmani.md` |
| `packages/api` | `@pusula/api` | tRPC router/procedure/context; `protectedProcedure` session garantiler; workspace/board/card permission enforcement (domain helper'larıyla) | Hono HTTP concerns, doğrudan şema değişikliği, Hono RPC | `docs/architecture/03-backend.md` + `docs/domain/02-yetkilendirme-kurallari.md` |
| `packages/ui` | `@pusula/ui` | shadcn/ui tabanlı web component'leri + design token (`theme.css`) | İş mantığı, veri çekme, ikinci UI library | `docs/architecture/08-web-ve-mobil.md` |
| `packages/config` | `@pusula/config` | Ortak tsconfig + eslint config | Runtime kod | — |
| `apps/api` | `@pusula/api-server` | Hono HTTP kabuğu: CORS, request id, log, rate limit, auth context, healthcheck, metrics, webhook, tRPC mount, Better Auth `/api/auth/*`, Socket.IO | Ana API mantığı (o `@pusula/api`'de), Hono RPC contract | `docs/architecture/03-backend.md`, `07-auth.md` |
| `apps/web` | `@pusula/web` | Next.js App Router; board ekranı (client-heavy), optimistic UI, realtime reconciliation, notification center; route handler yalnızca web-BFF/callback | Ana API, push/email gönderimi, başka UI library | `docs/architecture/05-board-mekanigi.md`, `08-web-ve-mobil.md` |
| `apps/worker` | `@pusula/worker` | BullMQ + Redis: notification outbox, realtime event publish, search index, due-date scheduler, position compaction, email/push teslimi | HTTP endpoint, request-path işler | `docs/architecture/06-bildirim-altyapisi.md`, `10-platform.md` |
| `apps/mobile` | — | (ileri faz — **henüz yok**) | Kullanıcı istemeden oluşturma | `docs/architecture/08-web-ve-mobil.md` |

Çekirdek invariant: bir kart aynı anda tek listeye, bir liste tek board'a aittir; kart, listesiyle aynı board'tadır; arşivli liste aktif kart taşıması almaz; permission her procedure'de server-side; activity + outbox + realtime event + domain mutasyonu mümkünse aynı transaction'da. Ayrıntı: `docs/domain/01-urun-modeli.md`.

## 4. Linear İş Akışı ve Otomatik Senkronizasyon

- Ayrıntılı protokol: `docs/process/04-otomatik-is-akisi-protokolu.md`.
- Repo içi takip aynası: `docs/process/05-is-kayit-defteri.md`.
- **Pre-Dev:** Geliştirmeye başlamadan Linear MCP ile isteğe uygun issue oluştur veya mevcut issue ile eşle — başlık kısa, açıklamaya teknik gereksinimleri yaz, durum "In Progress", bana ata. Hangi `docs/` dosyalarının etkilendiğini açıklamaya not düş ve aynı işi iş kayıt defterine yaz.
- **During-Dev:** Durum değişirse Linear issue ve `docs/process/05-is-kayit-defteri.md` aynı çalışma turunda aynı duruma çekilir. Yeni alt iş çıkarsa Linear'da checklist/linked issue ve docs tarafında kayıt açılır.
- **Post-Dev:** Kodlama bitince ilgili issue'ya değişiklik özeti, güncellenen `docs/` dosyaları ve test/verification sonucunu yorum olarak ekle. Onay bekliyorsa durumu "Review", onaylandıysa "Done" yap; iş kayıt defteri aynı durumu taşımalı.

Ayrıntı ve şablon: `docs/process/01-linear-is-akisi.md`. MVP faz planı: `docs/process/02-mvp-faz-plani.md` (Faz 0 tamam).

## 5. Belge ↔ kod ↔ Linear senkronizasyonu

`docs/` teknik/domain kararlarında "source of truth"tur; iş durumunda Linear operasyonel kaynak,
`docs/process/05-is-kayit-defteri.md` repo içi takip aynasıdır. Kod, belge ve Linear paralel tutulur.

- **Önce belge:** Yeni tRPC procedure, Drizzle şema değişikliği veya yeni teknoloji kararında **önce `docs/`'taki ilgili dosyayı** (doğru eksen!) güncelle, sonra kodu yaz.
- **Karar kaydı:** Teknoloji kararı eklendi/değiştiyse `docs/architecture/02-teknoloji-kararlari.md`'deki "Karar kaydı"na tarihli satır ekle (hafif ADR). Faz statüsü değiştiyse `docs/process/02-mvp-faz-plani.md`'yi güncelle.
- **İş kaydı:** Her anlamlı özellik/refactor/bug fix için Linear issue ile iş kayıt defterinde tek satır eşleşir. Durumlar `Todo`, `In Progress`, `Blocked`, `Review`, `Done`, `Canceled` setinden seçilir.
- **Çelişki:** Gelen istek mevcut belge (`docs/`, `.claude/skills/kontrol/SKILL.md`) ile çelişiyorsa, işe başlamadan bana bildir ve "Belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye sor.
- **İnce tut:** Kök CLAUDE.md ve `.claude/skills/kontrol/SKILL.md` ince kalsın — ayrıntı `docs/`'a, buraya sadece özet + pointer. README + skill, `docs/` yapısıyla tutarlı kalmalı.
