---
title: 'Pusula — Tasarım / Teknik Mimari'
description: 'Teknik mimari ve tasarım kararları için harita notu.'
aliases:
  - 'Architecture MOC'
  - 'Teknik Mimari'
tags:
  - 'pusula'
  - 'architecture/moc'
  - 'docs/moc'
type: 'moc'
axis: 'architecture'
status: 'active'
parent: '[[docs/README|Pusula Belgeleri]]'
updated: 2026-05-31
---

# Pusula — Tasarım / Teknik Mimari (`docs/architecture/`)

Bu klasör **"nasıl inşa ediyoruz?"** sorusunu yanıtlar: stack, monorepo yapısı,
pattern'ler, altyapı, transport, deployment. İş kuralları / domain modeli için
[`../domain/`](../domain/), süreç için [`../process/`](../process/).

Kararlar yerleşik kabul edilir; kullanıcı açıkça istemedikçe yeniden açma.

> [!note] Obsidian
> Bu klasördeki notlar `axis: architecture` ve `architecture/*` tag'leriyle işaretlenir.
> Yeni teknik not açarken [`../process/06-obsidian-dokumantasyon-kurallari.md`](../process/06-obsidian-dokumantasyon-kurallari.md)
> standardını uygula ve bu içindekiler tablosuna ekle.

## İçindekiler

