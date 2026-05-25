---
title: '08 — Faz 14 Klasik Pano PDF Planı'
description: 'Faz 14 (klasik pano PDF raporu) epic alt iş zinciri, 12 karar kaydı, 4 sayfa kanonik içerik, domain mapping, bağımlılıklar, tahmin.'
aliases:
  - 'Faz 14 Plan'
  - 'Klasik PDF Faz Planı'
  - 'Board Classic PDF Plan'
tags:
  - 'pusula'
  - 'process/plan'
  - 'process/phase-14'
type: 'plan'
axis: 'process'
status: 'active'
parent: '[[docs/process/README|Süreç]]'
related:
  - '[[docs/architecture/16-raporlama-mimarisi|Raporlama Mimarisi (teknik)]]'
  - '[[docs/domain/09-raporlama-kurallari|Raporlama Kuralları (domain)]]'
  - '[[docs/architecture/02-teknoloji-kararlari|Teknoloji Kararları]]'
  - '[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]'
  - '[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]'
  - '[[docs/process/07-faz-13-raporlama-plani|Faz 13 Raporlama Planı]]'
updated: 2026-05-25
---

# 08 — Faz 14 Klasik Pano PDF Planı

> Eksen: **süreç**. Faz 14 (post-MVP epic [DEM-290](https://linear.app/demirkol/issue/DEM-290))
> alt iş zinciri, 12 karar kaydı, 4 sayfa kanonik içerik, domain mapping, tahmin.
> Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md) §16.18.
> Domain kuralları → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md) §9.15.

## 8.0 Genel Çerçeve

