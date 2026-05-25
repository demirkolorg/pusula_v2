---
title: '09 — Raporlama Kuralları'
description: 'Faz 13 raporlama: micro-report sözleşmesi, scope adapter semantiği, katalog, preset, yetki matrisi, comparison delta semantiği, aggregation izin kuralları.'
aliases:
  - 'Raporlama Kuralları'
  - 'Report Domain Rules'
tags:
  - 'pusula'
  - 'domain/reports'
  - 'domain/permissions'
type: 'domain'
axis: 'domain'
status: 'active'
parent: '[[docs/domain/README|İş / Domain Kuralları]]'
related:
  - '[[docs/architecture/16-raporlama-mimarisi|Raporlama Mimarisi (teknik)]]'
  - '[[docs/process/07-faz-13-raporlama-plani|Faz 13 Raporlama Planı (süreç)]]'
  - '[[docs/domain/02-yetkilendirme-kurallari|Yetkilendirme Kuralları]]'
  - '[[docs/domain/05-aktivite-kurallari|Aktivite Kuralları]]'
updated: 2026-05-25
---

# 09 — Raporlama Kuralları

> Eksen: **iş / domain**. Faz 13 raporlama sisteminin **ürün/domain** kuralları:
> kim ne raporu görür, hangi micro-report hangi seviyede çalışır, comparison delta semantiği,
> auto-aggregation izin kuralları. Faz 14 (klasik pano PDF) — §9.15.
> Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md).
> Faz/iş listesi → [`../process/07-faz-13-raporlama-plani.md`](../process/07-faz-13-raporlama-plani.md) (Faz 13) ·
> [`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md) (Faz 14).

## 9.1 Çekirdek Kavramlar

- **Rapor (report)**: bir veya daha fazla "micro-report"ın belli bir scope ve filtre setiyle bir araya gelmesi.
- **Scope**: rapor hangi entity bağlamında çalışıyor — `card | list | board | workspace`.
- **Micro-report**: tek bir veri içgörüsünü (örn. "Aktivite zaman skalası", "Üye katkı dağılımı") render eden atomik birim.
- **Preset şablonu**: belli bir scope için sabit bir micro-report kombinasyonu (örn. `board.health` = `board-health-score + status-breakdown + aging-report + due-date-overview`).
- **Saved report**: kullanıcının ismiyle kaydettiği rapor (filtre + preset snapshot'ı).
- **Scheduled report**: bir saved report'a bağlı, belirli sıklıkta otomatik üretilip alıcılara email gönderilen yapı.
- **Ad-hoc render**: kaydetmeden tek seferlik üretim (PDF indir veya panelde gör).

## 9.2 Universal Micro-Report Sözleşmesi

Her micro-report **tek bir** TypeScript manifest'i uyar:

```ts
interface MicroReportManifest<TData> {
  id: string;
  i18nKey: string;
  category: 'activity' | 'status' | 'time' | 'structure';
  supports: ReadonlyArray<ReportScopeKind>;  // hangi scope'larda çalışır
  defaultLayout: { colSpan: 1 | 2 | 3 | 4; minHeight: number };
  supportsComparison: boolean;
  supportsCsv: boolean;
  supportsPngExport: boolean;
  emptyStateKey: string;

  query: ScopeAdapter<TData>;       // scope-dispatched data fetch
  Component: React.ComponentType;   // panel + print AYNI
  PrintComponent?: React.ComponentType;  // opsiyonel print override
  worksheetExport?(data): { columns, rows };  // opsiyonel Excel desteği
}
```

Anlam:

- `supports = ['card','list','board','workspace']` → universal (4 seviyede çalışır).
- `supports = ['board','workspace']` → seviye-spesifik (örn. burndown).
- `query.<level>?` yalnızca `supports` içindeki seviyeler için tanımlıdır.

## 9.3 Scope Adapter — Auto-Aggregation Semantiği

Bir micro-report üst scope'ta çalıştırıldığında, alt scope'ları **otomatik agregat eder**:

| Scope | Veri kaynağı |
|-------|--------------|
| `card` | sadece o kartın verisi |
| `list` | listedeki tüm kartların birleşimi |
| `board` | panodaki tüm liste+kartlar; **kullanıcının erişebildiği** liste/kart ile sınırlı |
| `workspace` | workspace'teki tüm pano+liste+kart; **kullanıcının erişebildiği** pano ile sınırlı |

Üst seviye query'leri composition'la kurulur (`inArray` subquery), permission filtresi alt seviyede uygulanır.

**Garanti:** filtre (üye/etiket/durum/tarih) tüm seviyelerde aynı semantiği taşır.

## 9.4 Restricted Scope (Bilgi Sızıntısı Engelleyici)

Kullanıcı bir üst-scope raporu istediğinde, kendisinin erişemediği alt entity'ler **rapora dahil edilmez**:

- Sayım dahil hiçbir veri dışlanan entity'lerden envelope'a girmez.
- Envelope'a `restrictedScope: { excludedKind, excludedCount }` eklenir.
- UI/PDF `<RestrictedScopeBanner>` ile bunu kullanıcıya bildirir: "Bu raporun 2 panosu görünürlüğünüz dışında — kısıtlı görünüm."
- Workspace admin için `restrictedScope = null` (her şeyi görür).

**Hiçbir bilgi sızıntısı yok:** dışlanan entity'lerin isimleri/sayısı bile rapora yansımaz; sadece "kısıtlı" bilgisi.

## 9.5 Yetki Matrisi

| Eylem | Card | List | Board | Workspace |
|-------|------|------|-------|-----------|
| **Generate (ad-hoc, kişisel)** | board:viewer | board:viewer | board:viewer | workspace:member |
| **Save** | board:admin | board:admin | board:admin | workspace:admin |
| **Update saved** | board:admin | board:admin | board:admin | workspace:admin |
| **Delete saved** | board:admin (kendisi) / workspace:owner | aynı | aynı | workspace:owner |
| **Schedule oluştur/sil** | board:admin | board:admin | board:admin | workspace:admin |
| **Render (mevcut saved)** | board:viewer | board:viewer | board:viewer | workspace:member |
| **Recipient seç (workspace üyesi)** | board:admin | board:admin | board:admin | workspace:admin |
| **Recipient harici email** | workspace:admin | workspace:admin | workspace:admin | workspace:owner |
| **JSON ham veri export** | — | — | workspace:admin | workspace:admin |

Kanonik kaynak: `@pusula/domain/reports/permission.ts`. Her tRPC procedure server-side kontrol eder ([`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) disiplini).