| #   | Dosya                                                            | Konu                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [`01-genel-bakis.md`](01-genel-bakis.md)                         | Ürün hedefi (özet), kalite hedefleri, monorepo yapısı, teknoloji özet tablosu                                                                                                                                                                                                                                                                                                                                                                         |
| 02  | [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md)         | Sabit teknoloji kararları tablosu, karar kaydı (ADR-lite), açık noktalar                                                                                                                                                                                                                                                                                                                                                                              |
| 03  | [`03-backend.md`](03-backend.md)                                 | Hono HTTP kabuğu, tRPC sözleşmesi, worker katmanı                                                                                                                                                                                                                                                                                                                                                                                                     |
| 04  | [`04-veri-katmani.md`](04-veri-katmani.md)                       | PostgreSQL, Drizzle, tablo listesi, transaction disiplini, position implementasyonu                                                                                                                                                                                                                                                                                                                                                                   |
| 05  | [`05-board-mekanigi.md`](05-board-mekanigi.md)                   | Drag-drop stratejisi, optimistic UI protokolü, realtime mimarisi                                                                                                                                                                                                                                                                                                                                                                                      |
| 06  | [`06-bildirim-altyapisi.md`](06-bildirim-altyapisi.md)           | Outbox pipeline, worker processor, push (Expo) / email (Resend) teslimi                                                                                                                                                                                                                                                                                                                                                                               |
| 07  | [`07-auth.md`](07-auth.md)                                       | Better Auth, session, permission enforcement noktası                                                                                                                                                                                                                                                                                                                                                                                                  |
| 08  | [`08-web-ve-mobil.md`](08-web-ve-mobil.md)                       | Next.js + shadcn/ui + i18n, board ekranı teknik ihtiyaçları, Expo (ileri faz)                                                                                                                                                                                                                                                                                                                                                                         |
| 09  | [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md)             | MinIO / S3 uyumlu depolama, attachment akışı, PostgreSQL FTS → Meilisearch                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | [`10-platform.md`](10-platform.md)                               | Test stratejisi, CI/CD, deployment (Dokploy "Docker Compose" servis tipi), environment, observability, güvenlik başlıkları, performans                                                                                                                                                                                                                                                                                                                |
| 11  | [`11-referanslar.md`](11-referanslar.md)                         | Dış dokümantasyon linkleri                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 12  | [`12-deployment-runbook.md`](12-deployment-runbook.md)           | Üretim deploy runbook'u: `compose.prod.yml`/`Dockerfile` template'leri, VDS temizliği (v1'i indirme), ilk deploy + migration, smoke test, erişimi açma, sürekli deploy, rollback, yedekleme, sorun giderme                                                                                                                                                                                                                                            |
| 13  | [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md)                 | UI tasarım dili (Faz 2.7): design token sistemi (Trello-vari mavi palet / radius / shadow / spacing / Inter), board-kolon-kart anatomisi + metadata satırı, kart detay modalı (iki-kolon + kapak-renkli başlık + sağ panel), ortak desenler + `packages/ui` bileşen spec'leri (`Avatar`/`SectionHeader`/`Progress`/`EmptyState`/`MetaChip`/`LabelChip`/`CardCompleteToggle` + shadcn `Tooltip`/`DropdownMenu`/`Checkbox`/`Tabs`), Tiptap entegrasyonu, anasayfa anatomisi (Variant A — workspace rayı + stat strip + board kart grid'i, DEM-192) |
| 14  | [`14-paylasim-linki-mimarisi.md`](14-paylasim-linki-mimarisi.md) | Kart paylaşım linki (post-MVP): `share_links` tablosu, token üretimi/hash, tRPC `share.*` + Hono public endpoint, misafir yorum akışı, rate limit, realtime/notification dokunuşu                                                                                                                                                                                                                                                                     |
| 15  | [`15-bildirim-ayar-ekrani.md`](15-bildirim-ayar-ekrani.md)       | Bildirim ayar ekranı (Faz 10): `/account` Tabs içinde "Bildirimler" sekmesi, 4 section anatomi (genel kanallar + tip×kanal matrisi + scope override ağacı + push token cihazları), gelişmiş özellikler iskeleti (quiet hours / digest / snooze), shadcn primitive ihtiyaçları (Switch + RadioGroup), i18n namespace, a11y                                                                                                                          |
| 16  | [`16-raporlama-mimarisi.md`](16-raporlama-mimarisi.md)           | Raporlama mimarisi: **Faz 13** (preset şablon registry + universal micro-report + scope adapter + 4 yeni DB tablosu + tRPC `report.*` router + on-demand SQL + Redis kısa-TTL cache + outbox-driven invalidation + Puppeteer PDF pipeline + Excel/PNG export + 3-tier persistence + Resend scheduled email + MinIO retention 90g + i18n + comparison delta + stale rozeti + restricted scope) ve **Faz 14 — Klasik Pano PDF** (§16.18; bağımsız ikinci PDF subsystem — `@react-pdf/renderer` server-side JSX → buffer, senkron `GET /api/boards/[boardId]/report`, Puppeteer/worker/MinIO yok, eski Pusula v2.2 tek-tık PDF özelliğinin v2'ye birebir uyarlaması). Domain → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md). |
| 17  | [`17-audit-log-mimarisi.md`](17-audit-log-mimarisi.md)           | Audit log (Faz 8E): `audit_log` tablosu (append-only trigger), `AUDIT_ACTIONS` enum (~12 kritik action — delete/role_change/share), `appendAudit` helper, `audit.list` tRPC procedure (yalnız workspace owner), tx-içi insert (worker outbox YOK), süresiz retention. Forensic/compliance odaklı; `activity_events` ile dublike değil. Domain edge case + permission kuralları → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md). |
| 18  | [`18-ipad-uyarlamasi.md`](18-ipad-uyarlamasi.md)                 | iPad uyarlaması (Faz 15 — post-MVP epic): `supportsTablet: true` + orientation `default` + 768px tablet breakpoint (iPad mini dahil) + tüm ekranlarda master-detail pattern (board/workspace/account/settings) + iPadOS 18 üst nav tab bar + sheet→popover dönüşümü (iPad branch) + tablet typography 1.125× scale + iPad asset varyantları (`~ipad`) + App Store Connect iPad device family geçişi + production build v1.1.0 submit. Faz 7O `supportsTablet: false` (2026-05-21) kararı revize. Domain → değişmez; UI tasarım dili → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) tablet design token bölümü; mobil temel → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) iPad alt bölümü. |
| 19  | [`19-takvim-entegrasyonu.md`](19-takvim-entegrasyonu.md)         | Planlayıcı paneli + Google Takvim read-only entegrasyonu (Faz 16 — post-MVP epic): sol kenarda 3. global panel (Gezgin + Hızlı Notlar yanına "Planlayıcı") + Better Auth `genericOAuth` plugin ile Google hesap bağlama (login değil — ayrı bağlama, scope `calendar.events.readonly` + `calendar.readonly`) + primary calendar V1 + Trello tek-gün dikey timeline + Pusula içi read-only event modal + TanStack Query polling (staleTime 5dk + focus + manuel yenile; webhook YOK) + istek anında proxy (etkinlik DB'ye yazılmaz; `packages/api` hafif fetch wrapper). Faz 12 ([DEM-159](https://linear.app/demirkol/issue/DEM-159)) iptal edildi, yerine geçer (ayrı `/calendar` rotası + ay/hafta/gün → panel + tek-gün). Sadece web V1; mobil V2'ye. UI tasarım dili → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.13 Planlayıcı paneli anatomisi; backend → [`03-backend.md`](03-backend.md) Faz 16 procedure'leri (`integrations.google.*` + `planner.events.*`); web pattern → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) Faz 16 alt bölümü (3-panel mutex + LeftRail 3. toggle). |

## Kaçınılması gerekenler (teknik)

- Ana API sözleşmesini hem tRPC hem Hono RPC olarak ikiye bölmek.
- Kart/liste sırasını ardışık tam sayı (`order`) ile tutmak.
- Drag sırasında backend'e sürekli mutation göndermek.
- Bildirim (push/email) gönderimini API request handler'ında doğrudan yapmak.
- Realtime event'leri transaction dışında, DB-destekli kurtarma (refetch) hikâyesi olmadan yayınlamak.
- Web ve mobil için ayrı ayrı API contract yazmak.
- Permission kontrolünü yalnızca frontend'e bırakmak.
- Board query'sini her kart detayı / yorum / attachment / activity içeren dev bir payload haline getirmek.
- Optimistic UI rollback tasarlamadan mutation yazmak.
- Push notification'ı websocket'in alternatifi sanmak.
- shadcn/ui dışında ikinci bir web component library eklemek.
- UI bileşenlerine hardcode metin koymak (entity-bağımsız + i18n şart).
- Billing/subscription implementasyonu eklemek.
- `apps/mobile` iskeletini kullanıcı istemeden oluşturmak.
- `pnpm` dışında paket yöneticisi (npm/yarn/bun/npx) kullanmak.
- Dokploy'da her servisi (web/api/worker/postgres/redis/minio) tek tek "Application" olarak tanımlamak — tek bir "Docker Compose" servisi (`compose.prod.yml`) kullan.
- Üretim için yerel `docker-compose.yml`'i (dev kimlik bilgileri, host port publish) doğrudan kullanmak — ayrı `compose.prod.yml`.
