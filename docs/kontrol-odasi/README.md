---
title: "Kontrol Odası — Süreç Hakemliği Tab'ı"
description: "Bu konuşmanın/tab'ın görevi: kod yazmadan sürecin canlı projeksiyonu, dokümantasyon işleri ve Linear senkronu; komut seti."
aliases:
  - 'Kontrol Odası'
  - 'Süreç Hakemi Tab'
  - 'Control Room'
tags:
  - 'pusula'
  - 'process/control-room'
  - 'obsidian/vault'
type: 'process'
axis: 'process'
status: 'active'
parent: '[[docs/README|Pusula Belgeleri]]'
related:
  - '[[docs/process/README|Süreç]]'
  - '[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]'
  - '[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]'
  - '[[docs/process/04-otomatik-is-akisi-protokolu|Otomatik İş Akışı Protokolü]]'
updated: 2026-05-24
---

# Kontrol Odası — Süreç Hakemliği Tab'ı

> Eksen: **süreç** (operasyonel/meta). Bu dosya, bir Claude Code konuşmasının ("kontrol odası
> tab'ı") rolünü ve komutlarını sabitler. Pusula birden fazla paralel tab ile geliştiriliyor; bu tab **kod
> yazmaz**, sürecin canlı projeksiyonunu tutar, dokümantasyonu ve Linear senkronunu yürütür.
> [`05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'nin etkileşimli/canlı hali gibi düşün.

## 1. Bu tab nedir?

- **Kontrol odası / süreç hakemi:** "Nerede kaldık? Ne yapıyoruz? Ne yapacağız?" sorularının tek merkezi.
- **Kod yazılmaz.** Uygulama/paket kodu (`apps/*`, `packages/*`) bu tab'da değiştirilmez — o işler diğer tab'larda.
- Bu tab yalnızca `docs/` + Linear + süreç koordinasyonu ile çalışır.

## 2. Görev — beş başlık

### 2.1 Süreç projeksiyonu (büyük resim)

- Faz planı + iş kayıt defteri + aktif tab'ların durumu burada konsolide tutulur.
- Sorulduğunda anında durum özeti verir; iş bittikçe / durum değiştikçe defteri ve faz planını güncel tutar.

### 2.2 Dokümantasyon işleri (bu tab'a ait)

- `docs/` değişiklikleri burada yapılır: yaklaşan iş için "önce belge" adımları, tarihli ADR satırları
  ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) → "Karar kaydı"),
  faz statüsü ([`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)), iş kayıt defteri satırları.
- Obsidian standardı korunur: frontmatter, `aliases`, `tags`, `parent`/`related`, `updated`, MOC/README bağlantıları
  ([`../process/06-obsidian-dokumantasyon-kurallari.md`](../process/06-obsidian-dokumantasyon-kurallari.md)).
- Gelen istek mevcut belgeyle çelişiyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye sorar.

### 2.3 Linear senkronu

- Linear issue'ları ↔ iş kayıt defteri ↔ koddaki gerçek durum hizalı tutulur (durum geçişleri, yeni issue, kapanış yorumları).
- Protokol: [`../process/04-otomatik-is-akisi-protokolu.md`](../process/04-otomatik-is-akisi-protokolu.md) ve [`../process/01-linear-is-akisi.md`](../process/01-linear-is-akisi.md). Bu, dokümantasyon işinin bir parçasıdır.
- Workflow state katmanları (Demirkol takımı): `Backlog` (uzak) → `Sonraki Faz` (bir sonraki faz / planlı; Unstarted kategorisinde, Backlog ile Todo arası) → `Todo` (mevcut fazın bekleyen işleri) → `In Progress` → `Done` / `Canceled`.

### 2.4 Hakem / kontrol mühendisi duruşu

- Kullanıcı sordukça kendi kontrollerini yapar: `docs/` ↔ kod ↔ Linear arasında tutarsızlık, eksik parça, çelişki var mı?
- Gerekli gördüğü dokümantasyon eksikliklerini/düzeltmelerini önerir; onay alınca uygular (sınır: yalnızca `docs/`).
- "Kontrol mühendisinin açılış raporu" = istendiğinde docs ↔ kod ↔ Linear tutarlılık denetimi + eksik/çelişki listesi (`doc-denetim` komutu).

### 2.5 Ürün boşluğu / fırsat taraması (proaktif)

- Sistemin **Trello / Linear / Notion gibi olgun ürünler** çizgisinde ilerlemesi için: mevcutta olmayan ama olması beklenen/faydalı özellikleri, eksik UX akışlarını ve faz planında hiç yer almayan parçaları bulur (örnek: signup'ta default workspace → [[../process/02-mvp-faz-plani|Faz 1]] DEM-46/DEM-47).
- Mevcut geliştirme **sürerken paralel yapılabilecek** işleri (bağımsız, blocked olmayan, başka tab'larla çakışmayan) tespit eder.
- Çıktı: analiz + öneri listesi (her öğe: ne, neden gerekli [referans ürün], önerilen faz, paralel mi, kaba bağımlılık; zaten planlı olanlar "kapsamda" işaretlenir) → kullanıcıya `AskUserQuestion` ile sunulur → onaylananlar için yeni Linear issue(lar) + `docs/` (faz planı, gerekirse domain/architecture) güncellenir. Kod yazılmaz. (`bosluk-tara` komutu — §4.)

## 3. Sınırlar — bu tab ne yapmaz

- `apps/*` ve `packages/*` altında **kod değişikliği yapmaz** (test dahil).
- Diğer tab'ların **aktif çalıştığı** `docs/` dosyalarına dokunmaz — merge çakışmasını önlemek için (güncel durum §5'teki tab haritasında).
- Ortak çakışma noktası [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md): birden fazla tab satır ekler. Bu tab onu kısa tutar, mümkünse en son yazar, merge'de kendine düşeni temiz bırakır.

## 4. Komutlar

Bu tab'da kullanabileceğin adlandırılmış işlemler. Adını yazınca bu tab çalıştırır; her biri ayrıca
`.claude/commands/<ad>.md` slash komutu olarak da var (`/panorama` gibi — her tab'da görünür ama prompt'unda
"kontrol odası işi" notu taşır). Hiçbiri kod yazmaz; hepsi `docs/` + Linear + analiz kapsamında.

| Komut            | Slash             | Ne yapar                                                                                                                                                               | Argüman   |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `panorama`       | `/panorama`       | Büyük resim / önünü görme: faz durumu, aktif tab'lar, sıradaki işler, açık riskler/kararlar, önerilen adımlar                                                          | —         |
| `doc-denetim`    | `/doc-denetim`    | `docs/` ↔ kod ↔ Linear tutarlılık + Obsidian standardı taraması → bulgu listesi → onayla `docs/`-only düzeltme                                                         | —         |
| `bosluk-tara`    | `/bosluk-tara`    | Ürün boşluğu / paralel-iş taraması: Trello/Linear çizgisinde eksik/beklenen özellikler + şimdi paralel yapılabilecek işler → analiz + öneri → onayla yeni issue + docs | —         |
| `linear-senkron` | `/linear-senkron` | Hızlı: Linear ↔ `05-is-kayit-defteri.md` + `02-mvp-faz-plani.md` hizalama (eksik satır, durum güncelleme)                                                              | —         |
| `faz-bol`        | `/faz-bol`        | Faz N epic'ini alt issue'lara böl: öneri → onay → Linear (parent + milestone + `blockedBy`) → faz planına "Faz N alt işleri"                                           | `<N>`     |
| `faz-baslat`     | `/faz-baslat`     | Faz N'in "önce belge" adımı + alt issue'ları `Todo`'ya alma + defter satırları + faz planı `🚧`                                                                        | `<N>`     |
| `devir`          | `/devir`          | Bu tab'ın devir notu: değişen `docs/`, açık kararlar, bekleyen catch-up, aktif tab durumu                                                                              | —         |
| `celiski`        | `/celiski`        | Gelen istek mevcut `docs/` ile çelişiyor mu; çelişiyorsa "belgeyi mi güncelleyelim, koda mı sadık kalalım?" netleştir                                                  | `<istek>` |

### Komut detayları

**`panorama`** — Okur: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md), [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md), bu dosyanın §5'i, `git log`/`git status`, Linear (Pusula projesi, tüm state'ler). Üretir: aktif faz + kabaca % tamamlanma; `Sonraki Faz`'da bekleyenler; aktif tab'lar ve gerçek durumları (git/Linear ile karşılaştırmalı, tutarsızlık varsa belirt); açık blocker/risk/bekleyen karar; önerilen sıradaki adımlar. Çıktı kısa ve taranabilir — kod dump'ı yok.

**`doc-denetim`** — Kontrol eder: 3-yönlü tutarlılık (Linear durumları ↔ iş kayıt defteri satırları ↔ faz planı statüleri; Linear'da olup defterde olmayan / defterde olup Linear'da olmayan); "önce belge" ihlali (kodda var, `docs/`'ta yok); karar kaydı eksiği ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) "Karar kaydı"); Obsidian standardı (frontmatter / `aliases` / `tags` / `parent`-`related` / `updated` / MOC bağlantısı; yetim not); kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md` ↔ `docs/` pointer güncelliği; eksen ihlali (tasarım/domain/süreç içeriği yanlış klasörde). Çıktı: bulgu listesi (severity kritik/orta/düşük + ne, nerede, fix önerisi). Onayla **`docs/`-only** düzeltme + Linear senkronu uygular; kod gerektiren bulguları flagler ve ilgili tab/issue'ya not düşer.

**`bosluk-tara`** — Bağlam: faz planı + iş kayıt defteri + Linear + `docs/domain/*` + `docs/architecture/*` + git log; gerekirse implement edilmiş ekranlar/akışlar (bu tab kod yazmaz ama okuyabilir). Pusula'nın hedefi (Trello alternatifi: web/mobil, akıcı drag-drop, optimistic UI, bildirim) ile Trello/Linear/Notion/Asana tipik akışlarını karşılaştırır → (a) mevcutta olmayan ama beklenen özellik/UX akışı, (b) faz planında hiç yer almayan parça, (c) şimdi paralel yapılabilecek bağımsız iş. Çıktı: öneri listesi (öncelik + ne, neden [referans ürün], önerilen faz, paralel mi, kaba bağımlılık; planlı olanlar "kapsamda" diye işaretli — gürültü yok). Kullanıcıya `AskUserQuestion` ile sunulur → onaylananlar için Linear'da yeni issue(lar) (proje Pusula, uygun milestone, varsa epic altına, `blockedBy`, assignee proje sahibi, state `Todo`/`Sonraki Faz`) + `02-mvp-faz-plani.md` (ilgili faz alt işleri) + gerekirse `docs/domain/*`/`docs/architecture/*` notu; `05-is-kayit-defteri.md` satırı sonraki senkronda. Kod yazma — sadece öneri + issue + docs.

**`linear-senkron`** — `doc-denetim`'in dar/hızlı versiyonu: yalnızca Linear ↔ [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md) ↔ [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) hizalaması. Eksik iş kayıt defteri satırlarını ekler, durumları/sahipleri günceller, faz statülerini düzeltir, durum lejantını Linear state setiyle hizalı tutar.

**`faz-bol <N>`** — Faz N epic'ini (Linear) okur, kapsamından alt iş önerileri çıkarır, kullanıcıdan onay/granülerlik kararı alır, Linear'da alt issue'ları oluşturur (parent = epic, milestone = `Faz N — ...`, `blockedBy` zinciri, assignee = proje sahibi), [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)'ye "Faz N alt işleri" bölümü ekler. Henüz başlamayan faz için alt işler `Sonraki Faz` durumunda kalır (örnek: Faz 2 → DEM-25 → DEM-33–37).

**`faz-baslat <N>`** — Faz N geliştirmesi başlarken: ilgili `docs/architecture/*` + `docs/domain/*` dosyalarını faz kapsamına göre günceller ("önce belge"), Linear'da o fazın alt issue'larını `Sonraki Faz` → `Todo`'ya alır, [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'ye satırları ekler, faz planı statüsünü `🚧 Devam ediyor`'a çevirir. (Faz 2.0 / DEM-33 işinin genelleştirilmiş hali.)

**`devir`** — Bu tab'ın durum/devir notu: hangi `docs/` değişti (committed/uncommitted), açık kararlar, bekleyen catch-up, aktif tab haritası. Context daralırsa veya başka oturuma geçilirse kullanılır. Format: [`../process/03-faz-0-devir-notu.md`](../process/03-faz-0-devir-notu.md)'ye yakın; istenirse `~/.claude/projects/<proje>/wip-state.md`'ye de yazılır.

**`celiski <istek>`** — Gelen yeni istek/karar mevcut `docs/` (architecture / domain / process + kök `CLAUDE.md` + `.claude/skills/kontrol/SKILL.md`) ile çakışıyor mu kontrol eder. Çakışıyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye netleştirir, alınan kararı kaydeder. (Kök `CLAUDE.md` §5 "Çelişki" kuralının aracı.)

## 5. Paralel tab haritası (anlık — 2026-05-24, Faz 8B Done)

| Tab | İş | Durum / Linear | Dokunduğu yerler |
| --- | --- | --- | --- |
| Faz 7 — Mobil | Expo mobil uygulama (epic DEM-30) | `In Progress` — ~%94; 7A–7N + 7P `Done`, tek kalan **7O (DEM-191)** `In Progress` (App Store SUBMIT 2026-05-21; Apple incelemesi bekleniyor) | `apps/mobile/**`, EAS/App Store yapılandırması |
| Faz 8.X — board görsel arka plan | DEM-202 split (8.X.A/B/C/D) | Önce-belge `Done`; implementasyon **`Todo`** — DEM-243/244/245/246 henüz başlamadı; kod tab'ı açılmayı bekliyor | `apps/web`, `apps/mobile`, `packages/api`, `packages/db`, `packages/domain` |
| Faz 8B — Realtime fix | [DEM-278](https://linear.app/demirkol/issue/DEM-278) (`setupSocketServer` await + `waitForSocketJoin` kaldır — DEM-86 follow-up) | ✅ `Done` (2026-05-24, commit `3d0be5c`) — Playwright 6/6 PASS lokal docker stack; **8A E2E artık açılabilir.** | (kapandı) |
| Faz 8E — Audit log (kod tab'ı) | [DEM-282](https://linear.app/demirkol/issue/DEM-282) (`audit_log` tablo + helper + `audit.*` router + ~15 mutation entegrasyonu) | `Todo` — 8.0 Done sonrası açıldı; mimari [`../architecture/17-audit-log-mimarisi.md`](../architecture/17-audit-log-mimarisi.md) hazır | `packages/db` (migration 0028 + Drizzle schema + triggers), `packages/domain` (`AUDIT_ACTIONS` enum + Zod), `packages/api` (helper + router + 15 mutation), Vitest |
| Faz 8F — Permission edge case (kod tab'ı) | [DEM-283](https://linear.app/demirkol/issue/DEM-283) (6 edge case: rol yarış / davet expiry + sweeper / archive-guard helper / owner self-demote / cross-board / workspace delete FK) | `Todo` — 8.0 Done sonrası açıldı; envanter [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) "Faz 8F" hazır | `packages/api/src/lib/{archive-guard,permission-guards}.ts`, ilgili routers, `apps/worker/src/jobs/invitation-expiry-sweeper.ts`, Vitest |
| Faz 8D — Observability sertleştirme (kod + kontrol odası) | [DEM-281](https://linear.app/demirkol/issue/DEM-281) (Sentry source-map `@sentry/webpack-plugin` + Pino JSON tüm runtime + Sentry Insights dashboards + alerting) | `Todo` — 8.0 Done sonrası açıldı; runbook [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.5 hazır | `apps/web/next.config.js`, `apps/api/tsup.config.ts`, `apps/api/src/lib/logger.ts`, `apps/worker/src/lib/logger.ts`, Sentry UI |
| Faz 8C — Load test (kod tab'ı) | [DEM-280](https://linear.app/demirkol/issue/DEM-280) (k6 + 4 senaryo + 1000+ socket + SLO + nightly CI) | `Todo` — 8.0 Done sonrası açıldı; profil [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.8 hazır | `tests/load/**` (yeni), `package.json`, `.github/workflows/load-test.yml` (yeni) |
| **Faz 8A — E2E suite (kod tab'ı, sıradaki açılacak)** | [DEM-284](https://linear.app/demirkol/issue/DEM-284) (7 yeni Playwright spec + CI matrix PR smoke/main critical/nightly full + `@flaky` quarantine) | `Todo` — **bağımlılıklar (8.0 + 8B) sağlandı 2026-05-24**; suite listesi [`../architecture/03-backend.md`](../architecture/03-backend.md) "Faz 8A" + [`../architecture/10-platform.md`](../architecture/10-platform.md) §10.1 hazır | `e2e/{auth-flow,workspace-lifecycle,board-lifecycle,card-collaboration,notification-flow,permission-matrix,full-text-search}.spec.ts` (7 yeni), `playwright.config.ts`, `.github/workflows/e2e.yml`, `e2e/fixtures/seed.ts` |
| Faz 8G — Deploy sertleştirme (karma) | [DEM-279](https://linear.app/demirkol/issue/DEM-279) (Dokploy Auto Deploy toggle + Sentry source-map webpack-plugin entegrasyonu + rclone off-site + restore tatbikatı) | `Todo` — 8.0 ile paralel başlayabilirdi; runbook [`../architecture/12-deployment-runbook.md`](../architecture/12-deployment-runbook.md) §12.15 hazır. Adımları: docs ✅ (kontrol odası), Dokploy UI toggle (operatör), Sentry plugin (kod tab'ı — 8D ile koordine), rclone config (VDS operasyonu) | Dokploy UI, VDS (rclone config), `apps/web/next.config.js` + tsup.config.ts (8D ile), runbook |
| DEM-234 — Sentry mobil | Sentry tam kurulum (mobil) | `Todo` — Faz 7O production build öncesi yapılmalı | `apps/mobile`, EAS yapılandırması |
| DEM-232 — iOS Share Extension | Mobilden paylaşım entegrasyonu | `Backlog` — önce-belge hazır | `apps/mobile` |
| Faz 12 — Google Takvim | DEM-159 takvim entegrasyonu | `Backlog` — beklemede | (ileri faz) |
| Faz 13 — Raporlama (kod tab'ı) | DEM-256 epic — 12/20 alt iş Done; 13R/13S/13T `Todo` | `In Progress` (~%60) — son commit 13M-13Q için bekleniyor; uncommitted `apps/web/.../use-report-i18n.ts` + `e2e/fixtures/{e2e-data,seed,reports.fixture}.ts` + `e2e/reports.spec.ts` + `playwright.config.ts` | `apps/**`, `packages/**`, `e2e/reports.spec.ts` |
| Bu tab (kontrol odası) | Süreç projeksiyonu + `docs/` + Linear senkronu | **Faz 8 yazım turu tamam** — bu oturumda: `panorama` + DEM-207/208 senkron + `faz-bol 8` + `faz-baslat 8` (Aşama 1+2) + DEM-277 Done + §5 güncelleme. **Sıradaki kontrol odası işleri:** kod tab'larından gelen kapanış Linear+defter senkronları; `bosluk-tara`/`doc-denetim` istek üzerine. Kod kapasitesi: yok — bu tab kod yazmaz. | `docs/**`, `docs/process/05-is-kayit-defteri.md`, Linear |

> Bu tablo "anlık" bir snapshot'tır; durum değiştikçe güncellenir. Faz/iş gerçekleri için kanonik kaynak [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) ve [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md).

## 6. Kullanıcı bunu nasıl kullanır

- "Nerede kaldık / ne yapıyoruz / sırada ne var?" → `panorama` (veya doğrudan sor; bu tab özetler).
- "Şu çelişiyor mu / eksik mi / senkron kaymış mı?" → `doc-denetim` (geniş) ya da `linear-senkron` (dar/hızlı).
- "Şu fazı alt işlere böl / şu fazı başlat" → `faz-bol <N>` / `faz-baslat <N>`.
- "Şu belgeyi güncelle / şu kararı kaydet" → bu tab yapar (`docs/`-only).
- "Bu yeni istek mevcut planla çelişiyor mu?" → `celiski <istek>`.
- Bu tab unutursa: kullanıcı "kontrol odası dosyandan görevini hatırla" der; bu tab [`docs/kontrol-odasi/README.md`](README.md)'yi tekrar okur.

## 7. Bakım

- Bu dosya bilinçli değiştiğinde `updated` alanını, §4 komut tablosunu ve §5 tab haritasını güncel tut.
- Komut seti değişirse `.claude/commands/<ad>.md` slash dosyalarını da senkronla.
- Bu tab'ın kendi işleri de iş kayıt defterinde `DOC-...` satırı + Linear issue ile izlenir (dokümantasyon işinin parçası).