## 9.6 Micro-Report Katalog (30 micro-report)

| Kategori | id | Destek | Comparison | CSV | PNG |
|----------|----|--------|------------|-----|-----|
| **Aktivite & Üye** | `activity-timeline` | C/L/B/W | ✓ | ✓ | ✓ |
| | `activity-heatmap` | L/B/W | ✓ | ✓ | ✓ |
| | `activity-breakdown` | C/L/B/W | ✓ | ✓ | ✓ |
| | `member-contribution` | L/B/W | ✓ | ✓ | ✓ |
| | `member-workload` | L/B/W | ✗ | ✓ | ✓ |
| | `member-presence` | B/W | ✗ | ✓ | ✗ |
| **Durum & İlerleme** | `status-breakdown` | L/B/W | ✓ | ✓ | ✓ |
| | `checklist-progress` | C/L/B/W | ✓ | ✓ | ✓ |
| | `completion-rate` | L/B/W | ✓ | ✓ | ✓ |
| | `burndown` | B/W | ✓ | ✓ | ✓ |
| | `description-coverage` | L/B/W | ✓ | ✓ | ✓ |
| **Zaman & Vade** | `due-date-overview` | C/L/B/W | ✗ | ✓ | ✓ |
| | `aging-report` | L/B/W | ✓ | ✓ | ✓ |
| | `cycle-time` | L/B/W | ✓ | ✓ | ✓ |
| | `time-in-list` | C/L/B/W | ✗ | ✓ | ✓ |
| | `due-trend` | B/W | ✓ | ✓ | ✓ |
| **Yapı & İçerik** | `label-distribution` | L/B/W | ✓ | ✓ | ✓ |
| | `label-trend` | B/W | ✓ | ✓ | ✓ |
| | `comment-volume` | C/L/B/W | ✓ | ✓ | ✓ |
| | `attachment-summary` | C/L/B/W | ✗ | ✓ | ✓ |
| | `list-flow` | B/W | ✗ | ✓ | ✓ |
| | `wip-count` | B/W | ✓ | ✓ | ✓ |
| | `board-health-score` | B/W | ✓ | ✓ | ✗ |
| | `entity-summary` | C/L/B/W | ✗ | ✗ | ✗ |
| | `kpi-card` | C/L/B/W | ✓ | ✗ | ✗ |
| | `recent-changes` | C/L/B/W | ✗ | ✓ | ✗ |
| | `mention-graph` | B/W | ✗ | ✓ | ✓ |
| | `label-cooccurrence` | B/W | ✗ | ✓ | ✓ |
| | `list-balance` | B/W | ✓ | ✓ | ✓ |
| | `attachment-type-breakdown` | L/B/W | ✗ | ✓ | ✓ |