- **Epic:** [DEM-290](https://linear.app/demirkol/issue/DEM-290) — Faz 14 — Klasik Pano PDF Raporu.
- **Milestone:** "Faz 14 — Klasik Pano PDF Raporu" (Pusula projesi, id `b1e5cd77-4005-44c6-b9fb-355a06196ff7`).
- **Tip:** post-MVP epic — Faz 13 (kapsamlı raporlama) yanına **bağımsız ikinci PDF subsystem**.
- **Kaynak:** eski Pusula (`D:\projects\pusulav0`, v2.2) `@react-pdf/renderer` ile tek-tık senkron PDF özelliği. v2'ye birebir uyarlama.
- **Bağımlılık koşulları sağlanmış:**
  - Faz 2.7 ([DEM-66](https://linear.app/demirkol/issue/DEM-66)/[DEM-67](https://linear.app/demirkol/issue/DEM-67)) — `cards.completed` toggle ✅ Done (karar 1 buna yaslanır).
  - Faz 13F + 13Q ([DEM-262](https://linear.app/demirkol/issue/DEM-262)/[DEM-273](https://linear.app/demirkol/issue/DEM-273)) — `canPerformReportAction` policy + i18n namespace ✅ Done (karar 6 + 11 buna yaslanır).
  - Faz 13S ([DEM-275](https://linear.app/demirkol/issue/DEM-275)) — mobil rapor altyapısı (`react-native-webview` + `FileSystem.downloadAsync` + `Sharing.shareAsync`) ✅ Done (karar 10 buna yaslanır).
- **Çakışma:** yok — yeni `apps/web/src/app/api/boards/[boardId]/report/route.ts` + yeni `apps/web/src/components/reports/classic-pdf/` + yeni `packages/api/src/services/board-report-data.ts`. Faz 13 yollarına dokunma sıfır.
- **Hedef target tarih:** 3-4 iş günü (1 geliştirici sıralı).

## 8.1 Karar Kaydı (12 noktada netleşti — 2026-05-25)

`AskUserQuestion` ile 3 batch'te toplandı (14A — DEM-291). Tablonun "Karar"
sütunu kanonik; alt işler bu satırlara göre yazılır.

| #   | Konu                          | Karar                                                                              | Gerekçe                                                                                                                                                                  |
| --- | ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "Tamamlanan kart" tanımı      | `cards.completed = true` (v2'de mevcut)                                            | DEM-66/67 ile Faz 2.7'de kart tamamlama toggle'ı geldi (`cards.completed` boolean + `completed_at` timestamptz + `completed_by` user FK). En açık operasyonel sinyal.    |
| 2   | "Acil/ivedi" göstergesi       | Tamamen kaldır                                                                     | Eski Pusula'nın `Görev.ivedi` alanının v2 karşılığı kurulmamış; PDF V1 sade kalır. Kapakta acil sayım yok, liste sayfalarında acil işareti yok.                          |
| 3   | 2. sayfa içeriği              | Sayfayı tamamen kaldır                                                             | Eski Pusula 2. sayfa `ProjeDetay` (custom field) v2'de yok. Alternatif (üye tablosu / label dağılımı / ek özet) reddedildi → minimal PDF. Üyeler sayfası 3'te zaten var. |
| 4   | Türkçe font kaynağı           | Roboto CDN (`fonts.gstatic.com/s/roboto/...`)                                      | Eski Pusula tarzı. Sıfır build complexity, ilk istekte cache'lenir (~50KB). Local `apps/web/public/fonts/` reddedildi (binary repo yükü).                                |
| 5   | Endpoint HTTP method          | `GET /api/boards/[boardId]/report`                                                 | Sade `<a href=...>` indirme; idempotent okuma; permission middleware'lerine doğal sığar. Eski Pusula POST'tu — GET REST semantik daha doğru.                             |
| 6   | Permission stratejisi         | Faz 13 `canPerformReportAction('render', boardScope, ctx)` reuse                   | Faz 13 raporlama policy'si zaten yazıldı (`packages/domain/src/reports/permission.ts`). Tek noktada policy = tutarlılık + viewer/member/admin matrisi hazır.             |
| 7   | Yorum içeriği clamp           | Son 5 yorum + "ve M yorum daha" footer                                             | Eski Pusula deseni; dengeli (3 az, 10 sayfa şişirir). 5'in üstü `body_plaintext` özetli footer.                                                                          |
| 8   | Checklist sayfa yerleşimi     | Liste sayfasında kart satırının altında indented (`└─ ` + sol border)              | Eski Pusula deseni. Kart bağlamı korunur; ayrı checklist sayfası reddedildi (okuma kopuk).                                                                               |
| 9   | Dosya adı pattern             | `{pano-slug}-raporu-{YYYY-MM-DD}.pdf`                                              | Eski Pusula tarzı; ASCII-clean Turkish-friendly slug; tarih yerel TR (Europe/Istanbul) gün bazında. Workspace prefix'li alternatif reddedildi (hantal).                  |
| 10  | Mobil V1                      | Mobil de var — Faz 13S WebView/share altyapısı reuse                               | DEM-275 deseni (`FileSystem.downloadAsync` + `Sharing.shareAsync`). +0.5-1g efor; web ile parite. "Sadece web" reddedildi (parite kayıp).                                |
| 11  | i18n stratejisi               | Locale-aware `reports.classic.*` namespace                                         | v2 i18n altyapısı (`apps/web/src/locales/tr|en/reports.json`) zaten var. Faz 13 ile tutarlı. Hardcoded TR reddedildi (geri adım, EN kullanıcı için UX bozuk).            |
| 12  | Boş pano davranışı            | PDF üretilir, "Veri yok" sayfasıyla (Kapak + bilgi sayfası)                        | Deterministik UX, kullanıcı her zaman çıktı alır. 422 + toast reddedildi (kullanıcıyı bloklar).                                                                          |

## 8.2 Eski → v2 Domain Mapping (Kanonik)

Eski Pusula (`D:\projects\pusulav0`, Prisma) → v2 (Drizzle) birebir eşleştirme.
Component yazımında bu tabloyu kullan.

| Eski (pusulav0 Prisma)                   | v2 (Drizzle)                                          | Not                                                                              |
| ---------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Proje`                                  | `boards`                                              | 1 PDF = 1 pano                                                                   |
| `Bölüm`                                  | `lists`                                               | LexoRank sıralı (`position` text)                                                |
| `Görev`                                  | `cards`                                               | LexoRank sıralı, `completed` boolean (karar 1)                                   |
| `Görev.ustGorevId` (parent-child ağaç)   | `checklist_items` (`checklists` altında)              | v2'de alt görev yok; ağaç checklist'e düzleşir                                   |
| `Görev.tamamlandi`                       | `cards.completed` (boolean)                           | Karar 1 — birebir eşleşme                                                        |
| `Görev.ivedi` (acil)                     | **YOK**                                               | Karar 2 — PDF'ten tamamen kaldırıldı                                             |
| `İlerleme` (yorum tablosu)               | `comments` (`body_plaintext` denormalize)             | Karar 7 — son 5 + footer; `body_plaintext` Faz 11 deseninden hazır               |
| `TakımProje` + `Takım` + `Üye`           | `board_members`                                       | "Takım" konsepti yok; doğrudan pano üyesi                                        |
| `Kurum`                                  | `workspaces.name`                                     | Üst kapsam adı                                                                   |
| `Kategori`                               | **YOK**                                               | Karar 3 — 2. sayfa kaldırıldı, label dağılımı PDF dışı                           |
| `ProjeDetay` (anahtar/değer custom field) | **YOK**                                               | Karar 3 — sayfa tamamen kaldırıldı (alternatif değil, kaldır)                    |

## 8.3 PDF Kanonik İçerik — 4 Ana Sayfa Kategorisi

Sayfa 2 (eski Pusula `ProjeDetay`) karar 3 ile kaldırıldı; eski sayfa 3
"Üyeler" şimdi sayfa 2'ye kayar. Liste sayfaları her liste için ayrı (fiziksel
sayfa sayısı liste sayısına bağlı). Boş pano (karar 12) yalnız Sayfa 1 + 1
bilgi sayfası üretir.

### Sayfa 1 — Kapak

- Pano adı (Tiptap title plaintext, max 80 karakter)
- Workspace adı + üretim tarihi (`Europe/Istanbul`, `dd.MM.yyyy HH:mm`)
- **3 metrik kutusu** (acil kutusu karar 2 ile kaldırıldı):
  1. Toplam kart sayısı
  2. Tamamlanan kart sayısı (`cards.completed = true`)
  3. Açık kart sayısı (`cards.completed = false AND cards.archived_at IS NULL`)
- İlerleme çubuğu (tamamlanan / toplam, yüzde rozetli)
- Stil: koyu header `#1f2937`, mavi vurgu `#3b82f6`, yeşil tamamlandı `#10b981`
  (eski Pusula `ProjectReportDocument.tsx` palet birebir korunur).

### Sayfa 2 — Üyeler

- 3 metrik kutusu:
  1. Toplam üye sayısı
  2. Üye başı ortalama aktif kart sayısı (atanmış + açık kartlar bazlı)
  3. Atanmamış kart sayısı (`card_members` boş + `cards.completed = false`)
- Üye kartları (her satır: avatar + ad-soyad + rol rozeti + e-posta + atanmış
  aktif kart sayısı).
- 0 üye edge case'i: "Bu panoda henüz üye yok" plaintext satırı.

### Sayfa 3 — Liste Sayfaları (her liste için ayrı sayfa)

- **Liste başlığı** (üst): liste adı + kart sayısı + tamamlanan/toplam mini bar
- **Kart tablosu** (her satır):
  - Tamamlandı sembolü (✓ / ○; karar 1)
  - Kart başlığı (max 80 karakter)
  - Atanan üye(ler) (avatar grubu, max 3 + "+N")
  - Bitiş tarihi (varsa; `dd MMM` TR locale)
  - Etiket noktaları (max 3 + "+N"; karar 3'ün label sayfası yerine satır içi)
- **Kart altında indented** (karar 8 + karar 7):
  - Checklist items: `└─ [✓] item başlığı` (tamamlanmışsa strikethrough), sol
    border `#e5e7eb` 2px
  - Son 5 yorum: `└─ <yazar> · <zaman>: <body_plaintext, max 200 char>`;
    yorum sayısı > 5 ise footer `… ve {count - 5} yorum daha`
- Stil: arşivli liste/kart `opacity: 0.6` + "Arşivli" rozeti
- 0 liste edge case'i: sayfa atlanır, Sayfa 4 doğrudan boş pano bilgisi olur
  (karar 12).

### Sayfa 4 — Yorumlar Özeti _(opsiyonel — kart sayısı > 0 ise)_

Eski Pusula 5. sayfasının kondansatörü; liste bölüm bölüm, kart kart, son 5
yorum tekrar listelenir (Sayfa 3'teki indented kısalmadan farklı: tam
plaintext, max 1000 char). Kart başına en az 1 yorum varsa render edilir, yoksa
sayfa atlanır.

> **Tasarım kararı (14C — DEM-294):** Sayfa 4 ayrı dosya olarak değil,
> `BoardReportDocument` içinde koşullu `<Page>` olarak render. Kart sayısı 0
> veya yorum sayısı 0 ise sayfa hiç eklenmez.

### Boş pano sayfası (karar 12)

- 0 liste **veya** tüm listelerde 0 kart durumunda:
  - Sayfa 1: Kapak normal (metrikler 0)
  - Sayfa 2: "Veri yok" bilgi sayfası — `EmptyState` benzeri: ikon (Inbox) +
    başlık (`reports.classic.empty.title`) + açıklama
    (`reports.classic.empty.description`)
- Sayfa 3 ve 4 hiç render edilmez. Üyeler sayfası kart sayısı 0 olsa bile
  render edilir (üye listesi anlamlıdır).

## 8.4 Alt İş Zinciri (14A → 14G)

```txt
              14A (önce-belge)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    14B (deps + font)       14D (data service)
        │                       │
        ▼                       │
    14C (component)             │
        │                       │
        └───────────┬───────────┘
                    ▼
                14E (route)
                    │
                    ▼
                14F (UI trigger)
                    │
                    ▼
                14G (perm + i18n + E2E)
```

| Alt iş   | Linear                                                             | Tab tipi      | Bağımlı     | Tahmin | Çıktı                                                                                                                                                       |
| -------- | ------------------------------------------------------------------ | ------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **14A**  | [DEM-291](https://linear.app/demirkol/issue/DEM-291)               | kontrol odası | —           | 0.5g   | Bu doc + 6 docs güncellemesi (16, 09, 02, 3×README) + 02-mvp-faz-plani.md Faz 14 In Progress + defter senkronu                                              |
| **14B**  | [DEM-292](https://linear.app/demirkol/issue/DEM-292)               | kod           | 14A         | 0.5g   | `apps/web/package.json` `@react-pdf/renderer ^4.3.0`; `apps/web/src/lib/pdf/fonts.ts` Roboto CDN register; Next.js externals/server-bundle ayarı doğrulama   |
| **14C**  | [DEM-294](https://linear.app/demirkol/issue/DEM-294)               | kod           | 14B         | 1g     | `apps/web/src/components/reports/classic-pdf/board-report-document.tsx` — 4 sayfa kategorili React-PDF JSX (eski `ProjectReportDocument.tsx` 915 satır)     |
| **14D**  | [DEM-293](https://linear.app/demirkol/issue/DEM-293)               | kod           | 14A         | 0.5g   | `packages/api/src/services/board-report-data.ts` `loadBoardForClassicReport(db, boardId, userId)` deep-fetch + `BoardReportData` tipi + karar 1 mantığı     |
| **14E**  | [DEM-295](https://linear.app/demirkol/issue/DEM-295)               | kod           | 14C + 14D   | 0.5g   | `apps/web/src/app/api/boards/[boardId]/report/route.ts` — GET handler, Better Auth session, permission, deep-fetch, `pdf().toBuffer()`, ASCII filename      |
| **14F**  | [DEM-296](https://linear.app/demirkol/issue/DEM-296)               | kod           | 14E         | 0.5g   | board-settings-dropdown'a "Rapor İndir" `DropdownMenuItem`; `use-download-board-report.ts` hook; web ✅ + mobil ✅ (karar 10 — Faz 13S WebView/share reuse) |
| **14G**  | [DEM-297](https://linear.app/demirkol/issue/DEM-297)               | kod           | 14F         | 0.5g   | viewer/member/admin/owner permission matrix testi; `reports.classic.*` i18n (TR/EN); Playwright `e2e/board-classic-pdf.spec.ts` download + 401/403 gating  |

> **Linear durumu:** epic [DEM-290](https://linear.app/demirkol/issue/DEM-290) + 7 alt issue (DEM-291..297) açıldı (Pusula projesi, "Faz 14 — Klasik Pano PDF Raporu" milestone). 14A `In Progress` (bu iş); 14B-14G `Sonraki Faz`. 14A `Done` olduğunda 14B-14G `Todo`'ya alınır.

## 8.5 Bağımlılık & Çakışma Notları

- **Faz 13 ile çakışma yok:** Klasik PDF subsystem'i Faz 13 raporlama
  altyapısının yanına yeni dosyalarda durur. Faz 13 yollarına dokunma sıfır:
  - Yeni: `apps/web/src/components/reports/classic-pdf/` (Faz 13 `reports/composer/`, `reports/panel/`, `reports/hooks/` ile çakışmaz).
  - Yeni: `packages/api/src/services/board-report-data.ts` (Faz 13 `packages/api/src/services/report-data/` ile çakışmaz — farklı dosya).
  - Yeni: `apps/web/src/app/api/boards/[boardId]/report/route.ts` (Faz 13 print sayfası `apps/web/src/app/(internal)/reports/print/[id]/page.tsx` ile çakışmaz).
- **Permission policy ortak (karar 6):** Faz 13F'te yazılan
  `canPerformReportAction('render', boardScope, ctx)` kararı klasik PDF için
  birebir reuse edilir. Yeni permission kodu yok.
- **i18n namespace ortak (karar 11):** `reports.classic.*` namespace Faz 13
  `reports.*` ile aynı dosyada (`apps/web/src/locales/tr|en/reports.json`).
  Çakışma yok — alt scope (`reports.classic`).
- **Mobil entegrasyon (karar 10):** Faz 13S'in `apps/mobile`'a kazandırdığı
  `FileSystem.downloadAsync` + `Sharing.shareAsync` deseni klasik PDF için
  yeniden kullanılır. Mobil ekran: board ayarları (`workspaces/[id]/boards/[boardId]`)
  header dropdown'una "Pano raporu indir" satırı.
- **Faz 11 (kart eki) attachment metadata tüketir:** Kapak metrikleri ve
  liste sayfaları `attachments` tablosundan eki sayısı okur (gösterim için
  değil — yalnız varlık kontrolü; karar 3 ile attachment özet sayfası yok).

## 8.6 Quality Gate (her alt iş kapanışında)

- TypeScript: `pnpm -F @pusula/web typecheck` + `pnpm -F @pusula/api typecheck` temiz.
- Vitest: ilgili paket testleri PASS (14D için service unit; 14G için
  permission matrix + filename pattern).
- Playwright: 14G'de `e2e/board-classic-pdf.spec.ts` PASS (download event +
  content-type + filename pattern + 401/403 gating).
- Build: `pnpm -F @pusula/web build` (Next.js production build) — `@react-pdf/renderer`
  server-side bundle başarısı doğrulanır.
- Lint: 0 yeni warning.
- DOM/PDF doğrulaması (14C + 14E): üretilen PDF Acrobat'ta açılır, 4 sayfa
  kategorisi görsel kontrol; TR karakterler doğru render (ş/ğ/ü/ç/ö/ı).

## 8.7 Tahmini Efor

**3-4 iş günü** (1 geliştirici sıralı). Paralel ekipte (~2 dev) ~2g
(14B-14C zinciri + 14D paralel; 14E-14G sıralı).

Dağılım: 14A 0.5g · 14B 0.5g · 14C 1g · 14D 0.5g · 14E 0.5g · 14F 0.5g · 14G 0.5g.

## 8.8 Kaçınılması Gerekenler

- Puppeteer kullanmak — Faz 13 ağır kaldırım için Puppeteer kullanıyor; klasik
  PDF tek-tık senkron olmalı (request handler'da `.toBuffer()`).
- Composer UI yazmak — klasik PDF parametresiz (sadece board id); kullanıcı
  seçenek görmez, tek tık download.
- Worker queue eklemek — request handler senkron; `notification_outbox`
  veya `report-render` queue **kullanılmaz**.
- MinIO'ya kaydetmek — PDF buffer doğrudan response body; storage yok,
  retention yok (Faz 13 `report_renders` ile karıştırma).
- `cards.archived_at IS NOT NULL` kartları PDF'e dahil etmek — arşivli kart
  rapor scope'unda değil (kullanıcı görmediği şey rapora girmez).
- Permission'ı yeniden yazmak — Faz 13'ün `canPerformReportAction` policy'sini
  reuse et (karar 6).
- i18n'i hardcode TR ile geçmek — `reports.classic.*` namespace zorunlu (karar 11).
- 422 ile boş pano'yu reddetmek — karar 12 "Veri yok" sayfasıyla PDF üretilir.

Her fazın teknik ayrıntısı [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md) §16.18'de;
domain kuralları [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md) §9.15'te.
