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
updated: 2026-05-23
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
| 16  | [`16-raporlama-mimarisi.md`](16-raporlama-mimarisi.md)           | Raporlama mimarisi (Faz 13): preset şablon registry + universal micro-report + scope adapter (kart/liste/pano/workspace auto-aggregation) + 4 yeni DB tablosu (`saved_reports`/`report_schedules`/`report_renders`/`report_render_assets`) + tRPC `report.*` router + on-demand SQL + Redis kısa-TTL cache + outbox-driven invalidation + Puppeteer PDF pipeline (`/reports/print/[id]`) + Excel xlsx + PNG/SVG export + 3-tier persistence (ad-hoc/saved/scheduled) + Resend scheduled email + MinIO retention (90g + son 5 sürüm) + i18n + comparison delta + stale rozeti + restricted scope. Domain → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md); süreç → [`../process/07-faz-13-raporlama-plani.md`](../process/07-faz-13-raporlama-plani.md). |

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