**Toplam: 30 micro-report.** Kategori dengeli (6/5/5/14).

C = card, L = list, B = board, W = workspace.

### 9.6.1 Veri Kaynakları (özet)

| Kategori | Tablo(lar) |
|----------|-----------|
| Aktivite & Üye | `activity_events`, `users`, `card_members`, `card_watchers` |
| Durum & İlerleme | `cards`, `checklists`, `checklist_items` |
| Zaman & Vade | `cards`, `activity_events` (move/complete event'leri için cycle time) |
| Yapı & İçerik | `labels`, `card_labels`, `comments`, `attachments`, `lists` |

## 9.7 Preset Şablon Katalog (19 preset)

| Seviye | Preset id | Başlık (TR) | İçerdiği micro-reports |
|--------|-----------|-------------|------------------------|
| **Card** (4) | `card.overview` | Kart Özeti | `entity-summary`, `kpi-card(activity)`, `checklist-progress`, `due-date-overview`, `recent-changes` |
| | `card.activity` | Kart Aktivite Raporu | `activity-timeline`, `activity-breakdown`, `comment-volume`, `attachment-summary` |
| | `card.checklist` | Kart Checklist Durumu | `checklist-progress`, `kpi-card(completion)`, `recent-changes` |
| | `card.due-and-aging` | Vade & Yaşlanma | `due-date-overview`, `time-in-list`, `aging-report` |
| **List** (4) | `list.wip-and-health` | WIP & Sağlık | `wip-count`, `status-breakdown`, `kpi-card(wip)`, `aging-report` |
| | `list.member-workload` | Liste Üye Yükü | `member-workload`, `member-contribution`, `activity-breakdown` |
| | `list.due-overview` | Vade Genel Bakış | `due-date-overview`, `time-in-list`, `aging-report` |
| | `list.activity` | Liste Aktivite | `activity-timeline`, `activity-heatmap`, `comment-volume` |
| **Board** (6) | `board.health` | Pano Sağlık Raporu | `board-health-score`, `kpi(active/completed/wip)`, `status-breakdown`, `aging-report`, `due-date-overview` |
| | `board.sprint-summary` | Sprint Özeti | `burndown`, `completion-rate`, `member-contribution`, `due-trend` |
| | `board.member-performance` | Üye Performans | `member-contribution`, `member-workload`, `activity-breakdown`, `member-presence` |
| | `board.due-and-risk` | Vade & Risk | `due-date-overview`, `aging-report`, `due-trend`, `cycle-time` |
| | `board.flow` | Pano Akışı | `list-flow`, `list-balance`, `cycle-time`, `wip-count` |
| | `board.label-distribution` | Etiket Dağılımı | `label-distribution`, `label-trend`, `label-cooccurrence` |
| **Workspace** (5) | `workspace.executive-summary` | Yönetici Özeti | `kpi(toplam aktivite/açık kart/geciken)`, `status-breakdown`, `completion-rate`, `due-trend` |
| | `workspace.board-comparison` | Pano Karşılaştırma | per-board mini KPI grid (özel widget), `board-health-score (multi)`, `activity-breakdown` |
| | `workspace.team-performance` | Ekip Performans | `member-contribution`, `member-workload`, `member-presence`, `activity-heatmap` |
| | `workspace.due-and-risk` | Vade & Risk | `due-date-overview`, `aging-report`, `due-trend` |
| | `workspace.activity-heatmap` | Aktivite Isı Haritası | `activity-heatmap`, `activity-breakdown`, `mention-graph` |

Her preset:

- `id`, `i18nKey`, `scopeKind`, `microReportIds[]`, `defaultFilters`, `defaultComparison`.
- Domain'de `packages/domain/src/reports/presets.ts` içinde tek bir registry.

> **Karar — 13C (2026-05-23):** §9.7'nin orijinal taslağı `list.wip-and-health`'a `wip-count`'u, `card.due-and-aging`'e `aging-report`'u listeliyordu; ama §9.6 yapısal matrisine göre `wip-count = B/W only` ve `aging-report = L/B/W only`. Yapısal kanonik §9.6 — `presets.ts` cross-validation testi (`packages/domain/src/reports/__tests__/presets.test.ts`) her preset'in micro-report'unun ilgili scope'ta `supports`'da olduğunu derleme/test zamanında doğrular (bozuk preset merge edilemez). 13C registry'sinde bu iki preset bu iki micro-report'u taşımaz; list-WIP sinyali `status-breakdown` + `kpi-card`, card-aging sinyali `time-in-list` ile karşılanır.

## 9.8 Filtre Seti

| Filtre | Davranış |
|--------|----------|
| **Tarih aralığı** | Preset: today / yesterday / last7d / last30d / last90d / thisMonth / lastMonth / thisQuarter / thisYear; veya custom (from-to). Default: `last30d`. Tüm zaman-bazlı metrikler bunu kullanır. |
| **Üye** | Multi-select user. `relations`: `['assignee', 'actor', 'watcher']` çoklu — hangi rolde olduğu seçilebilir. Default: tüm üyeler, tüm roller. |
| **Etiket** | Multi-select label. `mode: 'and' \| 'or'`. AND: hepsini içeren kartlar. OR: en az birini içeren. Default: OR. |
| **Durum & kapsam** | `cardStatus`: `['open', 'completed', 'archived']` çoklu (default `['open','completed']`). `includeArchivedLists`: boolean (default false). `listIds[]` (pano raporunda alt-liste seçimi). `boardIds[]` (workspace raporunda alt-pano seçimi). `checklistStatus`: `'all' \| 'completed' \| 'incomplete'`. |

Filtreler kanonik Zod schema: `@pusula/domain/reports/types.ts` (`reportFiltersSchema`).

## 9.9 Comparison (Period-Over-Period)

- Tek mod: **Önceki dönem** (`previousPeriod`). V1'de `sameLastYear` yok (post-MVP).
- Previous range = current range uzunluğunda kaydırılmış: `[from - duration, from]`.
- Her `supportsComparison: true` micro-report dual query'ye katılır.
- Delta formülü:
  - `delta_abs = current - previous`
  - `delta_pct = previous === 0 ? null /* "yeni" rozet */ : (current - previous) / previous * 100`
- **Eşik:** `|delta_pct| ≤ 1%` ise rozet "─" (nötr) — false-positive gürültü engellenir.
- UI: KPI'da delta rozeti (`↑`/`↓`/`─`/`yeni`); chart'larda noktalı önceki seri.

## 9.10 Persistence Modeli

| Tip | Tanım | Ömür |
|-----|-------|------|
| **Ad-hoc** | Composer'da üret + PDF indir + panelde gör, kaydetme | Render: 90g (retention worker); data: cache TTL |
| **Saved** | İsimle kaydedildi, workspace'in `/reports` sayfasında listelenir | Kullanıcı silene kadar (admin); her render `version` artırır, son 5 versiyon hep tutulur |
| **Scheduled** | Bir saved report'a bağlı + cadence + alıcılar | Schedule aktif olduğu sürece; deaktive olunca artık tetiklenmez ama saved silinmez |

## 9.11 Cadence Semantiği

Scheduled rapor 3 preset cadence destekler:

- `daily`: `{ hour, minute }` — workspace timezone'da her gün aynı saatte.
- `weekly`: `{ dayOfWeek (0-6, 0=Pazar), hour, minute }` — haftada bir.
- `monthly`: `{ dayOfMonth (1-31 veya 'last'), hour, minute }` — ayda bir; `'last'` = ayın son günü.

Custom cron expression desteği V1'de yok.

## 9.12 Stale Davranışı (Live Update)

- Panel açıkken sokete `report.invalidated` event'i gelirse `<StaleBadge/>` görünür.
- **Otomatik refresh YOK** — kullanıcı "Yenile" basana kadar mevcut görünüm korunur (chart zıplaması engellenir).
- "Yenile" → cache miss → fresh data → rozet kaybolur.
- PDF render anında o anki **dataset snapshot'ı** alınır; render sırasında veri değişse bile PDF'te tutarlı kalır.

## 9.13 Rich Text İçerik

- **`entity-summary` micro-report'unda**: kart açıklaması (Tiptap JSON) + yorumlar tam render (paragraf/heading/liste/code-block/mention/link).
- **Diğer micro-report'larda**: kart açıklaması / yorum geçtiğinde sadece plain text özet (Tiptap JSON → plain, max 200 karakter).
- PDF aynı kuralı uygular (Puppeteer tarayicide Tiptap HTML render).

## 9.14 Kaçınılması Gerekenler (domain)

- Aynı domain kuralını `@pusula/api` veya `apps/web/src/components/reports` içine kopyalamak — kaynak `@pusula/domain/reports`.
- Permission kontrolünü yalnızca frontend'e bırakmak (her tRPC procedure server-side, [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) disiplini).
- Restricted scope'ta dışlanan entity'lerin sayısını/adını rapora yansıtmak (bilgi sızıntısı).
- Micro-report'a hardcode Türkçe metin gömmek (CLAUDE.md "UI hardcode metin içermez" kuralı; her şey i18n key).
- Comparison delta'sını `previous = 0` durumunda sıfır bölmek (özel `null` → "yeni" rozeti).
- Cache'i kullanıcı arası paylaşmak (key'de `userId` zorunlu, çünkü permission filtreleme her kullanıcıda farklı).
- Saved report'a ayrı bir ACL eklemek — entity yetkisi (scope sahipliği) tek kaynak.
- Custom cron expression eklemek (V1: preset cadence yeterli).
- Rapor üretimini request handler'da senkron yapmak (**bu kural Faz 13 için** — Faz 14 klasik PDF deliberate olarak senkron; §9.15'e bak).

