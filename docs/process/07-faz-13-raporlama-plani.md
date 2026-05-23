---
title: '07 — Faz 13 Raporlama Planı'
description: 'Faz 13 raporlama epic alt iş zinciri, bağımlılıklar, tahmin, sahiplik, Linear eşlemesi.'
aliases:
  - 'Faz 13 Plan'
  - 'Raporlama Faz Planı'
tags:
  - 'pusula'
  - 'process/plan'
  - 'process/phase-13'
type: 'plan'
axis: 'process'
status: 'active'
parent: '[[docs/process/README|Süreç]]'
related:
  - '[[docs/architecture/16-raporlama-mimarisi|Raporlama Mimarisi (teknik)]]'
  - '[[docs/domain/09-raporlama-kurallari|Raporlama Kuralları (domain)]]'
  - '[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]'
  - '[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]'
updated: 2026-05-23
---

# 07 — Faz 13 Raporlama Planı

> Eksen: **süreç**. Faz 13 (post-MVP epic [DEM-256](https://linear.app/demirkol/issue/DEM-256)) alt iş zinciri,
> bağımlılıklar, tahmin. Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md).
> Domain kuralları → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md).

## 7.0 Genel Çerçeve

- **Epic:** [DEM-256](https://linear.app/demirkol/issue/DEM-256) — Faz 13 — Raporlama Sistemi.
- **Milestone:** "Faz 13 — Raporlama Sistemi" (Pusula projesi).
- **Tip:** post-MVP epic — Faz 11 (kart eki, Done) + Faz 12 (Google takvim, beklemede) sonrası bağımsız.
- **Bağımlılık koşulları sağlanmış:**
  - Faz 5 (realtime outbox) — `realtime_events` + worker bridge ✅ Done.
  - Faz 6 (notification outbox + worker) — `notification_outbox` + processor + Resend ✅ Done.
  - Faz 11 (MinIO/attachment yolu) — S3 SDK + bucket yapısı ✅ Done.
  - Faz 7 (apps/mobile mevcut) — 13S adımı bağımlı, Faz 7 büyük oranda ✅ Done.
- **Çakışma:** yok — yeni `report.*` router + yeni 4 tablo + yeni worker queue'ları. Drag-drop / optimistic UI cache / search index'e dokunmaz.
- **Hedef target tarih:** 2026-07-04 (~6 hafta, 1 geliştirici).

## 7.1 Alt İş Zinciri

```txt
                 13A (önce-belge)
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
        13B (DB)              13C (domain)
            │                     │
            └──────────┬──────────┘
                       ▼
       ┌───────────────┴───────────────┐
       ▼                               ▼
  13D (tRPC + ilk 8)            13E (cache + invalidator)
       │
       ├──────────┬──────────┬─────────┐
       ▼          ▼          ▼         ▼
   13F (UI    13G (composer  13H      13I (worker
   primitives  + entity      (workspace  PDF Puppeteer)
   + ilk 8)   tab)          /reports)
                                         │
                                         ▼
                                    13J (schedule
                                    cron + Resend)
                                         │
                                         ▼
                                    13K (kalan 22
                                    micro-report +
                                    11 preset)
                                         │
       ┌─────────┬──────────┬──────────┬─┴────┬─────────┬──────────┐
       ▼         ▼          ▼          ▼      ▼         ▼          ▼
   13L (Excel  13M       13N (stale  13O    13P       13Q
   + PNG)    (comparison + socket   (restricted  (retention   (i18n)
              delta)     event)     scope)     worker)
                                         │
                                         ▼
                                    13R (E2E
                                    Playwright)
                                         │
                                         ▼
                                    13S (mobil —
                                    koşullu)
                                         │
                                         ▼
                                    13T (production
                                    deploy + smoke)
```

## 7.2 Alt İş Tablosu

| # | Linear | Başlık | Durum | Tahmin (g) | blockedBy |
|---|--------|--------|-------|------------|-----------|
| 13A | [DEM-257](https://linear.app/demirkol/issue/DEM-257) | Önce-belge: raporlama mimarisi/domain/faz planı (3 yeni doc + 4 güncelleme + Linear senkron) | In Progress | 1 | — |
| 13B | [DEM-258](https://linear.app/demirkol/issue/DEM-258) | DB schema: 4 yeni tablo + migration | Todo | 1 | 13A |
| 13C | [DEM-259](https://linear.app/demirkol/issue/DEM-259) | `@pusula/domain/reports` paketi: tipler + registry + scope adapter contract + permission + comparison | Todo | 2 | 13A |
| 13D | [DEM-260](https://linear.app/demirkol/issue/DEM-260) | tRPC report router + servisler + ilk 8 micro-report query | Todo | 3 | 13B + 13C |
| 13E | [DEM-261](https://linear.app/demirkol/issue/DEM-261) | Redis cache + outbox-driven invalidator worker | Todo | 1.5 | 13D |
| 13F | [DEM-262](https://linear.app/demirkol/issue/DEM-262) | `@pusula/ui/reports`: primitives + ilk 8 micro-report component (panel + print AYNI) | Todo | 3 | 13C |
| 13G | [DEM-263](https://linear.app/demirkol/issue/DEM-263) | Composer modal + entity tab girişleri | Todo | 2 | 13D + 13F |
| 13H | [DEM-264](https://linear.app/demirkol/issue/DEM-264) | Workspace `/reports` merkez sayfası: Kaydedilmiş / Zamanlanmış / Son render'lar | Todo | 1.5 | 13D + 13F |
| 13I | [DEM-265](https://linear.app/demirkol/issue/DEM-265) | Worker: PDF render pipeline (Puppeteer + `/reports/print/[id]` + MinIO upload) | Todo | 2.5 | 13F |
| 13J | [DEM-266](https://linear.app/demirkol/issue/DEM-266) | Worker: schedule cron + Resend email teslimi | Todo | 2 | 13I |
| 13K | [DEM-267](https://linear.app/demirkol/issue/DEM-267) | Kalan 22 micro-report + 11 preset (4 kategori sprinti) | Todo | 12 | 13D + 13F |
| 13L | [DEM-268](https://linear.app/demirkol/issue/DEM-268) | Excel (xlsx multi-sheet) + PNG/SVG (chart-level) export | Todo | 2 | 13I |
| 13M | [DEM-269](https://linear.app/demirkol/issue/DEM-269) | Comparison (period-over-period) delta entegrasyonu | Todo | 1.5 | 13D + 13F + 13K |
| 13N | [DEM-270](https://linear.app/demirkol/issue/DEM-270) | Stale rozeti + realtime invalidation socket event | Todo | 1 | 13E + 13H |
| 13O | [DEM-271](https://linear.app/demirkol/issue/DEM-271) | Restricted scope rozeti + auto-aggregation permission filtresi | Todo | 1 | 13D + 13F |
| 13P | [DEM-272](https://linear.app/demirkol/issue/DEM-272) | Retention worker: 90g rotation + son 5 sürüm | Todo | 1 | 13I |
| 13Q | [DEM-273](https://linear.app/demirkol/issue/DEM-273) | i18n key tarama + TR locale tamamla + EN boş şablon | Todo | 1.5 | 13F + 13G + 13H + 13J + 13K |
| 13R | [DEM-274](https://linear.app/demirkol/issue/DEM-274) | E2E Playwright suite (8+ senaryo) | Todo | 2 | 13G + 13H + 13J + 13M + 13N + 13O |
| 13S | [DEM-275](https://linear.app/demirkol/issue/DEM-275) | Mobil entegrasyon (apps/mobile): saved + scheduled liste + WebView panel + PDF share | Todo | 2 | 13H + 13J |
| 13T | [DEM-276](https://linear.app/demirkol/issue/DEM-276) | Production deploy + smoke test | Todo | 1.5 | 13R |

**Toplam tahmin: ~38 iş günü** (1 geliştirici sıralı). Paralel ekip ile (~3 geliştirici) ~14-16 iş günü.

## 7.3 Önemli Bağımlılıklar

- **13B + 13C paralel** olabilir (13A önce-belge sonrası).
- **13F + 13D paralel** olabilir (13C ortak bağımlılık).
- **13G + 13H + 13I** paralel (13D + 13F sonrası).
- **13K** dört bağımsız sprint (kategori bazlı) paralel ilerleyebilir.
- **13L, 13M, 13N, 13O, 13P, 13Q** birbirinden bağımsız — paralel teslim mümkün.

## 7.4 Quality Gate (Phase Gecisi)

Bir alt iş "Done" sayılmadan önce:

1. Kod review (`code-reviewer` agent + ilgili dev-QA loop — [`qa-loop.md`](../../C:/Users/asya/.claude/rules/qa-loop.md) global kuralı).
2. Verifier PASS: build + type check + lint + test.
3. Security review (auth/permission etkisi varsa).
4. İlgili docs satırı güncellenmiş.
5. İş kayıt defteri ([`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)) satırı Done.
6. Linear issue kapanış yorumu (commit hash + değişen docs + verifier kanıtı).

Faz 13 epic "Done" sayılır:

- 20 alt iş Done.
- 13R E2E suite tamamen PASS (10+ senaryo).
- 13T production deploy başarılı, smoke test PASS, 7 gün retention dry-run sonrası policy aktive.

## 7.5 Açık Riskler ve Mitigasyon

Risk tablosu kanonik kaynak: [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md) §16.16.

Süreç tarafı önemli noktalar:

| Risk | Mitigasyon (süreç) |
|------|--------------------|
| 13K (kalan 22 micro-report) sürede patlama | 4 paralel sprint olarak böl; her sprint kendi PR'ı; her sprint Done sayılmadan bir sonraki kategori başlamasın gerekmiyor — paralel akış |
| 13S (mobil) Faz 7 ile bağlantı | Faz 7 ProductionDeploy beklenir; gerekirse 13S geçici "Sonraki Faz" durumuna |
| Production deploy 13T'nin Chromium image build hatası | İlk deploy önce staging'de (Dokploy preview environment) test |

## 7.6 Linear Senkron Disiplini

- Epic [DEM-256](https://linear.app/demirkol/issue/DEM-256) milestone "Faz 13 — Raporlama Sistemi"ne bağlı.
- 20 alt issue (DEM-257..276) parent = DEM-256.
- Her alt iş durum değişiminde `05-is-kayit-defteri.md` satırı güncellenir (repo içi takip — her tur).
- Linear MCP teması: 13A önce-belge bitişi (epic kapanış yorumu), 13T deploy sonrası, ve her alt iş Done kapanışında. Ara turlarda Linear API çağrısı yok — defter source of truth.