## 9.15 Klasik Rapor (Faz 14) — Pano PDF Kuralları

Faz 13'ün kapsamlı raporlama sistemine **paralel ve bağımsız** ikinci PDF
subsystem'i. Eski Pusula'nın `@react-pdf/renderer` tek-tık senkron PDF
özelliğinin v2'ye birebir uyarlaması. Pano başlık dropdown'unda "Rapor İndir"
→ bekle → PDF in.

Faz 14 plan + 12 karar kaydı + domain mapping →
[`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md).
Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md) §16.18.

### 9.15.1 Scope ve Parametreler

- **Scope sabit:** 1 PDF = 1 pano. Card / List / Workspace klasik rapor V1'de yok.
- **Parametre yok:** Kullanıcı filtre/preset seçmez; PDF her zaman pano'nun
  tam o anki snapshot'ını üretir.
- **Yetki:** Faz 13'ün `canPerformReportAction('render', boardScope, ctx)`
  policy'si birebir kullanılır (karar 6). viewer/member/admin matrisi hazır;
  yeni permission yok.
- **Boş pano (karar 12):** PDF her durumda üretilir. 0 liste veya tüm
  listelerde 0 kart ise Sayfa 2'den sonra "Veri yok" bilgi sayfası
  (`reports.classic.empty.title` + `reports.classic.empty.description`)
  eklenir. 422 ile reddetme yok.

### 9.15.2 "Tamamlanan Kart" Tanımı (karar 1)

- `cards.completed = true` (boolean; DEM-66/67 Faz 2.7 ile eklendi).
- `completed_at` (timestamptz) ve `completed_by` (user FK) PDF içeriğinde
  gösterilmez — yalnız sayım/işaretleme için kullanılır.
- "Son liste = Done konvansiyonu" / "tüm checklist tamam" / "Tamamlandı label"
  alternatifleri reddedildi.
- Kapak metriği: `tamamlananKart = cards.filter(c => c.completed).length`.
- Liste sayfası sembol: tamamlandı `✓`, açık `○` (component sabiti).

### 9.15.3 "Acil/İvedi" Göstergesi (karar 2)

- **Tamamen kaldırıldı.** Eski Pusula `Görev.ivedi` alanının v2 karşılığı yok
  (DEM-71 arşivli kart, DEM-100 background, vb. açıldı ama acil/öncelik
  bayrağı kurulmadı). PDF V1 sade kalır: kapakta acil kutusu yok, liste
  sayfalarında acil işareti yok.
- V2 backlog: "Acil" label konvansiyonu + opsiyonel render.

### 9.15.4 Yorum Clamp (karar 7)

- Liste sayfasında her kart altında **son 5 yorum** indented gösterilir
  (`└─ <yazar> · <zaman>: <body_plaintext, max 200 char>`).
- Yorum sayısı > 5 ise footer: `… ve {count - 5} yorum daha`.
- Yorum sayısı 0 ise satır hiç eklenmez (boş "yorum yok" yazısı yok).
- `body_plaintext` Faz 11 deseninden hazır (Tiptap JSON → plaintext
  denormalize); PDF render yeniden parse etmez.

### 9.15.5 Checklist Yerleşimi (karar 8)

- Kart satırının altında indented (`└─ [✓] item başlığı`) — ayrı checklist
  sayfası yok (karar 8'de reddedildi).
- Tamamlanmış item: `[✓]` + `text-decoration: line-through` + soluk renk.
- Açık item: `[ ]` + normal stil.
- Sol border `#e5e7eb` 2px ile görsel olarak kart bağlamına bağlanır.
- Checklist sayısı 0 ise satır eklenmez.

### 9.15.6 Arşivli Davranış

- **Arşivli kart**: `cards.archived_at IS NOT NULL` olan kartlar PDF'e
  **dahil edilmez** (kapak metrikleri ve liste sayfaları hesaplamasında
  yok sayılır). "Kullanıcı arşivde görmüyor" → rapora da girmiyor.
- **Arşivli liste**: `lists.archived_at IS NOT NULL` olan listeler ayrı sayfa
  olarak render edilmez. Liste sayısı ve kart sayımına dahil değil.
- **Arşivli kullanıcı (board member)**: Rol/üye sayfasında listelenmez
  (workspace üyesi inactive olursa); ama atanmış oldukları geçmiş kartların
  metadata'sında ad görünür (immutable).

### 9.15.7 Domain Mapping (Kanonik)

Eski Pusula domain → v2 mapping kanonik tablosu
[`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md) §8.2'de.
v2'de karşılığı olmayan eski Pusula alanları (`Görev.ivedi`, `ProjeDetay`
custom field, `Kategori`) PDF'ten **çıkarıldı** — alternatif önerilmedi.

### 9.15.8 Kaçınılması Gerekenler (klasik rapor domain)

- "Tamamlanan kart" için ikinci tanım eklemek (sadece `cards.completed`;
  checklist% / "Done" listesi / label alternatifleri reddedildi).
- Acil/öncelik göstergesi eklemek (V1 dışı; V2 backlog).
- Arşivli kart/listeyi PDF'e dahil etmek.
- Kullanıcıya parametre / filtre / preset göstermek (parametresiz; klasik
  PDF tek-tık).
- Faz 13'ün `report.*` router'ını veya `report_renders` tablosunu reuse
  etmek (klasik PDF buffer doğrudan response, persistence yok).
- Permission'ı yeniden tanımlamak (`canPerformReportAction` Faz 13F policy
  reuse).
- Boş pano için 422 reddi (karar 12 — "Veri yok" sayfası).
