---
title: '13 — UI Tasarım Dili'
description: "Pusula web UI'ının tasarım dili: design token sistemi (renk paleti / radius / shadow / spacing / tipografi), board-kolon-kart anatomisi, kart detay modalı yapısı, ortak desenler ve bileşen spec'leri. Faz 2.7'nin 'önce belge' çıktısı."
aliases:
  - 'UI Tasarım Dili'
  - 'Design Language'
  - 'Design Tokens'
tags:
  - 'pusula'
  - 'architecture/ui'
  - 'architecture/design-system'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]'
  - '[[docs/architecture/02-teknoloji-kararlari|Teknoloji Kararları]]'
  - '[[docs/architecture/05-board-mekanigi|Board Mekaniği]]'
  - '[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]'
  - '[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]'
updated: 2026-05-31
---

# 13 — UI Tasarım Dili

> Eksen: **tasarım / teknik**. Bu dosya, Faz 2.7 ([DEM-58](https://linear.app/demirkol/issue/DEM-58)) "önce belge" adımının çıktısıdır:
> mevcut web UI fonksiyonel ama görsel olarak ham ("HTML+JS yazdık, CSS unuttuk"); bu belge UI'ın **tasarım dilini** sabitler —
> design token'lar, board/kolon/kart anatomisi, kart detay modalı yapısı, ortak desenler ve `packages/ui` bileşen spec'leri.
> Uygulama Faz 2.7'nin alt işlerinde (`faz-bol 2.7` → 2.7A/2.7B/2.7C/2.7D) yapılır; **kod değişikliği bu belgede yok**.
>
> **Referans (karar):** karma — eski Pusula projesinin (`D:\projects\pusula`) layout/anatomi/token sistemi **baz** + Trello'dan
> birkaç olgun pattern. Eski projenin _tasarımı_ referans alınır, _kodu birebir kopyalanmaz_ (`@base-ui/react` getirmemek için
> shadcn/Radix üzerine yeniden kurulur).
>
> **Kararlar (kullanıcı seçimi, 2026-05-12):** (1) palet = **Trello-vari** — parlak mavi primary + canlı çoklu accent + 12-renk
> etiket paleti; board zemini açık mavi-gri (board-başına özelleştirme ileri faz). (2) yoğunluk = **compact-balanced** —
> kart `p-2`, kolon `w-72`, kolonlar arası `gap-3`. (3) font = **Inter** (next/font self-host). (4) rich text = **Tiptap**
> (headless editör; storage = Tiptap JSON — bkz. §13.5). (5) Faz 2.7'de eklenecek shadcn primitive'leri: `Tooltip` / `DropdownMenu`
> / `Checkbox` / `Tabs` (hepsi Radix tabanlı, "yalnız shadcn/ui" kuralı içinde).
>
> § içindeki OKLCH değerleri **önerilen** palettir; 2.7A implementasyonunda ince ayar yapılabilir. Bağlayıcı olan: token isimleri,
> token rolleri, board/kart/modal anatomisi ve bileşen sözleşmeleri.

## 13.1 Design token sistemi

Tailwind v4; tek `@import "tailwindcss"` + `@theme inline { ... }` (mevcut `packages/ui/src/styles/theme.css` yapısı). Renkler OKLCH;
`:root` light, `.dark` dark. Inline hex/rgb yasak — her renk token'dan gelir.

### Çekirdek renk token'ları

| Token                      | Light (≈)              | Rol                                                                                                                                                                                     |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--background`             | `oklch(1 0 0)`         | App-shell dışı genel sayfa zemini. Board zemini artık `--board-*` token'larıyla ayrı yönetilir; `boards.background = null` varsayılanı seçili indigo board zemini (`board-bg-default`). |
| `--card`                   | `oklch(1 0 0)`         | Kart, modal, popover yüzeyi (beyaz)                                                                                                                                                     |
| `--muted`                  | `oklch(0.97 0.01 240)` | Kolon zemini (`bg-muted/40` ile yarı saydam), modal sağ panel (`bg-muted/40 backdrop-blur`), disabled                                                                                   |
| `--muted-foreground`       | `oklch(0.50 0.02 250)` | İkincil metin, kart metadata, kolon meta                                                                                                                                                |
| `--foreground`             | `oklch(0.18 0.01 250)` | Birincil metin                                                                                                                                                                          |
| `--border`                 | `oklch(0.91 0.01 240)` | Kenarlıklar                                                                                                                                                                             |
| `--input`                  | `oklch(0.91 0.01 240)` | Form kenarlığı                                                                                                                                                                          |
| `--ring`                   | `oklch(0.55 0.16 245)` | Focus halkası (primary-türevli; görünür — a11y)                                                                                                                                         |
| `--primary`                | `oklch(0.56 0.17 275)` | Ekte seçili indigo/mor-mavi — buton/link, board üst bar vurgusu, progress dolgusu, aktif sekme                                                                                          |
| `--primary-foreground`     | `oklch(0.99 0 0)`      | Primary üstü metin                                                                                                                                                                      |
| `--secondary`              | `oklch(0.97 0.01 240)` | İkincil/ghost buton zemini                                                                                                                                                              |
| `--secondary-foreground`   | `oklch(0.20 0.01 250)` |                                                                                                                                                                                         |
| `--accent`                 | `oklch(0.96 0.02 245)` | Hover zemini (`hover:bg-accent`)                                                                                                                                                        |
| `--accent-foreground`      | `oklch(0.20 0.01 250)` |                                                                                                                                                                                         |
| `--success`                | `oklch(0.62 0.16 150)` | Yeşil — tamamlandı tik, dolu checklist progress, "onaylandı"                                                                                                                            |
| `--success-foreground`     | `oklch(0.99 0 0)`      |                                                                                                                                                                                         |
| `--warning`                | `oklch(0.78 0.14 75)`  | Amber — yaklaşan due (24–72 saat) noktası, dikkat                                                                                                                                       |
| `--destructive`            | `oklch(0.58 0.21 27)`  | Kırmızı — "GECİKTİ" rozeti/chip, sil, hata                                                                                                                                              |
| `--destructive-foreground` | `oklch(0.99 0 0)`      |                                                                                                                                                                                         |

`.dark`: aynı token seti, L değerleri yukarı/aşağı ayarlanır (background ≈ `oklch(0.18 0.01 250)`, card ≈ `oklch(0.22 0.01 250)`, foreground ≈ `oklch(0.97 0 0)`, primary ≈ `oklch(0.62 0.15 245)`); border `oklch(1 0 0 / 12%)`. Dark mode baştan desteklenir (token sistemi zaten her ikisini taşır).

### Etiket paleti (12 renk)

`--palet-{ad}` + her birinin `--palet-{ad}-foreground` eşi (kontrast garantili, light+dark). Adlar: `kirmizi`, `turuncu`, `sari`, `lime`, `yesil`, `sky`, `mavi`, `indigo`, `mor`, `pembe`, `gri`, `siyah`. Kullanım:

- **Kart üstü etiket chip'i / şerit:** solid — `bg-palet-{ad} text-palet-{ad}-foreground`
- **Picker / yumuşak gösterim:** soft — `bg-palet-{ad}/15 text-palet-{ad}`
- **Renk swatch (noktacık):** `size-2.5 rounded-full bg-palet-{ad}`
- **Kart kapak rengi / modal başlık çubuğu:** kartın kapak rengi seçildiyse o `--palet-{ad}` (modal başlık çubuğu o renge boyanır + `text-palet-{ad}-foreground`)

`@theme inline` bloğunda her `--palet-*` → `--color-palet-*` map'lenir (Tailwind `bg-palet-mavi` vb.). Mevcut `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/label-colors.ts` (yeni dosya açılmaz — bu var olan dosya) ham Tailwind isimleri (`green-500` vb.) yerine bu token seti üzerine kurulur (2.7A): `LABEL_SWATCH` değerleri `bg-palet-{ad}` literal'leri olur + `@pusula/domain` `LabelColor` (10 değer) → `@pusula/ui` `PaletteName` (12 ad) eşlemesi `LABEL_PALETTE` ile verilir. 12 `--palet-*` token'undan 10'u domain renklerine eşlenir; `indigo` ve `gri` ileride kapak rengi / yeni etiket renkleri için yedek kalır. `LabelChip` bileşeni `packages/ui`'de (`color: PaletteName`) — web tarafı domain rengini `LABEL_PALETTE` ile çevirir.

### Radius / shadow / spacing / tipografi

| Eksen             | Değer                                                                                                                                                                                                                | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--radius` (base) | `0.5rem` (8px)                                                                                                                                                                                                       | `-sm` = `calc(--radius - 2px)` = 6px, `-md` = `--radius`, `-lg` = `calc(--radius + 2px)` = 10px, `-xl` = `calc(--radius + 6px)` = 14px. Kart `rounded-md`, kolon `rounded-lg`, modal `rounded-xl`, chip `rounded-sm`/`rounded-full`                                                                                                                                                                                                                                                                   |
| Shadow            | `--shadow-card` (≈ `0 1px 2px oklch(0 0 0 / 0.06), 0 1px 1px oklch(0 0 0 / 0.04)`), `--shadow-card-hover` (biraz daha derin), `--shadow-popover` (md — dropdown/modal/popover), `--shadow-drag` (2xl — drag overlay) | Tailwind `shadow-xs/sm/md` token'larıyla hizalanır; kartlarda `shadow-card`, sürüklemede `shadow-drag`                                                                                                                                                                                                                                                                                                                                                                                                |
| Spacing           | Tailwind 4px ölçeği                                                                                                                                                                                                  | Kart `p-2`; kart-içi dikey `gap-1`/`gap-1.5`; kart başlık satırı `gap-1.5`; metadata satırı `gap-x-2 gap-y-1`; kolon `p-2`, başlık `p-2`, gövde `px-2 py-2 gap-2`; kolonlar arası `gap-3`; modal sol kolon `px-5 py-4 space-y-5`, section başlık `mb-2`                                                                                                                                                                                                                                               |
| Tipografi         | Font = **Poppins** (`--font-sans` → `--font-poppins`, next/font self-host; 2026-05-18'de Inter'den değişti — bkz. `02-teknoloji-kararlari.md` Karar kaydı)                                                                                                                                                                | Ölçek: `text-[10px]`/`leading-tight` (kart metadata), `text-xs` 12px (chip, kolon meta, aktivite satırı), `text-sm` 14px (kart başlığı `leading-snug`, gövde, kolon başlığı `font-semibold`), `text-base` 16px (modal section/yorum), `text-lg` 18px (modal kart başlığı `font-semibold`), `text-xl` 20px (sayfa başlığı `tracking-tight`). Ağırlıklar 400/500/600/700 (next/font ile yüklenenler). Kart başlığı `line-clamp-3`; section başlık `uppercase tracking-wide` `text-xs font-semibold text-muted-foreground` |

`packages/ui/src/styles/theme.css` hedef şekli (özet):

```css
@import 'tailwindcss';
@import 'tw-animate-css';

:root {
  --radius: 0.5rem;
  --background: oklch(0.96 0.02 240);
  --card: oklch(1 0 0);
  --muted: oklch(0.97 0.01 240);
  --foreground: oklch(0.18 0.01 250);
  --primary: oklch(0.56 0.17 275);
  --primary-foreground: oklch(0.99 0 0);
  --success: oklch(0.62 0.16 150);
  --success-foreground: oklch(0.99 0 0);
  --warning: oklch(0.78 0.14 75);
  --destructive: oklch(0.58 0.21 27);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.91 0.01 240);
  --input: oklch(0.91 0.01 240);
  --ring: oklch(0.55 0.16 245);
  /* ...muted-foreground, secondary*, accent*, popover*... */
  --palet-mavi: oklch(0.55 0.16 245);
  --palet-mavi-foreground: oklch(0.99 0 0);
  --palet-yesil: oklch(0.62 0.16 150);
  --palet-yesil-foreground: oklch(0.99 0 0);
  /* ...12 etiket rengi + -foreground eşleri... */
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.06), 0 1px 1px oklch(0 0 0 / 0.04);
  --font-sans: var(--font-poppins), ui-sans-serif, system-ui, sans-serif;
}
.dark {
  /* L değerleri ayarlı aynı set */
}

@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-palet-mavi: var(--palet-mavi); /* ...12 renk... */
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 6px);
  --font-sans: var(--font-sans);
}
```

## 13.2 Board ekranı anatomisi

### Board zemini & üst bar

- **Zemin:** `board-bg-*` sınıfları pano yüzeyini ve pano chrome token'larını birlikte belirler. `boards.background = null` varsayılanı `board-bg-default` ile ekte seçili indigo/mor-mavi board zemindir. İçerik alanı `flex-1 overflow-hidden p-4`. **Board-başına özelleştirilebilir background** Faz 2.7 follow-up #4 ([DEM-100](https://linear.app/demirkol/issue/DEM-100)) kapsamında eklenir: `boards.background` `text` nullable, kanonik format `'gradient:<ad>' | 'solid:<ad>'`; `null` varsayılan `board-bg-default` zemindir. Mutation: `board.update` mevcut procedure'üne `background?: string | null` alanı eklenir (rename ile aynı kapı — `canManageBoard`, admin-only); activity `board.background_changed`/`board.background_cleared` + `boards.version + 1` + `realtime_events` aynı tx'te. **Faz 8.X ([DEM-242](https://linear.app/demirkol/issue/DEM-242) önce-belge, 2026-05-20):** üçüncü kanonik varyant `image:<attachmentId>` eklenir — user-uploaded board background görseli. `attachments` tablosu `kind='board_background'` satırlarına işaret eder (Faz 11 altyapısı paylaşılır); allowlist `JPEG/PNG/WebP/AVIF`, max `10 MiB`, animasyonlu GIF reddedilir. Image varyantında board zeminine MinIO presigned GET URL'i `background-image` olarak basılır + üstüne **`board-bg-image-overlay`** token'ı `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)` overlay'i header/topbar okunaklılığını korur (Trello deseni). Header/topbar yüzeyleri image üstünde ek alpha taşır (gradient/solid renk eşleştirme yerine yarı-saydam koyu blok kontrast kurar). Unsplash kapsam dışı (V1).

  **DEM-100 gradient token listesi ve class haritası (kesin):**

  | Değer               | CSS token                | Utility class                | Türkçe ad     |
  | ------------------- | ------------------------ | ---------------------------- | ------------- |
  | `gradient:sunset`   | `--bg-gradient-sunset`   | `board-bg-gradient-sunset`   | Gün batımı    |
  | `gradient:ocean`    | `--bg-gradient-ocean`    | `board-bg-gradient-ocean`    | Okyanus       |
  | `gradient:rainbow`  | `--bg-gradient-rainbow`  | `board-bg-gradient-rainbow`  | Gökkuşağı     |
  | `gradient:forest`   | `--bg-gradient-forest`   | `board-bg-gradient-forest`   | Orman         |
  | `gradient:lavender` | `--bg-gradient-lavender` | `board-bg-gradient-lavender` | Lavanta       |
  | `gradient:sunrise`  | `--bg-gradient-sunrise`  | `board-bg-gradient-sunrise`  | Gündoğumu     |
  | `gradient:midnight` | `--bg-gradient-midnight` | `board-bg-gradient-midnight` | Gece yarısı   |
  | `gradient:mint`     | `--bg-gradient-mint`     | `board-bg-gradient-mint`     | Nane          |
  | `gradient:aurora`   | `--bg-gradient-aurora`   | `board-bg-gradient-aurora`   | Kuzey ışığı   |
  | `gradient:coral`    | `--bg-gradient-coral`    | `board-bg-gradient-coral`    | Mercan        |
  | `gradient:lagoon`   | `--bg-gradient-lagoon`   | `board-bg-gradient-lagoon`   | Lagun         |
  | `gradient:ember`    | `--bg-gradient-ember`    | `board-bg-gradient-ember`    | Kor           |
  | `gradient:blossom`  | `--bg-gradient-blossom`  | `board-bg-gradient-blossom`  | Cicek         |
  | `gradient:meadow`   | `--bg-gradient-meadow`   | `board-bg-gradient-meadow`   | Cayir         |
  | `gradient:dusk`     | `--bg-gradient-dusk`     | `board-bg-gradient-dusk`     | Alacakaranlik |
  | `gradient:pearl`    | `--bg-gradient-pearl`    | `board-bg-gradient-pearl`    | Inci          |

  **Düz renk haritası:** `solid:<ad>` → `board-bg-solid-{ad}`; `ad ∈ BOARD_BACKGROUND_SOLID_COLORS`. Liste, kart kapak rengiyle ortak 12 paleti (`kirmizi`, `turuncu`, `sari`, `lime`, `yesil`, `sky`, `mavi`, `indigo`, `mor`, `pembe`, `gri`, `siyah`) ve pano-özel beyaz/nötr varyantları (`beyaz`, `kirik-beyaz`, `fildisi`, `buz-beyazi`, `gumus`) içerir. Pano-özel varyantlar kart kapak rengi olarak kullanılmaz. Board yüzeyi light/dark tema için `color-mix()` ile ayrı tonlanır. `boardBackgroundClass(background)` utility'si gradient/düz renk class'larını tek yerden döndürür, bilinmeyen değerlerde `board-bg-default` fallback'ine düşer.

- **Pano chrome token'ları (DEM-111):** `board-bg-*` sınıfı `--board-surface-bg`, `--board-topbar-bg`, `--board-shell-bg`, `--board-chrome-fg` ve `--board-shell-border` değişkenlerini set eder. Light modda `BoardTopBar` seçilen renge yakın koyu, AppShell header daha koyu tonu kullanır; dark modda `BoardTopBar` renge yakın koyu kalır, AppShell header ise siyaha daha yakın tonlanır. Gradient preset'leri de `.dark` altında ayrı gradient token'larına sahiptir.
  - **Pano kanvası metin token'ı (`--board-canvas-fg`):** Şeffaf pano yüzeyine **doğrudan** oturan metin (örn. `QuickNotesPanel` gövdesindeki yükleniyor/hata/boş durum yazıları) için. `--board-chrome-fg` her zaman beyazdır (koyu `bg-board-topbar`/`bg-board-shell` üzerinde kullanılır); kanvas metni ise pano arka planının üzerinde durduğundan `oklch(from var(--board-surface-bg) …)` ile **render edilen** yüzey aydınlığına göre açık/koyu seçilir → açık panolarda koyu, koyu panolarda beyaz; her iki tema modunda okunabilir. Soluk varyant `--board-canvas-fg-muted` (token'ın %72 opaklığı). `bg-card` yüzeyindeki bileşenler (composer, not satırları) bu token'ı kullanmaz, tema `foreground` renklerinde kalır.
- **Board üst barı (`BoardTopBar`):** sticky, `h-13 sm:h-14 flex items-center gap-3 px-4 bg-board-topbar text-[color:var(--board-chrome-fg)]`.
  - Sol: `BoardIdentity` — board ikonu/renk noktası + "Pano" etiketi (`text-[10px] uppercase text-muted-foreground`) + board adı (`text-sm font-semibold truncate`) + ⭐ favori butonu (`StarIcon`; favori altyapısı Faz 8 / [DEM-57](https://linear.app/demirkol/issue/DEM-57) — şimdilik görsel toggle veya gizli).
  - Orta: `BoardViewSwitch` — "Pano / Liste / Etiketler" sekme grubu (`inline-flex rounded-md border bg-secondary p-[3px]`; aktif sekme `bg-card shadow-xs`). "Liste" ve "Etiketler" görünümleri Faz 2.7 kapsamında **değil** — sekme placeholder/disabled veya yalnız "Pano" görünür.
  - Sağ: `BoardActions` — `Paylaş` (board linkini panoya kopyalar; kalıcı paylaşım linki/izin yönetimi ileri faz) · `SearchIcon` (board içi arama → Faz 6.5, şimdilik gizli/disabled) · `ActivityIcon` (board activity → ileri faz) · `Etiketler` `DropdownMenu` (`TagsIcon` chrome ikon butonu; tek panel: board etiket paleti) · `Üyeler` `DropdownMenu` (`UsersIcon`; sekme içerikleri: Üyeler / Davetler / Talepler) · `Pano ayarları` `DropdownMenu` (`Settings2Icon`; sekme içerikleri: Arka plan / Pano işlemleri). Eski `Davet et / paylaş` birleşik butonu ve ayrı `⋮` board menüsü yoktur; rename/archive/restore aynı işi tekrar eden ikinci yüzey oluşturmadan `Pano işlemleri` altında toplanır.
  - **Üyeler ↔ etiket ↔ ayarlar ayrımı (DEM-154):** Üyelik bağlamı (üye listesi, gönderilen davetler, erişim talepleri) "ayar" işiyle (arka plan, board lifecycle) aynı yüzeyde karışmaz — ayrı `Üyeler` butonu taşır. Etiket paleti de aynı mantıkla ayar dropdown'undan çıkarılıp kendi `Etiketler` ikon-butonuna (`BoardLabelsDropdown`) taşınmıştır. `Üyeler` ve `Etiketler` butonları tüm rollere görünür (liste/palet herkese açık; düzenleme + Davetler/Talepler sekmeleri admin'e gate'li). Bekleyen erişim talebi varsa `Üyeler` butonu üstünde kırmızı sayı rozeti (`Badge variant="destructive"`, `9+` taşması; yalnız admin — `board.accessRequests.list` sayısı) ve "Talepler" sekme tetikçisinde aynı sayı rozeti gösterilir.

### Kolon (liste)

```
<section class="w-72 shrink-0 flex max-h-full flex-col rounded-lg bg-[color:var(--board-list-bg)]">
  <header class="flex shrink-0 items-center justify-between gap-1 p-2">
    <div> liste adı (text-sm font-semibold truncate) · kart sayısı (text-muted-foreground text-xs) </div>
    <div> ShieldIcon (→ board üyeleri) · PanelLeftCloseIcon (daralt — ileri faz) · ⋮ DropdownMenu (yeniden adlandır / liste rengini değiştir / arşivle) </div>
  </header>
  <div class="pusula-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2"> {kartlar} </div>
  <footer class="shrink-0 p-2"> AddCardForm | <Button variant=ghost size=sm class="w-full justify-start text-muted-foreground"> + Kart ekle </Button> </footer>
</section>
```

- Arşivli liste: `--board-list-archived-bg` (yarı saydam, kolon yüzeyinin söndürülmüş hâli), başlıkta arşiv ikonu; içi salt-okunur (yeni kart eklenemez — backend kapısı + UI). Aktif kolonlar görünür kenarlık taşımadığı için arşivli kolonun ayrımı yalnız zemin tonu + ikon ile verilir.
- Sona: "+ Liste ekle" — `w-72 shrink-0 rounded-lg border border-dashed border-[color:var(--board-list-border)] bg-[color:var(--board-list-add-bg)] p-2` içinde ghost buton / inline form; hover `--board-list-add-bg-hover` kullanır.
- Drag (Faz 3 — placeholder spec): sürüklenen kolon `shadow-drag`, bırakılacak yer `w-72 h-32 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5`.
- **Scroll & scrollbar ([DEM-88](https://linear.app/demirkol/issue/DEM-88) — 2026-05-13):** kolon `max-h-full` (parent strip yüksekliği kadar; içerik az ise içeriği kadar kompakt durur — `h-full` değil) + 3-segment (header `shrink-0` / cards area `flex min-h-0 overflow-y-auto pusula-scrollbar` / footer `shrink-0`); cards area `flex-1` taşımaz (boş kolonlar viewport-tall görünmesin). Strip `items-start` ile kolonlar top-aligned; strip kendisi `overflow-x-auto overflow-y-hidden` (yatay scroll yalnız). Custom scrollbar utility `.pusula-scrollbar` (`packages/ui/src/styles/theme.css` `@layer utilities` — 6px thin, transparent track, soft OKLCH thumb); token'lar `--scrollbar-thumb` + `--scrollbar-thumb-hover` (light + dark). Wired chain → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.4 "Layout & scroll davranışı".

#### Renkli kolon (DEM-98)

- **Model:** `lists.color` nullable. `null` ve renkli listeler aynı stabil kolon yüzeyini kullanır: container `bg-[color:var(--board-list-bg)]` (görünür kenarlık yok — Trello görünümü; kolon `bg` ile yüzer), arşivli liste `--board-list-archived-bg`, hover yüzeyleri `--board-list-bg-hover`. Renk seçilince tüm kolon solid `bg-palet-{ad}` olmaz; renk yalnız üstteki `data-list-accent` şeridi ve varsayılan ikon accent'i olarak görünür. Başlık/metin `text-card-foreground`, ikincil metinler `text-muted-foreground` kalır. Kartlar içeride opak `--board-card-bg` token'ıyla kalır (kenarlık yok — Trello görünümü; kart `bg + shadow` ile yüzer); kart içeriği liste rengine karışmaz.
- **Picker:** liste header ⋮ menüsünde `PaletteIcon` + "Liste rengini değiştir" `DropdownMenuSub` tetikleyicisi. İçerik shadcn `Popover`/submenu içinde 2×5 grid (`grid-cols-5 gap-1.5`): 10 `LIST_COLORS` (`yesil/sari/turuncu/kirmizi/mor/mavi/sky/lime/pembe/gri`) swatch butonu `size-9 rounded-md bg-palet-{ad} border border-border/30 hover:ring-2 ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring`; seçili renkte `CheckIcon size-4 text-palet-{ad}-foreground`.
- **Clear:** grid altında ghost `Button` (`w-full justify-center`) "Rengi kaldır"; mevcut renk `null` ise disabled. Tüm metinler `apps/web/src/lib/strings.ts` (`board.list.colorPicker.*`) üzerinden gelir; hardcode yok.
- **Mutation:** swatch click `useOptimisticBoardListMutation(api.list.update)` ile `{ listId, color, clientMutationId }`; clear `{ listId, color: null, clientMutationId }`. Aynı renge tıklama UI tarafında no-op olabilir; backend de idempotent no-op'tur. Realtime `list.updated` `color` payload'ı ikinci tarayıcı cache'ine işler.

#### Liste ikonu ve ikon rengi (DEM-109)

- **Model:** `lists.icon` ve `lists.icon_color` nullable. Yeni listeler `null`/`null` döner; `icon = null` kolon başlığında ikon olmadığını ifade eder. `iconColor = null`, ikon varken özel renk seçilmediğini ve ikonun kolon başlığındaki varsayılan/metin rengini kullanacağını belirtir. `icon` kaldırıldığında `iconColor` da `null` olur.
- **Başlık render:** ikon varsa liste başlığının solunda `size-3.5 shrink-0` lucide ikon render edilir; başlık metni ve kart sayısı mevcut satır düzenini korur. İkon rengi seçiliyse `text-palet-{ad}` kullanılır; seçili değilse kolon başlığının current text rengine uyar. İkon yoksa başlık önceki gibi yalnız metinle başlar.
- **Picker:** liste header ⋮ menüsünde ikonlu bir `DropdownMenuSub` tetikleyicisi "Liste ikonunu değiştir". İçerik iki bölümden oluşur: 4 sütunlu kaydırılabilir ikon grid'i (`LIST_ICONS`, sabit ve kontrollü lucide ikon kümesi — temaya göre gruplu sıralı; küme büyüdüğü için grid `max-h` + `overflow-y-auto` taşır) ve ikon seçiliyken 12-renk ikon rengi grid'i (`LIST_ICON_COLORS`, `--palet-*` tokenları). Seçili ikon/renk `CheckIcon` ile işaretlenir; ikon yokken renk grid'i disabled/soluk kalır.
- **Reset:** "İkon rengini sıfırla" yalnız `iconColor: null` gönderir ve ikon kalır; mevcut renk `null` ise disabled. "İkonu kaldır" `icon: null` gönderir, server ve optimistic cache `iconColor`'ı da `null` yapar; mevcut ikon `null` ise disabled. Böylece kullanıcı yalnız rengi default'a döndürebilir veya hem ikon hem rengi kaldırarak tam ikonsuz varsayılana dönebilir.
- **Mutation:** ikon seçimi `useOptimisticBoardListMutation(api.list.update)` ile `{ listId, icon, clientMutationId }`; ikon rengi `{ listId, iconColor, clientMutationId }`; ikon kaldırma `{ listId, icon: null, clientMutationId }`; renk sıfırlama `{ listId, iconColor: null, clientMutationId }`. Realtime `list.updated` `icon`/`iconColor` payload'ları ikinci tarayıcı cache'ine işler. Tüm metinler `apps/web/src/lib/strings.ts` (`board.list.iconPicker.*`) üzerinden gelir; hardcode yok.

### Kart (`CardItem`)

`<article class="bg-[color:var(--board-card-bg)] rounded-md p-2 text-sm shadow-card hover:shadow-card-hover group/kart cursor-pointer">` — tıklayınca kart detay modalı (`?card=<id>`). Kartta görünür border **yok** (Trello görünümü — 2026-05-15); kart yalnız `--board-card-bg` üstüne `shadow-card`/`shadow-card-hover` ile yüzer. (Önceki `--board-card-border`/`--board-card-border-hover` token'ları kaldırıldı.) İçerik sırası (yalnızca ilgili veri varsa render):

1. **Kapak görseli** (varsa) — `-mx-2 -mt-2 mb-1.5 h-24 w-[calc(100%+1rem)] rounded-t-md object-cover`.
2. **Etiket chip'leri** (varsa) — `flex flex-wrap gap-1 mb-1.5`; her chip `LabelChip` solid (`bg-palet-{ad} text-palet-{ad}-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium`; adı varsa ad, yoksa kısa renkli bar `h-2 w-8`). Kapak görseli yoksa ve etiket varsa chip'ler kartın görsel "rengini" verir (Trello hissi).
3. **Başlık satırı** — `flex items-start gap-1.5`: solda `CardCompleteToggle` (kartta `opacity-0 group-hover/kart:opacity-100`, tamamlanmışsa hep görünür: `bg-success` tik), başlık `line-clamp-3 font-medium leading-snug` (tamamlanmış kart → `line-through text-muted-foreground`). _(Durum — güncel 2026-05-13: kart-seviyesi "tamamlandı" backend'i ([DEM-66](https://linear.app/demirkol/issue/DEM-66) — `cards.completed`/`completedAt`/`completedBy` + `card.complete`/`card.uncomplete`) ve kapak rengi backend'i ([DEM-67](https://linear.app/demirkol/issue/DEM-67) — `cards.coverColor` + `CARD_COVER_COLORS`) `checklist_items.completed`'tan **bağımsız** (bkz. [`03-backend.md`](03-backend.md) Faz 2.7, [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) invariant 15) — ve **DEM-74 (2.7C-2)'de UI'ye wire edildi**: `CardCompleteToggle` kartta+modalda → `card.complete`/`card.uncomplete`; kart kapak rengi şeridi (kapak görseli yoksa `coverColor` varsa) `-mx-2 -mt-2 mb-1.5 h-3 rounded-t-md bg-palet-{ad}`; modal başlık çubuğu `coverColor` seçiliyse `bg-palet-{ad}` (§13.3); meta chip satırında kapak rengi picker (12-renk `--palet-*` → `card.update({coverColor})`). `CardCompleteToggle` bileşeni `packages/ui`'de; modaldaki checklist madde checkbox'larında da kullanılır.)_
4. **Metadata satırı (`CardMetaRow`)** — `mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground`; sırayla, varsa: due chip (`CalendarIcon` + tarih; gecikmiş → `bg-destructive/12 text-destructive rounded-sm px-1 py-px font-medium` + "GECİKTİ" rozeti `bg-destructive text-destructive-foreground text-[9px] uppercase tracking-wide px-1`; 24–72 saat içinde → `--warning` nokta `size-1.5 rounded-full`) · açıklama-var (`AlignLeftIcon`, açıklama doluysa) · checklist progress (`CheckSquareIcon` + `tamamlanan/toplam`; tamsa `text-success`) · yorum sayısı (`MessageSquareIcon` + n) · üye avatarları (son ~3 `Avatar size-xs` `-space-x-1` üst üste + "+N"). _(Veri: `board.get` Faz 2.7B'de bu sayaçları additive döndürür — `checklistTotal`/`checklistDone`, `commentCount`, `members[]`; bkz. [`03-backend.md`](03-backend.md). **Ek sayısı `PaperclipIcon` chip'i bu fazda yok** — attachment/ek Faz 8.)_
5. **Drag preview (`CardDragPreview`)** — sürükleme esnasında cursor'la birlikte gezen, kartın sadeleştirilmiş kopyası: `rotate-2 shadow-md` opaque kart + cover şerit + başlık + temel meta chip'leri (tooltip yok — detached React root). **Body-portal pattern**: `position: fixed; pointer-events: none; z-index: 9999` body element'ına `createRoot` ile mount edilir, cursor takibi DOM `style.transform = translate(...)` ile imperative — HTML5 drag-image bitmap **kullanılmaz** (`disableNativeDragPreview` 1×1 transparent gif → browser preview görünmez), bu sayede alpha/soft-shadow/rotated-corner sızıntı bug'larından kaçınılır. Sürüklenen kartın orijinali "**rüya modu**"na geçer: outer `<article>` `border border-dashed border-primary/60 bg-primary/5` (aktif drop hedefi placeholder), iç wrapper `invisible` (boyut korunur, layout shift yok). Eski Pusula `dnd-kit DragOverlay` deneyiminin Pragmatic DnD'ye uyarlaması. (DEM-87; wiring → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.8.)
6. **Kart context menu ([DEM-101](https://linear.app/demirkol/issue/DEM-101))** — karta sağ tıklayınca `ContextMenu` açılır; sol tık yine `?card=<id>` kart detay modalını açar. Kart üzerinde ayrı hover `Taşı` / `Arşivle` butonları bulunmaz; mevcut taşıma ve arşivleme aksiyonları bu menüye taşınır. Menü sırası: **Kapak rengi** (12 `CARD_COVER_COLORS`, seçili renge check, "Rengi kaldır"), **Etiketler** (board etiketleri; seçili etikete check; toggle `card.labels.{add,remove}`), **Üyeler** (board üyeleri; "Yetkililer" terimi kullanılmaz; seçili kullanıcıya check; hızlı atama `assignee` rolüyle yapılır), **Son tarih** (bugün/yarın/bu hafta sonu/gelecek hafta hızlı seçimleri; `Tarih` burada domain olarak `due_at` yani son tarih anlamındadır; "Tarihi kaldır"), **Taşı** (aktif listeler; mevcut DnD `moveCardToListEnd`/`card.move` akışı), **Arşivle** (onay dialog'u ile `card.archive`). **Sil** bu işin kapsamına alınmaz; card hard-delete domain/backend contract'ı yoktur ve sistem arşivleme modelini korur.

### Filter bar & loading

- **Filter bar** (board ekranı üstünde — DEM-54'ten var, cilalama): etiket çipleri (`LabelChip` soft; aktif → `ring-2 ring-primary/60` veya solid) + "arşivli listeleri göster" toggle. `flex flex-wrap items-center gap-2 rounded-md border bg-card p-2`. Etiket + tarih filtreleri board üst barında `FilterIcon` açılır menüsünde toplanır (`BoardFilterMenuContent`).
- **"Bana atanan kartlar" toggle** (board üst barı — `UserCheckIcon` chrome ikon butonu, filtre menüsünün solunda): tek tıkla aç/kapa; aktifken board yalnız oturum açan kullanıcının `assignee` rolüyle üye olduğu kartları gösterir (yalnız izleyici/`watcher` olduğu kartlar **dahil değil**). Etiket/tarih menüsünden ayrı, **kişiye özel** bir filtredir (paylaşılan menü durumuna yazılmaz); `aria-pressed` ile durum bildirilir, aktifken `bg-white/15` vurgusu kalır. Saf filtre yardımcıları `board-filter.ts` (`cardAssignedToUser` / `filterCardsByAssignee`); etiket + tarih filtreleriyle birlikte (AND) uygulanır.
- **Loading skeleton:** kolon iskeleti (`w-72 rounded-lg border bg-muted/40` + 3-4 kart iskeleti `h-16 rounded-md bg-muted animate-pulse`).

## 13.3 Kart detay modalı anatomisi

shadcn `Dialog` (board arkada; `?card=<id>` derin link — Faz 2.5 kararı [DEM-49]). Boyut: `w-[min(960px,92vw)] h-[min(85vh,800px)] flex flex-col gap-0 overflow-hidden p-0`.

### Başlık çubuğu (`CardModalHeader`)

`flex items-center justify-between gap-2 px-4 py-2.5 border-b` — kartın kapak rengi seçilmişse çubuk `bg-palet-{ad} text-palet-{ad}-foreground` (kenarlık yok); yoksa `bg-background border-b`.

- Sol: `ListIcon` + breadcrumb (`pano adı / liste adı`, `text-xs`, kapak renkli modda `text-current/80`).
- Sağ: `BellIcon` (takip — ileri faz) · `LinkIcon` (derin linki kopyala) · ⋮ `DropdownMenu` (taşı / kopyala / arşivle — taşı/kopyala ileri faz) · ayraç · `X` kapat (`size-sm` ghost; kapak renkli modda `hover:bg-current/15`).

### İçerik — iki kolon

`grid grid-cols-1 md:grid-cols-[1fr_360px] overflow-hidden flex-1`.

**Sol kolon** — `flex flex-col min-h-0 min-w-0 overflow-hidden` (2026-05-25 UX rafine — tek scroll alanı yerine üç katmanlı: sabit başlık + sabit alert satırı + iki bağımsız scroll'lu sütun):

- **Üst sabit alan** (`shrink-0` — eski `sticky top-0` çözümünün yerine; modal kaydırmadığı için sticky'ye gerek yok), `px-4 pt-4 pb-2 sm:px-6 sm:pt-5 space-y-2`:
  - `CardCompleteToggle` (yuvarlak, hep görünür) + başlık inline-edit (`textarea`, `text-lg font-semibold leading-tight`, `field-sizing-content`) + `CardReportsButton` + `ShareDialog`.
  - **Meta chip satırı (`CardModalMetaChips`)** — `flex flex-wrap items-center gap-1`; chip shell `group inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground`: `ShieldIcon`+üye sayısı (→ üye picker `Popover`) · `CalendarIcon`+due (→ date picker; gecikmiş kırmızı + "GECİKTİ" rozeti, soon amber nokta) · `TagIcon`+etiket sayısı (→ etiket picker) · `PaletteIcon`+kapak rengi (→ renk picker) · `+` ekle.
- **Sabit alert satırı** (`shrink-0 px-4 sm:px-6 pb-2` — yalnız modal-geneli `completeError` / `archiveCard.isError` varsa render).
- **AÇIKLAMA + KONTROL LİSTESİ — yan yana iki sütun + bağımsız scroll**: kalan alanı `grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[22px] overflow-hidden px-4 pb-4 sm:px-6 sm:pb-5` doldurur (sol sütun AÇIKLAMA, sağ sütun KONTROL LİSTESİ; sidebar açık/kapalı ve viewport boyutundan bağımsız sabit — mobilde de yan yana, kullanıcı kararı). Her grid hücresi **panel-card** olarak sarmalanır: dış wrapper `flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/30` (iki bölümün "yan yana iki ayrı panel" olduğu görsel olarak ayırt edilsin diye — 2026-05-31). **Panel anatomi (2026-05-31 — FE-2026-05-31-002, revize 2026-05-31):** her panel iki yatay parçaya bölünür — **(a) Sabit üst kabuk** `SectionHeader className="mb-0 shrink-0 border-b bg-muted/50 px-4 py-2.5"` (scroll'un dışında; `bg-muted/50` panel-card iç tonundan vurgulu, `border-b` ile ayrım; `py-2.5` ≈ 42px toplam yükseklik — `sticky top-0 + backdrop-blur` ilk versiyonunun [reddedildi: scroll'dan önce header üst boşluk bırakıyordu + dikey alan harcıyordu — kullanıcı geri bildirimi 2026-05-31] yerine geçti); **(b) Scroll gövde** `<div className="pusula-scrollbar flex min-h-0 flex-1 flex-col gap-* overflow-y-auto p-4">` — kendi içinde scroll yapar, padding kabuğu etkilemez. Sütunlar `items-stretch` ile grid yüksekliğini alır; uzun checklist sağ sütunda gövde içinde scroll yapar, üst kabuk yerinde durur. `pusula-scrollbar` utility'si (`theme.css` `@layer utilities`) 6px ince thumb + transparent track + token bazlı (`--scrollbar-thumb`/`--scrollbar-thumb-hover`) renkler ile light/dark teması için yumuşak görünüm sağlar — modal sağ paneldeki `TabsContent` scroll alanı da aynı utility'yi paylaşır. Modal-tamamı için scroll çıkmaz.
  - **AÇIKLAMA (sol sütun)** — Sabit üst kabuk: `SectionHeader` `AlignLeftIcon` + "AÇIKLAMA" + **aksiyon slot'u (2026-05-31 — FE-2026-05-31-002):** "Kopyala" (`CopyIcon` ghost icon-button — Tiptap JSON → `renderRichTextToHTML()` → `navigator.clipboard.write([new ClipboardItem({ 'text/html', 'text/plain' })])`; başarıda `toast(descriptionCopySuccess)`, hata `toast.error(descriptionCopyError)`), "Word olarak indir" (`FileTextIcon` ghost icon-button — lucide-react `FileTextIcon` doküman+text metaforu; MS Word resmi logo telif/lisans nedeniyle kullanılmaz, "yalnız lucide" kuralı; Tiptap JSON → `renderRichTextToHTML()` → **dynamic import** `html-docx-js-typescript` `asBlob()` → `<a download="{kart-slug}.docx">` indirme; pending'de `Loader2Icon animate-spin`, hata `toast.error(descriptionDownloadError)`), "Düzenle"/"Vazgeç" (`PencilIcon`/`PlusIcon` mevcut). Boşken (`hasContent === false`) kopyala+indir render edilmez; edit modundayken aksiyon slot'u tamamen gizlenir, yalnız gövdedeki Vazgeç + toolbar görünür. Gövde scroll: `RichTextEditor` (Tiptap — §13.5; toolbar sticky `border-b px-1 py-1 bg-background`: **B I S** `<>` `|` **H1 H2 H3** `|` bullet ordered `|` link). Boşken `bg-muted/40 rounded-md p-3 text-muted-foreground` "Açıklama ekle…".
  - **KONTROL LİSTESİ (sağ sütun)** — `SectionHeader` (`CheckSquareIcon` + "KONTROL LİSTESİ" + sağda toplam `Progress` mini-bar `w-20` + `x/y` `text-primary text-[11px] font-semibold` + "+ Liste ekle" `Button variant=outline size=sm border-dashed`): her checklist `border rounded-md p-3 space-y-1.5` — başlık (inline edit) + `x/y` + `Progress` (`h-1`, dolu → `bg-success`) + maddeler (`flex items-center gap-2`: `Checkbox` yuvarlak + madde metni inline-edit [tamsa `line-through text-muted-foreground`] + sağda atanan `Avatar size-xs` + chip "Ad S." `text-[10px] text-muted-foreground` + sil ikonu hover) + "+ Madde ekle" ghost.

**Sağ panel (`CardModalSidebar`)** — `bg-muted/40 backdrop-blur border-t md:border-t-0 md:border-l overflow-y-auto flex flex-col`:

- **Sticky header** (`px-4 py-2.5 bg-muted/40 backdrop-blur sticky top-0 z-10`): sekme strip `Tabs` — `inline-flex rounded-md border bg-card p-[3px]`; **Yorumlar N** · **Aktivite N** · **Ekler N** · **Tümü N** (aktif `bg-muted text-foreground`, pasif `text-muted-foreground hover:text-foreground`).
- **Yorum composer** (her zaman üstte): `flex items-start gap-2` — `Avatar size-sm` + `border rounded-md bg-card`: içte `RichTextEditor` mini (Placeholder "Yorum yaz, @ ile etiketle…"; @mention → Faz 6) + alt toolbar `border-t px-1.5 py-1 flex items-center justify-between`: sol **B I** + `PaperclipIcon` (`size-6` ghost), sağ "Gönder" (`h-6 px-2.5 text-[11.5px]` + `SendIcon`; boşken disabled).
- **Liste (sekmeye göre):** Yorumlar = yorum kartları (`Avatar size-sm` + ad + zaman + içerik render + edit/sil hover; silinmiş → "silindi" italic placeholder; düzenlenmişse "(düzenlendi)"). Aktivite = `flex gap-2 text-xs` (actor `Avatar size-xs` + ad + Türkçe özet + zaman + `InfoIcon`). **Ekler** = §13.10'daki `Dropzone` + `AttachmentTile` listesi (Faz 11D'de gerçek implementasyon; faz öncesi disabled placeholder). Tümü = yorum + aktivite + ek birleşik kronolojik.
- **Boş durum:** `EmptyState` (`MessageSquareIcon`/`ActivityIcon` `size-8 text-muted-foreground/60` + "Henüz yorum yok." / "Henüz aktivite yok." `text-sm text-muted-foreground py-6 text-center`).

**Mobil (`md:` altında):** tek kolon — sağ panel alta düşer, sekme strip yatay kalır; modal full-width Dialog (üst başlık çubuğu sticky). (Mobil app = Faz 7, ayrı.)

## 13.4 Ortak desenler + bileşenler (`packages/ui`'ye eklenecek)

| Bileşen                | Spec                                                                                                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectionHeader`        | İkon + UPPERCASE label (`text-xs font-semibold uppercase tracking-wide text-muted-foreground`) + opsiyonel sağ aksiyon slotu; `flex items-center justify-between mb-2`                                                                                                             |
| `Avatar`               | `users.image` URL varsa `<img>`, yoksa baş harf(ler); arka plan = isimden deterministik hash → `--palet-*` renklerinden biri; boyutlar `xs` 16px / `sm` 24px / `md` 32px / `lg` 40px; `rounded-full`; opsiyonel ring                                                               |
| `Progress`             | `h-1` (veya `h-1.5`) `bg-muted rounded-full overflow-hidden`; dolgu `bg-primary` (tamsa `bg-success`); `role="progressbar"` `aria-valuenow`                                                                                                                                        |
| `EmptyState`           | İkon (`size-8 text-muted-foreground/60`) + mesaj (`text-sm text-muted-foreground`) + opsiyonel CTA; `flex flex-col items-center gap-2 py-6`                                                                                                                                        |
| `MetaChip` / `MetaRow` | Kart metadata + modal meta chip ortak shell; kart sürümü `text-[10px]`, modal sürümü `h-8 rounded-md px-2 text-xs hover:bg-muted`; variant: `due` (normal / overdue + "GECİKTİ" rozeti / soon + amber nokta), `count` (ikon + sayı), `members` (avatar stack)                      |
| `LabelChip`            | Solid (`bg-palet-{ad} text-palet-{ad}-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium`) / soft (`bg-palet-{ad}/15 text-palet-{ad}`); renk swatch `size-2.5 rounded-full bg-palet-{ad}`                                                                                 |
| `CardCompleteToggle`   | `size-4 rounded-full border-2`; boş: `border-muted-foreground/40 hover:border-foreground hover:scale-110`; tamamlanmış: `bg-success border-success text-success-foreground` (`CheckIcon size-3`); kartta `opacity-0 group-hover/kart:opacity-100` (tamamlanmışsa hep görünür), modalda hep görünür. **Aksiyonlu geçiş (Trello-vari):** tamamlama anlık renk değişimi değil, mikro-etkileşimdir — tıklamada `active:scale-90`; tamamlanınca tek-seferlik halka pop (`animate-card-complete-pop`) + dışa yayılan halka burst (`animate-card-complete-burst`) + tik yay-girişi (`animate-card-complete-check`). Animasyon `checked false→true` geçişinde tetiklenir (tıklamada değil) — optimistic + realtime tamamlama da animasyonu oynatır, mount'ta zaten-tamam kart oynatmaz. `prefers-reduced-motion` altında burst gizli, geçiş/hover-scale kapalı. Motion token'ları `theme.css` `--animate-card-complete-*` + 3 top-level `@keyframes`. |
| `Tooltip`              | shadcn `Tooltip` (`@radix-ui/react-tooltip`) — kolon ikon butonları, kart metadata ikonları, modal meta chip'leri                                                                                                                                                                  |
| `DropdownMenu`         | shadcn `DropdownMenu` (`@radix-ui/react-dropdown-menu`) — kolon/kart/board ⋮ menüleri (DEM-37/53/54'teki "ghost button + onaylı Dialog" kalıbının yerine; yıkıcı aksiyonlar yine `AlertDialog`/onaylı)                                                                             |
| `ContextMenu`          | shadcn `ContextMenu` (`@radix-ui/react-context-menu`) — kart sağ tık menüsü; hover aksiyonlarının yerini alır, nested sub-menu ve checkbox item destekler                                                                                                                          |
| `Checkbox`             | shadcn `Checkbox` (`@radix-ui/react-checkbox`) — checklist maddeleri + filter çipleri (DEM-53 native `<input type=checkbox>` yerine)                                                                                                                                               |
| `Tabs`                 | shadcn `Tabs` (`@radix-ui/react-tabs`) — modal sağ panel sekme strip'i                                                                                                                                                                                                             |

**Section başlık deseni:** her modal bölümü (AÇIKLAMA / KONTROL LİSTESİ / sağ panel sekmeleri) ve workspace/board ayar bölümleri aynı `SectionHeader` desenini kullanır. **Hover/focus:** kartlarda yalnız `hover:shadow-card-hover` (kart border'sızdır — Trello görünümü); ikon butonlarında `hover:bg-accent`; chip'lerde `hover:bg-muted hover:text-foreground`; tüm odaklanabilirlerde `--ring` ile görünür `focus-visible:ring-2 ring-ring/60` (a11y).

## 13.5 Tiptap rich text entegrasyonu

- **Paketler:** `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-placeholder` (+ ileride `@tiptap/extension-mention` — Faz 6 @mention). Headless editör — component library değil; "yalnız shadcn/ui + Tailwind + lucide" kuralının istisnası değil, ek (bkz. `02-teknoloji-kararlari.md` Karar kaydı 2026-05-12).
- **Bileşenler** (`packages/ui` veya `apps/web/_components`): `RichTextEditor` (toolbar + `EditorContent` — editable) ve `RichTextContent` (read-only `EditorContent` — yoruma/açıklamaya render). Kart açıklaması = full toolbar (B I S code · H1-3 · bullet/ordered · link); yorum = mini toolbar (B I · link).
- **Storage = Tiptap JSON.** Mevcut `cards.description` ve `comments.body` `text` kolonları değişmez — Tiptap `getJSON()` çıktısı JSON string olarak saklanır. **Geriye dönük:** mevcut plain-text içerikler render/edit anında düz paragrafa parse edilir (`{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:eski}]}]}`); migration **gerekmez** (parse-time fallback). **XSS:** içerik Tiptap'ın controlled şema'sıyla üretilir + read-only render Tiptap `EditorContent` ile (DOM'a Tiptap basar) → `dangerouslySetInnerHTML` yok, ekstra sanitizer gerekmez.
- **Sıralama/yetki etkisi yok:** Tiptap yalnızca `description`/`body` alanlarının _biçimini_ değiştirir; `card.update` / `comment.{create,update}` procedure imzaları aynı (string in, string out). Faz 2.7 görsel — backend mantığı değişmez.

## 13.6 Kapsam dışı + uygulama sırası

**Kapsam dışı (Faz 2.7'de yapılmaz):** drag-drop davranışı (Faz 3 — [DEM-26](https://linear.app/demirkol/issue/DEM-26); §13.2'deki drag spec'leri yalnızca _hedef görsel_ — uygulama Faz 3) · optimistic UI cache modeli (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27); Faz 2.7'de mutation → invalidate → refetch kalır) · realtime (Faz 5) · @mention (Faz 6) · board içi/global arama (Faz 6.5 — [DEM-56](https://linear.app/demirkol/issue/DEM-56)) · board favorileri/son görülenler (Faz 8 — [DEM-57](https://linear.app/demirkol/issue/DEM-57)) · fotoğraf/Unsplash/user-uploaded/custom gradient arka planları (Faz 8 / ayrı iş) · mobil app (Faz 7 — [DEM-30](https://linear.app/demirkol/issue/DEM-30)) · attachment/ek yükleme (Faz 8) · "Liste"/"Etiketler" board görünümleri (ileri faz).

**Uygulama sırası (`faz-bol 2.7` ile Linear alt issue'larına bölünür):** 2.7.0 (bu belge — tamam) → **2.7A** (tema + token + `packages/ui`: yeni `theme.css`, Inter font, 12-renk etiket token'ları, `Avatar`/`SectionHeader`/`Progress`/`EmptyState`/`MetaChip`/`LabelChip`/`CardCompleteToggle` + shadcn `Tooltip`/`DropdownMenu`/`Checkbox`/`Tabs`, `_components/label-colors.ts` → token + `LABEL_PALETTE`; mevcut shadcn bileşenlerinin tema rafinasyonu) ∥ **2.7B** (board ekranı: zemin/üst bar/kolon/kart anatomisi + metadata satırı + "GECİKTİ" rozeti + filter bar cilalama + loading skeleton + hover/focus) ∥ **2.7C** (kart detay modalı: iki-kolon yeniden yapı + kapak-renkli başlık + meta chip satırı + AÇIKLAMA/KONTROL LİSTESİ + sağ panel sekme strip/yorum composer/aktivite feed + Tiptap entegrasyonu) → **2.7D** (workspace/app-shell ekranlarının yeni tema uyumu + accessibility pass + `Dialog` hardcoded "Kapat" → `strings`) → **2.7C-2** ([DEM-74](https://linear.app/demirkol/issue/DEM-74) — kapanış-sonrası: 2.7C modalını §13.3'e tam çekme [modal genişlik `w-[min(960px,92vw)]` + `sm:max-w-none`, iki-kolon grid `min-w-0`, `SectionHeader` aksiyon-slotu ikon-only, "İşlemler"→"Aktivite", sol kolon overflow fix] + DEM-66/67 backend'ini UI'ye wire [`CardCompleteToggle` → `card.complete`/`uncomplete`; kapak rengi picker → `card.update({coverColor})`; kart kapak şeridi]) → **dark/light tema desteği** ([DEM-96](https://linear.app/demirkol/issue/DEM-96) — kapanış-sonrası #2: §13.7 "Tema modu" + `next-themes` wire + app-shell `ThemeToggle`). Tüm uygulama Faz 2.5 web bittiğinden serbest; Faz 2.7 → Faz 3. Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.board.*` / `strings.card.*` / `strings.common.theme.*` genişletilir).

## 13.7 Tema modu (light/dark)

> Eksen: **tasarım / teknik**. Bu bölüm, [DEM-96](https://linear.app/demirkol/issue/DEM-96) (Faz 2.7 kapanış-sonrası follow-up #2) "önce belge" çıktısıdır: design token sistemi (§13.1) `:root` light + `.dark` setlerini zaten taşıyor; eksik olan **kullanıcı tarafı bağlantı** (provider + toggle + persistence + tüm ekran görsel pass). Uygulama DEM-96'da; **kod değişikliği bu belgede yok**.

### 13.7.1 Kararlar (kullanıcı seçimi, 2026-05-14)

- **Mod seti = `light` + `dark` ikili.** OS algılaması (`system`) **yok**. Default = `light` (Trello-vari palet light-first; eski Pusula projesi de light-first).
- **Strateji = `next-themes`.** shadcn'in resmi tema entegrasyonu; SSR mismatch'i `suppressHydrationWarning` + provider script ile çözer; minimal kod; ekosistem standardı.
- **Toggle = app-shell header sağ üst.** `Sun` (light aktifken) / `Moon` (dark aktifken) ikon swap, `Button variant=ghost size=icon`. İkili mod → DropdownMenu **gerekmez** (tıklayınca diğer moda flip).
- **Persistence = `localStorage`** (next-themes default). `storageKey="pusula-theme"` (namespaced — diğer Pusula key'leriyle aynı disiplin). Cihaz başına ayrı tercih; server preference YOK (sonraki tur — `users` tablosuna kolon eklemek istenirse Faz 8 / `bosluk-tara` benzeri ayrı iş).
- **Cookie modu YOK.** Kullanıcı seçimi: SSR'da ilk render her zaman `light` ile gelir; client mount sonrası localStorage'tan okunan tercih `<html class>` üzerinden uygulanır. Hydration flash riskini next-themes script'i (provider'ın eklediği inline `<script>`) küçültür; ilk render flash'ı kabul edilir (UX trade-off; `system` algılama olmadığı için daha az kritik).
- **Auth route'larında toggle:** `AuthShell` üst satırında aynı shared `ThemeToggle` kullanılır. Sign-in/sign-up kaynak projedeki split-screen auth tasarımına taşındığı için tema kontrolü de marka satırının sağında görünür.

### 13.7.2 ThemeProvider entegrasyonu

`apps/web/src/app/layout.tsx` (root layout):

```tsx
<html lang="tr" suppressHydrationWarning>
  <body className="font-sans antialiased">
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
      storageKey="pusula-theme"
    >
      {children}
    </ThemeProvider>
  </body>
</html>
```

`attribute="class"` → next-themes `<html class="dark">` veya class'sız (light) toggle eder; §13.1 `:root` light, `.dark` dark token cascade buna bağlıdır (zaten `@custom-variant dark (&:is(.dark *))` `theme.css`'te tanımlı).

`enableSystem={false}` → OS preference dinlenmez; `defaultTheme="light"` ilk ziyarette uygulanır.

### 13.7.3 `ThemeToggle` bileşeni

`apps/web/src/components/theme-toggle.tsx` (yeni) — app-shell'de tutulur, `packages/ui`'a şu an çıkarılmaz (`apps/mobile` yok; mobile gelirse cross-platform ayrı tartışılır):

- `useTheme()` ile mevcut tema; `mounted` state ile hidrasyon flash önleme (mount öncesi placeholder boyutunda `Button` render edilir — `aria-hidden`).
- Tıklayınca `setTheme(theme === "dark" ? "light" : "dark")`.
- İkon: light aktifken `Sun` (next moda geçmeyi vurgular: `Moon` da gösterilebilir; pattern = "hedef ikon" — Trello/Linear "açıklık seviyesi" hissi; final ikon kararı 2.7-dark uygulamasında ince-ayar).
- Boyut: `variant="ghost"` `size="icon"`, `h-9 w-9` (header tipik aksiyon boyutu).
- `aria-label` = `strings.common.theme.toggle` (örn. "Temayı değiştir").
- `tooltip` (`packages/ui` shadcn `Tooltip`): mevcut tema + tıklayınca neye geçileceğini gösterir.

### 13.7.4 App-shell yerleşimi

`apps/web/src/components/app-shell.tsx` header düzeni (mevcut: sol → marka + workspace adı; sağ → kullanıcı menüsü / hesap linki). `ThemeToggle` **kullanıcı menüsünden önce / `NotificationBell` (Faz 6D — DEM-93) bittiğinde onunla aynı grupta** durur:

```
[ Marka / WS ]                                          [ ThemeToggle ] [ NotificationBell ] [ Account ]
```

Auth (`(auth)/layout.tsx`) toggle barındırmaz (ilk tur kararı).

### 13.7.5 Dark mode görsel pass — checklist

Tüm ekranlarda her ikisinde test:

- **Auth**: sign-in, sign-up, forgot-password, reset-password — form input/label/error mesaj/link/button contrast.
- **App-shell**: header bg + border + ThemeToggle/Bell/Account ikonları + kullanıcı menüsü + breadcrumb.
- **Workspaces**: workspace listesi, kart hover, empty state, onboarding ekranı.
- **Workspace settings**: rename/slug formu, üye listesi, davet et dialog'u, gönderilmiş davetler, tehlikeli bölge.
- **Account**: profil form, parola form, hesap silme dialog'u.
- **Board ekranı**: zemin (`bg-background` varsayılanı + DEM-100 `bg-gradient-*` / `bg-palet-*` board background seçenekleri), top bar, view switch, kolon (`bg-muted/30`), kolon header, kart (`bg-card` + `shadow-card`, border yok — Trello), kart hover (`hover:shadow-card-hover`), drag preview (rüya modu placeholder), filter bar, loading skeleton.
- **Board settings dialog**: section başlıkları, etiket yönetimi, üye yönetimi, davetler, Arka plan sekmesi.
- **Card detail modal**: header (kapak-renksiz `bg-background border-b` + kapak-renkli `bg-palet-{ad}`), sol kolon (sticky başlık + meta chip satırı + AÇIKLAMA Tiptap editör + KONTROL LİSTESİ + Progress bar), sağ panel (`bg-muted/40 backdrop-blur` — dark'ta backdrop-blur okunabilir kalmalı), Tabs strip, yorum composer, yorum kartı, aktivite satırı.
- **Tiptap prose**: editör + read-only `RichTextContent` — `.dark` altında başlık/paragraf/bullet/link/inline-code/blockquote okunabilir (token-bazlı: `[&_h1]:text-foreground` vb. veya `prose-invert` alternatifi tartışılır; tercih: token-bazlı, palet tutarlı kalır).
- **`--palet-*` etiket chip'leri**: solid (`bg-palet-{ad} text-palet-{ad}-foreground`) + soft (`bg-palet-{ad}/15 text-palet-{ad}`) — light + dark'ta WCAG **AA** kontrast (4.5:1 normal metin / 3:1 büyük metin); `-foreground` eşleri §13.1'de tanımlı — implementasyonda kontrol et.
- **Kart kapak rengi**: kart şeridi (`bg-palet-{ad}` `h-3`) + modal başlık çubuğu (`bg-palet-{ad} text-palet-{ad}-foreground`) — kapak rengi seçilebilir 12 renk dark mode'da da WCAG AA.
- **Focus halkası**: `--ring` light + dark'ta primary-türevli görünür (a11y zorunlu).
- **Scrollbar**: `.pusula-scrollbar` light + dark thumb (`--scrollbar-thumb` / `--scrollbar-thumb-hover` token'ları zaten ikili tanımlı — kontrol et).

### 13.7.6 Kapsam dışı

- **OS `system` preference algılama** — kullanıcı kararı: ikili yeter. Eklenirse `enableSystem={true}` + `system` mode + `useTheme().resolvedTheme` ile gerçek tema okunur.
- **Server-side preference** — `users.theme` kolonu, Better Auth profil entegrasyonu, çoklu cihaz tutarlılık. Sonraki tur (`bosluk-tara` / Faz 8 / kullanıcı isteği).
- **Cookie modu** — SSR'da ilk render'da hedef tema. Kullanıcı kararı: localStorage yeterli.
- **Auth ekranlarında toggle** — ilk turda dışarıda; kullanıcı isterse sonraki tur.
- **`apps/mobile` tema** — Expo gelirse ayrı tartışılır (React Native `Appearance` API + AsyncStorage). Şu an apps/mobile yok.
- **Board-başına user-uploaded image background** — gradient/solid Faz 2.7'de tamamlandı ([DEM-100](https://linear.app/demirkol/issue/DEM-100) + [DEM-111](https://linear.app/demirkol/issue/DEM-111) + 2026-05-15 Trello gradient spec'i). Faz 8.X ([DEM-202](https://linear.app/demirkol/issue/DEM-202) → DEM-242/243/244/245/246) kalan kapsamı kapatır: **user-uploaded görsel** (web + mobil) + **mobil gradient/solid parite**. Kanonik üçüncü varyant `image:<attachmentId>` `boardBackgroundSchema`'ya eklenir; `attachments` tablosu `kind='board_background'` satırı tutar (Faz 11 altyapısı paylaşılır). Image overlay: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)` `board-bg-image-overlay` token'ı header/topbar okunaklılığını korur. **Unsplash kapsam dışı** (V1) — ileri faz. Detay → [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı 2026-05-20 + [`08-web-ve-mobil.md`](08-web-ve-mobil.md) "Faz 8.X — Board görsel arka plan".

## 13.8 App-shell v2: workspace + board switcher + user nav menu

> Eksen: **tasarım / teknik**. Bu bölüm, [DEM-97](https://linear.app/demirkol/issue/DEM-97) (Faz 2.7 kapanış-sonrası follow-up #3) "önce belge" çıktısıdır: app-shell header'ı `WorkspaceSwitcher` + `BoardSwitcher` + birleşik `UserNavMenu` ile yeniden düzenlenir; `BoardTopBar`'ın identity bloğu (kırmızı ikon + "PANO" eyebrow + ad + favori) switcher tarafından karşılandığı için **kaldırılır**. shadcn `team-switcher` (sidebar-07 bloğu) deseni header'a port edilir; yeni shadcn primitive gerekmez (`Button`/`DropdownMenu`/`Tooltip` + §13.4 `Avatar` zaten var). Uygulama DEM-97'de; **kod değişikliği bu belgede yok**.

### 13.8.1 Kararlar (kullanıcı seçimi, 2026-05-14)

- **K1 — Logo konumu = sol** (mevcut `LayoutGridIcon + "Pusula"`); switcher'lar logo'nun **sağında** aynı sol blokta sıralanır. Gerekçe: Trello/Linear/Asana standardı; üç-bölge "orta logo" dengesizliği (geniş sol + dar orta + orta sağ) reddedildi.
- **K2 — `BoardTopBar` identity bloğu kaldırılır:** sol identity ( workspace'e dönüş `Link` + `LayoutGridIcon` + "PANO" eyebrow + `RenameBoardForm`/h1 + favori `StarIcon`) silinir; view switch (`Pano/Liste/Etiketler`) + actions (`Davet/Search/Activity/⋮`) yerinde kalır. Inline-rename → ⋮ menü "Yeniden adlandır" (mevcut akış zaten dialog destekliyor). Gerekçe: switcher trigger'ı board adını + workspace bağlamını zaten taşıyor; çift bilgi yok.
- **K3 — Workspace switcher her zaman görünür:** tüm `(app)/*` route'larında. Aktif workspace yoksa trigger "Workspace seç" placeholder (disabled değil — tıklayınca dropdown açılır, create CTA görünür).
- **K4 — Board switcher her zaman görünür:** workspace seçili değilse **disabled** (`opacity-50 cursor-not-allowed`); workspace seçili + board route'unda değilsek "Pano seç" placeholder. Arşivli panolar listede **yok** (Faz 8 — [DEM-71](https://linear.app/demirkol/issue/DEM-71)).
- **K5 — Bildirim ikonu = disabled placeholder:** `Button variant=ghost size=icon` + `BellIcon` + `Tooltip: "Yakında"`. Gerçek `NotificationBell` Faz 6D ([DEM-93](https://linear.app/demirkol/issue/DEM-93)); bu iş yalnız yuvayı açar — sağ grupta sabit pozisyon.
- **K6 — User nav menu = avatar dropdown:** mevcut "Hesap linki + Çıkış butonu" birleşir. Trigger: `Avatar` (§13.4 spec; baş harf + isimden deterministik `--palet-*` renk hash) + `size-9 rounded-full`. Content: kullanıcı adı + e-posta (üst, salt-okunur), separator, "Hesap ayarları" (→ `/account`), separator, "Çıkış yap" (`destructive` variant, `signingOut` state korunur).
- **K7 — Tema toggle dışarıda:** avatar dropdown içine **girmez**; mevcut `ThemeToggle` (Sun/Moon tek-tık flip, §13.7) yerinde — sağ grupta avatar'ın solunda. Gerekçe: tek-tık flip iki klik (avatar aç → tema tıkla) gerektiren menüye gömmekten daha hızlı; §13.7 kararı bozulmasın.
- **K8 — Font boyutu kontrolü:** [DEM-112](https://linear.app/demirkol/issue/DEM-112) ile sağ gruba `FontSizeToggle` eklenir; konumu `NotificationBell` → `ThemeToggle` → `FontSizeToggle` → `UserNavMenu`. Trigger ikon-only `Button variant=ghost size=icon`; dropdown içinde küçült, büyüt, mevcut yüzde ve reset bulunur. Ölçek aralığı `%90`-`%120`, adım `%5`, default `%100`; persistence `localStorage` `pusula-font-scale`. Uygulama root provider'ı `<html>` font-size'ını ayarlar, böylece Tailwind `rem` tabanlı tipografi sistem genelinde büyür/küçülür. Server-side preference, cookie tabanlı SSR ve auth ekranlarına ayrı toggle kapsam dışıdır.
- **K9 — Faz/Linear pozisyonu:** Faz 2.7 follow-up #3 (DEM-58 epic Done; DEM-74 + DEM-96 ile aynı kapanış-sonrası disiplini, küçük scope, UI-only). Milestone = Faz 2.7.

### 13.8.2 Header anatomisi

Sticky `bg-card border-b shadow-card`, `h-14`, `mx-auto max-w-7xl px-4`. İçerik üç yatay grup:

```
┌─ Sol grup ───────────────────────────────┐  ┌─ Sağ grup ────────────────┐
│ [⬢ Pusula]  [WS▼ ad rol ⇕]  [Pano▼ ad ⇕] │  │ [🔔][☀️][Avatar▼]         │
└──────────────────────────────────────────┘  └───────────────────────────┘
```

- **Düzen:** `flex items-center justify-between gap-4`. Sol grup `flex items-center gap-2 min-w-0` (switcher'lar `truncate` ile uzun adları kısaltır). Sağ grup `flex items-center gap-1 shrink-0`.
- **Brand link:** mevcut [app-shell.tsx:62-75](<apps/web/src/app/(app)/_components/app-shell.tsx#L62-L75>) (`LayoutGridIcon` rozet + "Pusula" tracking-tight) — dokunulmaz; sol grubun ilk öğesi.
- **Switcher'lar arası ayırıcı:** brand ile WorkspaceSwitcher arasında `Separator orientation=vertical class="h-5"` (shadcn). WorkspaceSwitcher ile BoardSwitcher arasında: dropdown trigger'ların kendi border'ı yeterli — ek separator yok (görsel kalabalık olmasın).
- **Responsive (`md:` altı):** `BoardSwitcher` ikon-only (renk noktası + chevron, ad gizli), `WorkspaceSwitcher` ikon-only (avatar + chevron). `sm:` altında brand metni gizli, yalnız `LayoutGridIcon` rozet. Sağ grup: bildirim placeholder + tema toggle + avatar (her zaman görünür).

### 13.8.3 `WorkspaceSwitcher` bileşeni

`apps/web/src/app/(app)/_components/workspace-switcher.tsx` (yeni).

**Trigger** — `Button variant=outline size=sm` (h-9), `gap-2 px-2 max-w-56`:

```tsx
<Button variant="outline" size="sm" className="h-9 max-w-56 gap-2 px-2">
  <span className="size-7 shrink-0 rounded-md bg-palet-{hash} text-palet-{hash}-foreground inline-flex items-center justify-center text-xs font-semibold">
    {workspaceInitial}
  </span>
  <div className="grid min-w-0 flex-1 text-left leading-tight">
    <span className="truncate text-sm font-medium">
      {workspaceName ?? strings.shell.workspaceSwitcher.placeholder}
    </span>
    <span className="truncate text-[10px] text-muted-foreground">{workspaceRoleLabels[role]}</span>
  </div>
  <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
</Button>
```

- Aktif workspace yoksa (`/account` veya `/`): rol satırı boş; `workspaceInitial` = generic `LayoutGridIcon`.
- Avatar rengi = workspace adının deterministik hash → `--palet-*` 12 rengin birinden seç (§13.4 `Avatar` ile aynı algoritma; yeni util `apps/web/src/lib/avatar-color.ts`).

**Content** — `DropdownMenuContent align=start sideOffset=4 class="w-64"`:

- `DropdownMenuLabel` — `strings.shell.workspaceSwitcher.heading` ("Workspace'ler").
- `trpc.workspace.list` sonucu (`data?.workspaces.map`):
  - `DropdownMenuItem` per workspace: aynı 28px avatar + ad + rol; aktif olan `data-active` (sağda `CheckIcon size-3.5 text-primary`); `onSelect={() => router.push(`/workspaces/${ws.id}`)}`.
  - Empty state: workspace yoksa `DropdownMenuItem` disabled + `strings.shell.workspaceSwitcher.empty` ("Henüz workspace yok").
- `DropdownMenuSeparator`.
- `DropdownMenuItem` — `PlusIcon` + `strings.shell.workspaceSwitcher.create` ("Workspace oluştur") → mevcut `CreateWorkspaceDialog` açılır (state hoist veya `triggerLabel` prop pattern).
- `DropdownMenuItem` — `ListIcon` + `strings.shell.workspaceSwitcher.manageAll` ("Tüm workspace'leri yönet") → `router.push('/')`.

**Veri akışı:**

- Aktif workspace ID: `useParams<{ id?: string }>()` (workspace ve board route'larında dolu). `useTRPC().workspace.get.queryOptions({ workspaceId })` cache hit beklenir (workspace sayfası zaten kullanıyor — [workspaces/[id]/page.tsx:41](<apps/web/src/app/(app)/workspaces/[id]/page.tsx#L41>)).
- Liste: `useTRPC().workspace.list.queryOptions()`. `(app)/page.tsx` zaten kullanıyor — cache hit.

**State'ler:**

| Route                               | Trigger                                          | Disabled?                       |
| ----------------------------------- | ------------------------------------------------ | ------------------------------- |
| `/` (workspace list)                | "Workspace seç" + chevron (workspace seçili yok) | hayır (tıklayınca liste açılır) |
| `/workspaces/[id]`                  | aktif workspace adı + rol                        | hayır                           |
| `/workspaces/[id]/boards/[boardId]` | aktif workspace adı + rol                        | hayır                           |
| `/account`                          | "Workspace seç" + chevron                        | hayır                           |

### 13.8.4 `BoardSwitcher` bileşeni

`apps/web/src/app/(app)/_components/board-switcher.tsx` (yeni). `WorkspaceSwitcher` ile aynı pattern; farklar:

**Trigger** — `Button variant=outline size=sm` (h-9), `gap-2 px-2 max-w-56`:

```tsx
<Button variant="outline" size="sm" className="h-9 max-w-56 gap-2 px-2" disabled={!workspaceId}>
  <span className="size-2.5 shrink-0 rounded-full bg-palet-{hash}" aria-hidden />
  <span className="truncate text-sm font-medium">
    {boardTitle ??
      (workspaceId
        ? strings.shell.boardSwitcher.placeholder
        : strings.shell.boardSwitcher.disabled)}
  </span>
  <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
</Button>
```

- Trigger boyut/yapı `WorkspaceSwitcher` ile aynı; tek satır (rol etiketi yok — board için anlamlı değil); workspace adının yerine 10px renk noktası (board "kapak rengi" / ad hash'i).
- Workspace seçili değilse `disabled` (`opacity-50 cursor-not-allowed` shadcn `Button disabled` zaten verir); tooltip "Önce workspace seçin" (`Tooltip` wrapper).

**Content** — `DropdownMenuContent align=start sideOffset=4 class="w-64"`:

- `DropdownMenuLabel` — `strings.shell.boardSwitcher.heading` ("Panolar").
- `trpc.board.list.queryOptions({ workspaceId })` (workspace switcher disabled ise hiç sorulmaz — `enabled: !!workspaceId`):
  - Yalnız `archived=false` board'lar (UI tarafı filtre; backend zaten `board.list` "viewer+" panoları döner). Arşivli pano listesi Faz 8 — [DEM-71](https://linear.app/demirkol/issue/DEM-71).
  - `DropdownMenuItem` per board: 10px renk noktası + board adı + sağda aktif olan için `CheckIcon size-3.5 text-primary`; `onSelect={() => router.push(`/workspaces/${workspaceId}/boards/${board.id}`)}`.
  - Empty: "Henüz pano yok".
- `DropdownMenuSeparator`.
- `DropdownMenuItem` — `PlusIcon` + `strings.shell.boardSwitcher.create` ("Pano oluştur") → mevcut `CreateBoardDialog` açılır.
- `DropdownMenuItem` — `Settings2Icon` + `strings.shell.boardSwitcher.manageWorkspace` ("Workspace'i yönet") → `router.push(`/workspaces/${workspaceId}`)`.

### 13.8.5 `UserNavMenu` bileşeni

`apps/web/src/app/(app)/_components/user-nav-menu.tsx` (yeni). Mevcut [app-shell.tsx:78-90](<apps/web/src/app/(app)/_components/app-shell.tsx#L78-L90>) "Hesap" link + "Çıkış yap" butonu **silinir**; bu bileşene taşınır.

**Trigger** — `Button variant=ghost size=icon` (h-9 w-9), avatar rozet:

```tsx
<Button variant="ghost" size="icon" className="size-9 rounded-full">
  <span className="size-8 rounded-full bg-palet-{hash} text-palet-{hash}-foreground inline-flex items-center justify-center text-xs font-semibold">
    {userInitial}
  </span>
</Button>
```

- `userInitial` = ilk 1-2 harf (`Aria Chen` → `AC`; `Abdullah` → `A`); §13.4 `Avatar` algoritmasıyla aynı.

**Content** — `DropdownMenuContent align=end sideOffset=4 class="w-56"`:

- `DropdownMenuLabel` çift satır: `<div class="grid leading-tight"><span class="truncate text-sm font-medium">{userName}</span><span class="truncate text-xs text-muted-foreground">{userEmail}</span></div>`.
- `DropdownMenuSeparator`.
- `DropdownMenuItem` — `UserIcon` + `strings.shell.userMenu.account` ("Hesap ayarları") → `router.push('/account')`.
- `DropdownMenuSeparator`.
- `DropdownMenuItem variant=destructive` — `LogOutIcon` + `strings.shell.userMenu.signOut` (mevcut `strings.shell.signOut` reuse) → `signOut()` (mevcut `handleSignOut` çağrılır).
- Çıkış pending state: `DropdownMenuItem disabled={signingOut}`; label `signingOut ? strings.shell.signingOut : strings.shell.signOut`.

### 13.8.6 `NotificationBellPlaceholder` bileşeni

`apps/web/src/app/(app)/_components/notification-bell-placeholder.tsx` (yeni). Faz 6D'de gerçek `NotificationBell` ([DEM-93](https://linear.app/demirkol/issue/DEM-93)) bunu **doğrudan değiştirir** (dosya adı korunabilir veya `notification-bell.tsx`'e rename — kod-yazma turunda karar).

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="inline-flex">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled
        aria-label={strings.shell.notifications.label}
      >
        <BellIcon className="size-4" aria-hidden />
      </Button>
    </span>
  </TooltipTrigger>
  <TooltipContent>{strings.shell.notifications.soon}</TooltipContent>
</Tooltip>
```

- Disabled `Button` `<span>` ile sarılır (tooltip için — disabled element'e pointer event gelmez, span'a gelir; mevcut `ComingSoonAction` pattern'i — [board-top-bar.tsx:45-73](<apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L45-L73>) ile aynı).

### 13.8.7 `BoardTopBar` etkisi (K2 uygulama notu)

[board-top-bar.tsx:135-184](<apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L135-L184>) içindeki **identity bloğu** (`{/* Identity */}` yorumundan view switch öncesine kadar — workspace `Link` rozet + eyebrow + `RenameBoardForm`/h1 + arşiv ikonu + arşivli rozet + favori `StarIcon` + `Tooltip`) **kaldırılır**.

- Kalan: view switch (`BoardViewSwitch`) — sola çekilir (`flex-1` veya `mr-auto` yerine bilinçli sola hizalı); actions sağda.
- `RenameBoardForm` render edilmeye devam eder, ama yalnız `editing=true` durumunda — tetikleyici ⋮ menüdeki "Yeniden adlandır" `DropdownMenuItem` (zaten var, [board-top-bar.tsx:228-231](<apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L228-L231>)). `hideTrigger` prop zaten destekliyor — değişiklik yalnız identity bloğunun kaldırılması.
- Arşivli `Badge` ve favori `Tooltip` → app-shell switcher'ı board adını gösterirken arşiv durumunu gösteremez (switcher kompakt kalır); arşivli rozet `BoardTopBar`'da view switch'in **solunda** (eski identity yerinde) kalabilir — Identity'nin tek kalıntısı.
- **DEM-99 board aksiyon ayrışması:** `Davet et / paylaş` birleşik butonu kaldırılır. Board admin için `Davet et` ve `Paylaş` iki ayrı aksiyondur; `Pano ayarları` dropdown'u üyeler/davetler/etiketler/pano işlemleri sekmelerini taşır. Eski `⋮` menü kaldırılır; rename/archive/restore yalnız `Pano işlemleri` sekmesinde bulunur.

> **Karar:** arşivli `Badge` `BoardTopBar`'da kalır (view switch'in solunda) → board switcher kompakt, view alanında arşiv durumu net.

### 13.8.8 i18n / `strings.ts` anahtarları

`apps/web/src/lib/strings.ts` `strings.shell` altına eklenecekler (hardcoded metin yasak — §13.4 ortak desen):

```typescript
shell: {
  // ... mevcut: appName, accountSettings, signOut, signingOut, themeToggleTo{Light,Dark}
  workspaceSwitcher: {
    heading: 'Workspace\'ler',
    placeholder: 'Workspace seç',
    empty: 'Henüz workspace yok',
    create: 'Workspace oluştur',
    manageAll: 'Tüm workspace\'leri yönet',
    ariaLabel: 'Workspace değiştir',
  },
  boardSwitcher: {
    heading: 'Panolar',
    placeholder: 'Pano seç',
    disabled: 'Workspace seçin',
    disabledTooltip: 'Önce bir workspace seçin',
    empty: 'Henüz pano yok',
    create: 'Pano oluştur',
    manageWorkspace: 'Workspace\'i yönet',
    ariaLabel: 'Pano değiştir',
  },
  userMenu: {
    account: 'Hesap ayarları',
    ariaLabel: 'Kullanıcı menüsü',
    // signOut: mevcut `strings.shell.signOut` reuse
  },
  notifications: {
    label: 'Bildirimler',
    soon: 'Yakında',
  },
}
```

### 13.8.9 Dark/light pass (§13.7.5 checklist'ine ek)

- App-shell `WorkspaceSwitcher` + `BoardSwitcher` trigger'ları (`Button variant=outline`) light + dark.
- Switcher `DropdownMenuContent` (popover token'ları zaten ikili).
- Disabled board switcher (`opacity-50`) light + dark okunabilir kalır.
- `UserNavMenu` avatar (`bg-palet-*` solid + `text-palet-*-foreground`) light + dark WCAG **AA** (§13.7.5 paleti kontrast eşliğinde zaten kontrol edilir).
- `NotificationBellPlaceholder` disabled state light + dark.

### 13.8.10 Kapsam dışı

- **NotificationBell** gerçek implementasyonu — Faz 6D, [DEM-93](https://linear.app/demirkol/issue/DEM-93).
- **Board favori toggle** — Faz 8, [DEM-57](https://linear.app/demirkol/issue/DEM-57); `BoardTopBar`'da identity bloğuyla birlikte gitti, favori başka yerde restore edilmez (Faz 8'de switcher dropdown'una "Favoriler" alt-grubu eklenebilir).
- **Arşivli workspace/board** switcher listesinde — Faz 8 ([DEM-71](https://linear.app/demirkol/issue/DEM-71) ile aynı disiplin).
- **Klavye kısayolu katmanı** — [DEM-73](https://linear.app/demirkol/issue/DEM-73) ile küçük kapsamda uygulanır: global search (`Cmd/Ctrl+K`, `Ctrl+Space`), board-scoped search (`/`), board add-card/add-list (`N`, `Shift+N`/`L`), shortcut help (`?`) ve card modal aksiyonları (`E`, `C`, `D`, `M`, `T`, `A`, `Esc`). Aktif kart/liste seçimi ve ok tuşlarıyla board navigasyonu ayrı follow-up kapsamıdır.
- **Search input** app-shell'de (global arama) — Faz 6.5, [DEM-56](https://linear.app/demirkol/issue/DEM-56).
- **`apps/mobile` tema/switcher** — `apps/mobile` yok zaten; gelirse Expo bağlamında ayrı tartışılır.
- **Server-side recent/pinned workspace/board** — Faz 8 (cookie veya `users.recent_boards` jsonb kolonu — ayrı iş).

## 13.9 Mobil platform asset'leri (app icon + splash + adaptive icon)

Asset'ler `apps/mobile/assets/` altında, `app.config.ts`'ten referans verilir. iOS App Store ve Google Play submission'da bu PNG'ler doğrudan kullanılır; Expo build sırasında otomatik tüm boyutlara türetilir. Kural [DEM-235](https://linear.app/demirkol/issue/DEM-235) (Bug 7O-1) ile yazıldı.

### 13.9.1 Asset matrisi

| Dosya | Boyut | Alpha | Kullanım |
|-------|-------|-------|----------|
| `icon.png` | 1024×1024 | **YOK — opak şart** | iOS App Store + iOS home screen (`ios.icon` / üst-düzey `icon`) |
| `adaptive-icon.png` | 1024×1024 (min 432) | Olabilir | Android adaptive icon foreground (`android.adaptiveIcon.foregroundImage`); background renk `app.config.ts`'te |
| `splash-icon.png` | 1024×1024 | Olabilir | Splash screen logosu (`plugins.expo-splash-screen`) |
| `favicon.png` | 96×96 | Olabilir | Web (`web.favicon`) |

**Apple submit şartı:** `icon.png` **24-bit RGB**, alpha kanalı yasak. Alpha içeren PNG submit'te otomatik reddedilir (App Store Connect "asset validation").

### 13.9.2 iOS app icon safe-zone

- **Canvas:** 1024×1024 kare, **opak background**.
- **Background rengi:** `#000000` (siyah). Karar (AskUserQuestion 2026-05-20, DEM-235): marka logosu beyaz compass üzerinde maksimum kontrast; iOS home screen wallpaper'ından bağımsız tutarlı görünüm. Android adaptive icon background (`#5b51d8`) ve splash background ile rengi **bilinçli olarak farklı** — iOS icon kendi minimalist siyah/beyaz karakterini taşır.
- **Foreground:** Beyaz compass figürü (Pusula sembolü), merkezi.
- **Safe-zone:** Anlamlı grafik merkez **~824×824** alanda; her kenardan **~%10 padding** (~100 px). Apple iOS otomatik rounded-square mask uygular — köşelerde figür olmamalı, kenara değen çizgiler kırpık görünür.
- **Compass ölçeği:** ~%65–70 (700×700 civarı tuval). Önceki tasarımdaki "siyah daire" passe-partout elenir; kare opak siyah doğrudan kullanılır, daire katmanı yok.

### 13.9.3 Android adaptive icon

- **Foreground:** `adaptive-icon.png` — beyaz compass figürü, **merkez %60 alanda** (canvas dış %20 padding her kenarda zorunlu — launcher mask değişken: daire, squircle, rounded-square).
- **Background:** `app.config.ts` `android.adaptiveIcon.backgroundColor = '#5b51d8'` (marka mor).
- Foreground alpha'lı PNG olabilir; sadece compass figürü görünür, dış alan şeffaf → cihaz background rengini gösterir.

### 13.9.4 Splash screen

- `splash-icon.png` — merkezi compass figürü; light tema background `#5b51d8`, dark tema background `#1d2125` (`app.config.ts` `plugins.expo-splash-screen.backgroundColor` / `dark.backgroundColor`).
- Splash logosu app icon ile **aynı sembolü** kullanır ama kompozisyonu farklı (splash background ekran rengi, icon background icon kendi rengi).

### 13.9.5 Submit-öncesi doğrulama checklist

- [ ] `icon.png` 1024×1024, **alpha YOK** (`PixelFormat=Format24bppRgb`). Doğrulama (Windows PowerShell):
  ```powershell
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile('apps/mobile/assets/icon.png')
  $img.PixelFormat  # Format24bppRgb beklenir (Format32bppArgb → alpha var, RED)
  $img.Dispose()
  ```
- [ ] iOS simulator + fiziksel cihaz home screen, settings, spotlight — kenar kırpılması yok.
- [ ] App Store Connect "App Information" preview — marka algısı tutarlı.
- [ ] Android adaptive icon — daire / squircle / rounded-square mask'larda compass kırpık değil.
- [ ] Splash screen — light + dark tema açılışta logo doğru ölçek + renk.

§12.14 deployment runbook store asset checklist'i bu kuralı referans verir.

## 13.10 Kart eki — "Ekler" sekmesi (Faz 11D — ✅ wired)

> **Wired (DEM-150, 2026-05-15):** `Dropzone`, `AttachmentTile`, `AttachmentPreviewDialog` bileşenleri `packages/ui/src/components/` altında implement edildi ve `@pusula/ui` index + `package.json` exports'a eklendi. Uygulamalar: "Kapak" rozeti `LabelChip accent` yerine basit `bg-primary` rozet (LabelChip `accent` variant'ı + `PaletteName` zorunlu olduğundan); office/PDF thumbnail ikon renkleri WCAG 1.4.11 (3:1) için koyulaştırıldı.

Kart detay modalı sağ paneldeki `Tabs` "Ekler N" sekmesinin gerçek içeriği. §13.3'te placeholder olarak tanımlı (`PaperclipIcon` disabled, Faz 2.7C-2/DEM-74); Faz 11D bu sekmeye gerçek attachment yönetimini bağlar. Implementasyon rehberi → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.14; iş kuralları → [`../domain/07-ek-kurallari.md`](../domain/07-ek-kurallari.md); akış → [`09-depolama-ve-arama.md`](09-depolama-ve-arama.md) §9.1.

### 13.10.1 `Dropzone` (yeni `@pusula/ui` bileşeni)

Dosya yükleme alanı; drag-drop + click-to-pick + keyboard activate. Native `<input type="file" hidden>` + custom drop event handler'ları.

- **Layout:** `flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center` (idle); `border-primary/60 bg-primary/5` (drag-over); `cursor-not-allowed opacity-50` (disabled — viewer).
- **İçerik (idle):** `UploadCloudIcon size-8 text-muted-foreground` + `text-sm font-medium` "Dosya bırak veya seç" + `text-xs text-muted-foreground` "Resim, PDF, Word/Excel/PowerPoint — en fazla 50 MB". Accept attribute `ATTACHMENT_MIME_TYPES` join `,`.
- **İçerik (drag-over):** `Plus size-8 text-primary` + `text-sm font-medium text-primary` "Bırak yüklesin".
- **İçerik (uploading):** `Loader2Icon animate-spin` + `text-sm` "Yükleniyor… N%" + `Progress` bar (alt 4px, `bg-primary` fill).
- **A11y:** `role="button"` + `aria-label="Dosya yükle"` + `tabIndex={0}` + `onKeyDown` Enter/Space → input.click(). Disabled state `aria-disabled={true}` + `Tooltip` "Yalnızca okuyabilirsiniz".
- **Props:** `{ accept: string, maxBytes: number, disabled?: boolean, uploading?: boolean, progress?: number, onFile: (file: File) => void }`.

### 13.10.2 Açıklama input

Dropzone altında (dosya seçilmişse görünür) opsiyonel açıklama alanı.

- **Layout:** `flex flex-col gap-1.5`.
- `Label` `text-xs` "Açıklama (opsiyonel)".
- `Textarea` (`@pusula/ui`) `rows={2}` `placeholder="Bu dosya nedir? Ne için yüklüyorsun?"` `maxLength={500}` `className="text-sm"`.
- Alt sağ: `text-[10px] text-muted-foreground` sayaç `{used}/500`; 450'yi geçince `text-warning`, 500'de `text-destructive` + button disabled.
- Tek-tip plain text — Tiptap rich text **yok** (yalnız alt-yazı/caption); link otomatik dönüşmez.

### 13.10.3 `AttachmentTile` (yeni `@pusula/ui` bileşeni)

Liste satırı — `flex items-start gap-2.5 rounded-md border bg-card p-2 hover:bg-muted/40 group transition-colors`.

- **Sol — Thumbnail/ikon (56×56, `rounded-md`, `shrink-0`, `overflow-hidden`):**
  - `kind === 'image'` → `<img>` `object-cover h-full w-full` (presigned GET URL lazy load; loading="lazy"; alt={fileName}; fail → fallback `ImageIcon`).
  - `kind === 'pdf'` → `<div class="bg-destructive/10 flex items-center justify-center h-full"><FileTextIcon class="size-7 text-destructive" /></div>`.
  - `kind === 'office'` → mimeType'a göre renk: docx `bg-blue-500/10 text-blue-500`, xlsx `bg-emerald-500/10 text-emerald-500`, pptx `bg-orange-500/10 text-orange-500`; ikon `FileTextIcon`.
- **Orta — Metadata (`flex-1 min-w-0 flex flex-col gap-0.5`):**
  - Satır 1: `font-medium text-sm truncate` dosya adı + (eğer `isCover`) `LabelChip` "Kapak" (`@pusula/ui` `LabelChip` re-use, `accent` variant).
  - Satır 2: `text-[11.5px] text-muted-foreground flex items-center gap-1.5` boyut (formatBytes) · `•` · uploader name · `•` · görece tarih ("3 saat önce").
  - Satır 3 (`description` varsa): `text-xs text-muted-foreground italic line-clamp-2` açıklama.
- **Sağ — Aksiyonlar (`flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`):**
  - `Button variant=ghost size=icon` `EyeIcon` (Önizle/Aç — image+pdf için) — `Tooltip` "Önizle".
  - `Button variant=ghost size=icon` `DownloadIcon` (İndir; tüm kind'lar) — `Tooltip` "İndir".
  - `DropdownMenu` trigger `MoreHorizontalIcon` → menü:
    - "Açıklamayı düzenle" (uploader veya admin; Edit3Icon)
    - "Kapak yap" / "Kapağı kaldır" (image kind + admin/member+; ImageIcon)
    - separator
    - "Sil" (`destructive` variant; uploader veya admin; Trash2Icon)
- **Inline edit moduna geçince:** sağdaki aksiyonlar gizlenir; orta blok `Textarea` + sağ alt "Kaydet"/"İptal" iki butonu (`Button size=xs`).

### 13.10.4 `AttachmentPreviewDialog` (yeni `@pusula/ui` bileşeni)

Tile'daki "Önizle" tıklanınca açılan dialog (`@pusula/ui` `Dialog` extend, max-w-5xl).

- **Layout:** `DialogContent` `max-w-5xl h-[85vh] flex flex-col`; üst `DialogHeader` (dosya adı + indir + kapat); orta `flex-1 overflow-auto bg-muted/30 flex items-center justify-center`.
- **Image (`kind === 'image'`):** `<img>` `max-h-full max-w-full object-contain transition-transform` + sağ üst zoom kontrolleri (`+`/`-`/`Reset` `Button size=icon ghost`); zoom state `[100, 150, 200]` % step.
- **PDF (`kind === 'pdf'`):** `<iframe src={presignedGetUrl} sandbox="allow-same-origin" className="h-full w-full border-0" title={fileName}>`. URL lazy `attachment.getDownloadUrl` ile alınır; dialog kapanınca state temizlenir (URL token expire olur).
- **Office:** Dialog'a girilmez; "İndir" doğrudan tetiklenir.
- **A11y:** `role="dialog"` + `aria-label={fileName}`; `Escape` kapatır (mevcut `Dialog` davranışı).

### 13.10.5 Empty state

`@pusula/ui` `EmptyState` (mevcut): `PaperclipIcon` + "Henüz ek yok." + `text-xs text-muted-foreground` "Resim, PDF veya Office dosyası ekleyebilirsin." Viewer için CTA yok; admin/member için "Dosya seç" link-button (dropzone'u focus eder).

### 13.10.6 Realtime + optimistic UX disiplini

- `useBoardRealtime` `attachment.added`/`removed` event'i geldiğinde `attachment.list({ cardId })` invalidate → ek anında listede belirir/kaybolur.
- Yükleme sırasında optimistic ekleme yok (network indeterministik) — bunun yerine ufak inline "Yükleniyor…" satırı dropzone'un altında, başarılı olunca gerçek tile commit response'undan eklenir.
- Silme optimistic: tile hemen kaybolur, fail olursa rollback + toast.
- Açıklama edit optimistic: Textarea kapanır, fail olursa eski değere döner.

### 13.10.7 Tema (light/dark)

- Tile kart yüzeyi: `bg-card` light + dark; hover `bg-muted/40`; "Kapak" rozeti `LabelChip accent` light+dark §13.7.5 paleti.
- Thumbnail container backgrounds (`bg-destructive/10`, `bg-blue-500/10`, …) light+dark okunabilir kalır (Tailwind built-in semantik renkleri zaten her iki temada tutarlı).
- Önizleme dialog'unun image background'u `bg-muted/30` — dark'ta `bg-muted/20` daha az parlak, image kenarları görünür.

### 13.10.8 Kapsam dışı (Faz 11)

- **Drag-drop kart üstüne dosya bırakma** (Trello davranışı) — yalnız "Ekler" sekmesindeki dropzone V1; sonraki tur (Faz 11.1 — kart üstü dropzone hover overlay).
- **Çoklu eşzamanlı upload** — V1'de tek dosya / tek upload; çoklu seçim "Faz 11.1".
- **Image thumbnail server-side generation** — V1'de orijinal görsel `<img loading="lazy">` ile servis edilir; 256×256 webp thumbnail worker job'u Faz 8 sertleştirme.
- **EXIF temizleme** — image privacy V1 dışı; mevcut görseller olduğu gibi.
- **Antivirus tarama** — ClamAV worker job'u Faz 8 sertleştirme.
- **Office Online viewer** — gizlilik (public erişim gerektirir); V1 dışı.
- **Misafir attachment görüntüleme** — Faz 9 paylaşım linki SSR'da `forbidden:guest` flag; misafir attachment **görmez**.

## 13.11 Anasayfa anatomisi (`(app)/page.tsx` — 4-sütun Gezgin)

> **2026-06-01:** Anasayfa (`(app)/` varış yüzeyi) DEM-192 "Variant A — Rafine Orijinal" düzenini emekliye aldı; yerini **4-sütun drill-down "Gezgin"** aldı. Anasayfa artık saf bir **navigasyon hızlandırıcısı**dır: Workspace → Board → Liste → Kart sütunlarında soldan sağa daralan seçim. Kart detay modalı **bu ekranda açılmaz**; Sütun 4'te karta tıklamak board route'a `?card=<id>` ile yönlenir (drag-drop felsefesi ve tek-kaynak modal — §13.6 — ile uyumlu kalır). Veri akışı + route davranışı → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.3. Karar gerekçesi → [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) 2026-06-01 satırı.

### Yerleşim

- AppShell üst başlığı (§13.8) **değişmez**; anasayfa onun altındaki `<main>` içeriğidir. Header switcher'ları (`workspace-switcher`, `board-switcher`) global Gezgin paneli geçişe sahiplik ettiği için zaten gizli (`apps/web/src/app/(app)/_components/app-shell.tsx` → `SHOW_HEADER_SWITCHERS = false`); drill-down sütunları bu hızlı geçişi anasayfanın içinde sağlar.
- `/` rotası içeriği **tam genişlikte** akar (`max-w-none px-6` — `<main>` `usePathname()` ile anasayfayı tanır; diğer çocuk route'lar `max-w-5xl` ortalı kalır, board ekranı `fullBleed`). Anasayfa "geniş, sınırsız".
- **0 workspace** → drill-down render edilmez; onboarding empty state + bekleyen davetler gösterilir (§8.1.3, `onboarding-empty-state.tsx` + `PendingInvitations`). Bu davranış Variant A'dan miras kalır.
- **`lg` ve üstü (≥1024px)**: sayfa dikey iki zone'a bölünür (`grid grid-rows-[1fr_2fr]`, `gap-4`) — **üst 1/3 hero** + **alt 2/3 sütun grid'i**. Sütun grid'i `grid-cols-4` ile **eşit genişlikte** (her sütun `1fr`); aralarında `gap-3`. Eşit genişlik kararı (2026-06-01): kart sütunu da diğerleriyle aynı alanı tutar — satır yoğunluğu farklı olsa bile görsel ritim simetrik kalır. Outer container `h-[calc(100svh-12rem)]` ile viewport'a sabit sığar; AppShell main'in `overflow-y-auto` davranışına rağmen sayfa scroll'lamaz.
- **Hero (üst 1/3)**: **card değil** — sayfanın arka planına gömülü `isolate overflow-hidden rounded-lg` panel. Border + `bg-card` yok; bunun yerine lokal aurora-vari kompozisyon: iki yumuşak `--primary` blob (`blur-3xl`, sol-üst + sağ-alt) + ince `--border` dot pattern overlay (`22px` grid, opacity 40) + zemin yumuşatan vignette (`color-mix` ile `--background` türevli). Sol blok: `eyebrow` ("Pusula", `--primary` token + `uppercase tracking-[0.22em]`) → büyük `<h1>` iki parça (`titlePrefix` sade `--foreground` + `titleAccent` `--primary`'den `--primary/55`'e gradient `bg-clip-text text-transparent`, `text-4xl lg:text-5xl xl:text-6xl`) → kısa açıklama (`--muted-foreground`) → kompakt **"Son yenilik" pill'i** (değişiklik 2026-06-01). Sağ blok (yalnız `lg+`): cam ring + glow halo'lu kompakt `CompassIcon` rozeti (`bg-card/40 backdrop-blur-md`, ring `--primary/30`). `<h1>` `aria-label` `titleFull` ile tek/kararlı metin taşır; dekoratif öğeler `aria-hidden`. Hero metinleri `strings.home.hero`. `<lg` ekranda **gizlenir** (accordion modunda yalnız sütun görünür).
- **"Son yenilik" pill'i (hero alt-satırı, 2026-06-01)**: Description'ın altında `mt-5` ile yerleşen kompakt, **tıklanır** `<button>` — tıklayınca sol `WhatsNewPanel`'i açar (`useLeftPanel().openPanel('whatsNew')` — context `app-shell.tsx` tarafından sağlanır). `/yenilikler` sayfası SEO/deep-link/landing footer için ayakta kalır; pill panele ek bir yol açar (kullanıcı sayfayı tercih ederse user menüsündeki "Yenilikler" linki ve panelin altındaki "Tam sayfada aç" linki sayfaya götürür). Glass dili sütun panelleriyle aynı: `rounded-full border border-primary/20 bg-card/40 backdrop-blur-md px-3 py-1 text-xs`; hover'da `border-primary/40` + `bg-card/60`. İçerik soldan sağa: `SparklesIcon` (`size-3.5 text-primary`) → `latestNews.label` ("Son yenilik", `font-medium`) → `·` ayraç (`text-muted-foreground`) → en yeni günün insan-okur etiketi (`<time dateTime>` ile semantik) → `·` ayraç → entry sayısı (`latestNews.countSuffix`, `text-primary font-medium`). `ArrowUpRightIcon` panel-aç davranışıyla yanıltıcı olduğu için kaldırıldı (önceki sürüm `Link` idi). Veri kaynağı `@/lib/changelog-data` (`getLatestChangelogDay()` — `CHANGELOG[0]`); aynı veri `/yenilikler` sayfasını ve `WhatsNewPanel`'i de besler (tek kaynak). Erişilebilirlik: `aria-label` `latestNews.ariaLabel(dayLabel, count)` ile tek/kararlı metin ("…Yenilikler panelini aç."); ayraç + ikonlar `aria-hidden`; klavye focus ring `focus-visible:ring-ring`. `<lg` ekranda hero gizli kaldığı için pill de görünmez — kullanıcı menüsündeki "Yenilikler" kısayolu + sidebar rail'ın 6. butonu (§13.8) aynı işi yapar.
- **`lg` altı (<1024px)**: master-detail accordion — yalnızca **en derin seçili sütun** görünür, üstte breadcrumb tıklanabilir geri-navigasyon sağlar; iPad Faz 15 master-detail desenine ([`18-ipad-uyarlamasi.md`](18-ipad-uyarlamasi.md)) akrabalık. Hero bu modda render edilmez.

### URL state — drill-down deep-link

Drill-down seçimi search param'larında tutulur; refresh + paylaşılan link dayanıklı:

- `/?ws=<workspaceId>` — Sütun 1 seçimi.
- `/?ws=<workspaceId>&board=<boardId>` — Sütun 1 + 2 seçimi.
- `/?ws=<workspaceId>&board=<boardId>&list=<listId>` — tam drill-down.
- Sütun 4'te karta tıklanırsa `router.push('/workspaces/<ws>/boards/<b>?card=<id>')` ile board route'a yönlenir. `?card` board ekranındaki [`card-detail-route.tsx`](../../apps/web/src/app/%28app%29/workspaces/%5Bid%5D/boards/%5BboardId%5D/_components/card-detail/card-detail-route.tsx) tarafından açılır — modal **anasayfada mount edilmez** (tek-kaynak, drag-drop bağlamı korunur).
- Üst sütunda yeni seçim olursa alt sütun param'ları otomatik düşer: `ws` değişirse `board` + `list` reset, `board` değişirse `list` reset.
- Param'lar `router.replace` ile yazılır (sütun seçimleri geri-tarihçeyi şişirmez); kart açılışı `router.push` ile board ekranına geçer. Geri tuşu drill-down'a döner.
- **Auto-select zinciri (2026-06-01):** her sütun ilk verisi geldiğinde URL'de seçim yoksa **ilk öğeyi seçer ve URL'e yazar** — workspaces → boards → lists sırayla. Liste seviyesinde **arşivli listeler atlanır** (hepsi arşivliyse ilk satıra düşer). Cards filtresi otomatik. Sonuç: kullanıcı sayfayı ilk açtığında 4 sütun da dolu gelir; URL paylaşılabilir + refresh dayanıklı. Setter'lar `useCallback` ile stabil, `selection.xxxId` set olur olmaz koşul yanlışlanır → sonsuz döngü yok.

### Sütun ortak anatomisi

Her sütun aynı **glass panel** atomunu paylaşır — hero ile aynı tasarım dili (§13.11 hero):

- **Panel**: `bg-card/60 backdrop-blur-md border border-border/60 rounded-xl shadow-sm`. Üst kenarda ince `--primary` gradient highlight çizgisi (`from-primary/0 via-primary/40 to-primary/0 h-px`) — sayfanın glass tonajıyla uyumlu.
- **Başlık satırı**: sol blokta **dekoratif ikon rozeti** (sütuna özel `lucide` ikon: Building2 / LayoutGrid / List / CheckSquare; `bg-primary/10 border-primary/20 text-primary size-8 rounded-lg backdrop-blur-sm`) + eyebrow (`text-primary text-[10px] font-bold uppercase tracking-[0.18em]` — hero ile hizalı, primary tonlu) + sayaç ("N adet", `text-muted-foreground text-xs`) + sağda opsiyonel `+` ikon-buton.
- **Header ayraç**: `border-b border-border/40` (yumuşak).
- **Boş durum**: küçük ikon + iki satır metin + opsiyonel CTA (gate'li); accordion modunda da aynı.
- **Yükleniyor**: `AppSpinner` (size sm, `justify-center py-6`).
- **Hata**: `Alert variant="destructive"` (başlık + mesaj).
- **Satır listesi**: dikey scroll, satır arası 1px `--border` ayraç.
- **Aktif satır**: sol kenarda `--primary` `w-0.5` şerit + `bg-primary/8` zemin + `data-active="true"`; klavye `Enter`/tıklama aynı.
- **Sayfa arka planı**: `(app)/page.tsx` outer'da subtle dot pattern (`24px` grid, opacity 30) + tek `--primary/10` blob (`28rem blur-3xl`) — glass panellerin altında ortak doku.

### Sütun 1 — Workspaces

- Eyebrow: "WORKSPACES" + "N çalışma alanı".
- Satır: palette avatar (`avatarPaletteSolidClass` — §13.4) + ad (`font-medium truncate`) + alt satır "N pano · M üye" (`text-xs text-muted-foreground`) + sağda rol rozeti (`Badge` — owner/admin/member/guest; §13.1).
- `+` ikon-buton → `CreateWorkspaceDialog`.
- Veri: `workspace.list` tRPC query'si (mevcut, değişiklik yok).

### Sütun 2 — Boards

- Eyebrow: "PANOLAR" + "N pano". Sütun 1'de seçim yoksa boş durum: "Soldan bir çalışma alanı seç".
- Satır: kompakt board ikon rozeti (`boardBackgroundClass` ile boyanan `size-7 rounded-md`) + başlık + alt satır rol rozeti + son aktivite görece zamanı + sağda iki **ikon+metin** chip-buton: **Ayarlar** (`Settings2Icon` + "Ayarlar" → `/workspaces/<ws>/boards/<b>/settings`) ve **Aç** (`ArrowUpRightIcon` + "Aç" → `/workspaces/<ws>/boards/<b>`). Buton kompakt: `h-8 px-2 text-xs gap-1`; `aria-label` uzun bağlamlı ("X panosunun ayarları"), görsel metin kısa ("Ayarlar" / "Aç").
- Yıldız toggle **anasayfada yok** (2026-06-01 kararı — Sütun 2 satırı kompakt kalsın, favori değiştirme board ekranındaki üst bar'a taşındı). `board.favorited` verisi sıralama için kullanılmaya devam eder.
- Sıralama: son düzenlenene göre (`updatedAt desc`); yıldızlı board'lar üstte küçük "★ Favoriler" alt başlığı altında gruplanır (Variant A'daki "Tümü/Yıldızlı/Son düzenlenen" sekme grubu **kaldırıldı** — filtre satırı yok).
- `+` ikon-buton → `CreateBoardDialog` (member+ gate'li).
- Veri: `board.list({ workspaceId })` tRPC query'si (mevcut).

### Sütun 3 — Lists

- Eyebrow: "LİSTELER" + "N liste". Sütun 2'de seçim yoksa boş durum: "Soldan bir pano seç".
- Satır: liste ikonu (`board.get` payload'ındaki `lists[i].icon`, varsayılan `ListIcon`; `iconColor` ile boyanır) + başlık + sağda kart sayısı (`text-xs text-muted-foreground tabular-nums`).
- Arşivli liste: `opacity-60`, başlık öncesi "Arşivli" rozeti.
- `+` butonu yok — yeni liste yalnız board ekranında oluşturulur; drill-down salt navigasyon.
- Veri: `board.get({ boardId })` payload'ındaki `lists[]` (yeni endpoint yok — Sütun 3 + 4 tek `board.get` query'sinden beslenir; tek kaynak).

### Sütun 4 — Cards

- Eyebrow: "KARTLAR" + "N kart". Sütun 3'te seçim yoksa boş durum: "Soldan bir liste seç".
- Satır: solda tamamlandı checkbox (`Checkbox`, `completedAt != null` → işaretli, optimistic toggle `card.toggleComplete` mutation'ı ile) + başlık (`text-sm truncate`; tamamlandıysa `line-through text-muted-foreground`) + sağda due rozeti (varsa) — `dueAt < now` → `--destructive`, `dueAt < now+24h` → `--warning`, geri kalan `text-muted-foreground`. **Etiket / üye avatar / checklist sayısı gösterilmez** — detay için karta tıklayıp board modalına geç.
- Arşivli kart: gösterilmez (board arşiv sayfasında ayrı görünür).
- Satıra tıklamak → `router.push('/workspaces/<ws>/boards/<b>?card=<id>')` — board route, modal orada açılır.
- `+` butonu **yok** — Sütun 3 ile simetrik: kart oluşturma yalnız board ekranında. Drill-down V1 scope kararı (2026-06-01): kart hızlı oluştur ileri fazda member+ gate'li olarak eklenebilir, şimdi sadece nav.
- Veri: Sütun 3 ile aynı `board.get` payload'ından `cards[]` → `card.listId === selectedListId` filtresi.

### Responsive — accordion modu (`<lg`)

- Yalnızca **bir sütun** ekranda görünür: hangi sütunda en derin seçim varsa o (örn. `?ws=&board=` → Sütun 3 görünür).
- Üstte breadcrumb: `Workspace adı > Board adı > Liste adı` — her parça `<button>` (clickable), tıklamak ilgili sütuna geri döner (alt param'lar düşer). Yapısı `Breadcrumb` (shadcn/ui) ya da yerel kompakt eşdeğeri.
- Sütun başlığında `←` ikon-buton: bir üst sütuna geri.
- Breakpoint: `lg:` (1024px) — web odaklı. iPad portrait (768-1023px) accordion alır; landscape iPad (1024px+) tam 4 sütunu yakalar. Tablet'e özel 2-2 hibrit görünüm ileri faz (gerek görülürse).

### Token disiplini

- Tüm renkler design token (`--primary` / `--success` / `--warning` / `--destructive` / `--card` / `--muted` / `--border` + `--palet-*` paleti) üzerinden; sabit hex/RGB yok. Light + dark (§13.7) hatasız çalışır.
- Aktif satır şeridi `bg-primary` `w-0.5`; zemin `bg-primary/8` (light) / `bg-primary/12` (dark) — §13.1 token mantığı.
- Avatar zeminleri `avatarPaletteSolidClass` (§13.4 ile birebir deterministik).
- Board ikon rozetleri `boardBackgroundClass` (§13.2 ile tek kaynak — board ekranıyla aynı gradient/solid haritası).

> **Variant A artık emekli.** `WorkspaceRail`, `WorkspaceOverviewHeader`, `WorkspaceStatStrip`, `WorkspaceBoardGrid`, `HomeHero` component'leri kaldırıldı (yalnız `OnboardingEmptyState` + `PendingInvitations` 0-workspace dalında kalır). Stat strip metrikleri (Açık görev / Bu hafta tamamlanan / Vadesi geçen / Bana atanan) raporlar ekranında daha derin işlenecek (ileri faz).

## 13.12 Tablet design token (Faz 15 — iPad uyarlaması)

Faz 15 ([DEM-299](https://linear.app/demirkol/issue/DEM-299)) ile `apps/mobile` iPad-native uyarlama açılır. Tablet (>= 768px) için spacing, typography ve sizing token override'ları. Mimari bütün → [`18-ipad-uyarlamasi.md`](18-ipad-uyarlamasi.md); buradaki tablo design language sözleşmesidir.

### 13.12.1 Breakpoint

- **Tek eşik = 768px** — NativeWind `md:` standart Tailwind breakpoint (kullanıcı kararı 2026-05-31). iPad mini 8.3" (768×1024) **dahil** tablet branch'i alır.
- Custom alias yok (`tablet` ≡ `md`).
- Reddedilen alternatifler: 1024px (iPad mini'de tutarsız "phone layout"), iki seviye 768+1024 (düşük ROI).

### 13.12.2 Spacing & sizing override

| Token | Phone | Tablet (md:) | Tablet landscape (md:landscape:) |
|---|---|---|---|
| Board kolon genişliği | `w-72` (288px) | `md:w-80` (320px) | `md:landscape:w-96` (384px) |
| Kart padding | `p-3` (12px) | `md:p-4` (16px) | — |
| Tap target min | `h-12` (48px) | `md:min-h-[44px]` (HIG iPad) | — |
| Sidebar (master-detail) | — | `md:w-80` ~ `md:w-96` (320-400px) | — |
| Header height | `h-14` (56px) | `md:h-16` (64px) | — |
| Modal max-width (auth) | `max-w-sm` (384px) | `md:max-w-md` (448px) | — |

### 13.12.3 Typography scale

`useDeviceClass()` hook (`apps/mobile/src/lib/use-device-class.ts`, Faz 15A) tabanlı auto-apply, opt-out prop'u var:

| Class | Phone | Tablet (1.125×) |
|---|---|---|
| `text-sm` | 14px | 16px |
| `text-base` | 16px | 18px |
| `text-lg` | 18px | 20px |
| `text-xl` (board title) | 20px | 24px (`text-2xl`) |
| `text-2xl` (section header) | 24px | 28px (`text-3xl`) |

`<Text tabletScale={1.0}>` ile override (örn. metadata satırlarında küçük kalmalı: `MetaChip`, `LabelChip`, footer timestamp).

### 13.12.4 Master-detail primitive

`apps/mobile/src/components/master-detail-layout.tsx` (Faz 15C, YENİ):

```tsx
<MasterDetailLayout
  master={<BoardSidebar ... />}
  detail={<BoardKanban ... />}
  selectedDetail={cardId}
  fallback="master"
/>
```

- Tablet: `flex-row` (sidebar sabit `md:w-80` ~ `md:w-96` + main `flex-1`)
- Phone: tek view — `selectedDetail` varsa detail, yoksa master (history stack ile geri)
- SafeAreaInsets + landscape padding `md:landscape:px-6`

### 13.12.5 Sheet → popover branch

`apps/mobile/src/components/sheet.tsx` (Faz 15D):

- Phone: bottom sheet (mevcut)
- Tablet: anchor-based popover (modal overlay, dim background, tap-outside-to-close, ESC kapama)
- Prop: `anchor?: RefObject<View>` — verilmezse viewport center
- İstisna: `attachment-image-viewer.tsx` `<Modal>` (1 yer) — iPad'de full-screen kalır (image viewer için doğru)

### 13.12.6 Tab bar konumu — floating pill bottom nav (Faz 15H, revize 2026-05-31)

> **Revizyon notu:** 2026-05-31 ilk turunda K4 "üst nav (iPadOS 18 pattern)" olarak alındı ve **15E `Done`** ile shipped (`tabBarPosition: 'top'`). Aynı gün ikinci turunda kullanıcı kararıyla revize edildi → üst nav reddedildi, **floating pill bottom** benimsendi. **15E rollback edildi**; yeniden shipping **15H** alt işinde yapılır. Mimari gerekçe → [`18-ipad-uyarlamasi.md`](18-ipad-uyarlamasi.md) §2.4 Karar 4.

`apps/mobile/app/(app)/_layout.tsx` + `apps/mobile/src/components/floating-pill-tab-bar.tsx` (Faz 15H, YENİ):

- **Tablet (≥ 768px):** custom `FloatingPillTabBar` — tab bar alt-ortada floating pill (Apple Music iPad / Trello iPad pattern). Pill içeriğinin **üstüne** geçer (scroll altından akar).
- **Phone (< 768px):** `BottomTabBar` (`@react-navigation/bottom-tabs`) default — değişmez.
- 4 tab icon + label + merkezi "+" buton pill içinde aynı düzene oturur.

#### 13.12.6.1 Floating pill nav anatomy

| Token | Değer | Not |
|---|---|---|
| Pozisyon | `position: absolute`, `alignSelf: 'center'` | Scroll içeriğin altında değil, üstünde |
| Alt boşluk | `bottom: safeArea.bottom + 12` | Home indicator çakışmaz |
| Padding (dış) | `px-2 py-1.5` | Pill iç sekmeleri için breath |
| Background | `bg-card` | Tema rengi (light/dark uyumlu) |
| Border | `border border-border` | Tema kenarı |
| Shadow | `shadow-lg` (RN equiv. `elevation: 8` Android; iOS `shadow*`) | Yüzen his |
| Radius | `rounded-full` | Pill (kapsül) şekli |
| Tab item | `flex-row items-center gap-1.5 px-3 py-2 rounded-full` | Her sekme küçük kapsül |
| Tab içerik | `Icon (size 20)` + `Text (text-sm, weight medium)` | İkon + etiket (kullanıcı kararı 2026-05-31 — sadece ikon değil) |
| Aktif highlight | Pill içinde **alt-tone background** = `bg-muted` veya `bg-primary/10` | Mevcut segmented control pattern'iyle uyumlu (bkz. [`description-checklist-tabs.tsx`](../../apps/mobile/src/components/card-detail/description-checklist-tabs.tsx) `bg-card shadow-sm` aktif state) |
| Aktif tint | `tabBarActiveTintColor` (mevcut tema `primary`) | İkon + label rengi |
| Inactive tint | `tabBarInactiveTintColor` (mevcut tema `mutedForeground`) | İkon + label rengi |
| Badge | Bildirim sekmesi `tabBarBadge` overlay sağ-üst | Mevcut `<Tabs.Screen>` `tabBarBadge` prop'unu okur |

#### 13.12.6.2 Scroll content padding (her ekranda uygula)

Floating pill içeriğin üstünde durduğundan, scroll içeriği pill arkasına geçmemeli:

```tsx
const isTablet = useIsTablet();
const tabBarHeight = useBottomTabBarHeight(); // React Navigation
const padBottom = isTablet ? tabBarHeight + 24 : 0; // phone'da default zaten safe

<ScrollView contentContainerStyle={{ paddingBottom: padBottom }}>
```

Phone'da default davranış değişmez — sadece tablet'te ekstra pad. `useBottomTabBarHeight` custom tab bar'da çağrıldığında React Navigation height context'i sağlar; FloatingPillTabBar `safeAreaInsets.bottom + 12 + pillHeight` döndürür.

#### 13.12.6.3 Klavye davranışı

- `tabBarHideOnKeyboard: true` (default) — composer focus'unda pill gizlenir, klavye accessory'sini örtmez.
- 15E revizyonunda `tabBarHideOnKeyboard: !isTablet` → `true` (eski default'a dönüş).

### 13.12.7 Kart detay split anatomy (Faz 15C scope içinde, 2026-05-31 eklendi)

iPad'de kart detayında [`DescriptionChecklistTabs`](../../apps/mobile/src/components/card-detail/description-checklist-tabs.tsx) **3 sekmeli** olur — varsayılan "yan-yana" (web kart modali paritesi).

#### 13.12.7.1 Sekme sırası ve default

| Cihaz | Sekmeler | Default |
|---|---|---|
| Phone | `[Açıklama] [Yapılacaklar]` | `description` (mevcut, değişmez) |
| Tablet | `[Yan-yana] [Açıklama] [Yapılacaklar]` | **`both`** |

#### 13.12.7.2 `both` modu layout

```tsx
// Tablet sadece — phone'da `both` sekmesi yok
<View className="flex-row gap-3">
  <View className="flex-1"><DescriptionEditor … /></View>
  <View className="flex-1"><ChecklistSection … /></View>
</View>
```

| Token | Değer | Not |
|---|---|---|
| Kapsayıcı yüzey | `bg-card border border-border rounded-xl p-3.5` | Mevcut tab kapsayıcısı (değişmez) |
| Kolon ayırıcı | `gap-3` (12px) | Web modalindeki `gap-[22px]` mobilde daha sıkı |
| Kolon genişlik | `flex-1` her ikisi | Eşit, içerik scroll ederek genişler |
| iPad mini portrait (768px) | Sıkı kalır ama kabul edilir | Kullanıcı tek-sütun sekmelere geçebilir |
| iPad Pro 12.9" landscape | Bol alan | Tiptap toolbar + checklist item rahat |

#### 13.12.7.3 Tab bar style (aynı pill pattern'i)

`<TabButton>` mevcut `min-h-9 rounded-full bg-card shadow-sm` (aktif) — değişmez. Üç sekme genişliği `flex-1` ile dağılır.

### 13.12.8 Disiplin

- Yeni renk token YOK — mevcut tema sistemi (light/dark + `--palet-*` paleti) iPad'de aynı çalışır
- Hardcode width/height YOK — tüm tablet override'ları NativeWind `md:` veya `useDeviceClass()` hook üzerinden
- `<Text tabletScale={1.0}>` opt-out yalnız metadata için; varsayılan auto-apply
- iPad asset varyantı — yalnız **splash** (`splash-icon~ipad.png`) `app.config.ts` `plugins.expo-splash-screen.ios.tabletImage` ile bağlanır (Faz 15E ✅). iOS app icon tarafında Expo SDK 54 `ios.icon` (`IOSIcons`) yalnız `light`/`dark`/`tinted` kabul ediyor — iPad-spesifik varyant **yok**. 1024×1024 ana ikon iOS asset catalog üzerinden iPad boyutlarına otomatik türetilir; ayrı `icon~ipad.png` eklemeye gerek yok.

## 13.13 Planlayıcı paneli (Faz 16 — Google Takvim read-only)

Sol kenarda 3. global panel; Trello "Planlayıcı" bölmesi referans. Mevcut Gezgin + Hızlı Notlar paneli anatomi/disiplinleri birebir paylaşılır. Tam mimari → [`19-takvim-entegrasyonu.md`](19-takvim-entegrasyonu.md).

### 13.13.1 Panel kapsayıcısı (mevcut panel pattern'ı)

- Genişlik: `w-[320px]` — Hızlı Notlar paneliyle birebir aynı; Gezgin biraz daha geniş (`w-[300px]` board için, anasayfa için `w-[360px]`)
- Yüksek: `h-full` (app-shell row akışında); `<lg`'da overlay sheet `inset-y-0 left-0`
- Border: `border-r` (sağ kenar); `lg+`'da `rounded-xl border` (Trello "windowed" görünümü)
- Background: `bg-card` (mevcut Hızlı Notlar paneli)
- Açılma animasyonu: motion.div `width 0↔auto + opacity 0↔1`, `duration 0.22, ease [0.32, 0.72, 0, 1]` (mevcut Gezgin/Hızlı Notlar paterni)

### 13.13.2 Header (52px sticky)

Trello'nun planlayıcı bölmesi anatomisi birebir:

```
┌──────────────────────────────────┐
│ 📅 May ▾   ◀  Bugün  ▶      ⋯ 🔄 │   ← 52px, sticky top, bg-card border-b
├──────────────────────────────────┤
```

- **Sol grup:** Ay seçici dropdown (`shadcn DropdownMenu` — ay grid'i; mevcut "May" deseni `Calendar` icon küçük + ay adı + chevron `ChevronDown`)
- **Orta grup:** Gün gezinme — sol ok (`ChevronLeft`) + "Bugün" buton (`Button variant="ghost" size="sm"`) + sağ ok (`ChevronRight`). "Bugün" görünen güne göre `disabled` (görünen gün bugünse).
- **Sağ grup:** ⋯ menü (`DropdownMenu` — Ayarlar, Bağlantıyı kes), yenile butonu (`Button variant="ghost" size="icon"` + `RefreshCw` icon; refetch sırasında `animate-spin`)

### 13.13.3 Tüm-gün banner (varsa, 28px)

Tüm gün etkinlikleri yatay strip — saat şeridinin üstünde sabit; etkinlik blokları küçük renkli pill (`bg-palet-{X} text-palet-{X}-foreground rounded-full px-2 py-0.5 text-xs`). Boşsa banner render edilmez.

### 13.13.4 Timeline (kalan boşluk, scroll)

Trello'nun anatomy:

```
        │  
   9 am ├─────────────────────────
        │  
  10 am ├─────────────────────────
        │  ┌─────────────────────┐
        │  │ Toplantı            │  ← etkinlik bloğu
  11 am ├──│ 10:30 — 11:30       │
        │  └─────────────────────┘
        │
  12 pm ├─────────────────────────
```

- **Sol şerit:** ~48px genişlik, dikey saat etiketleri (9am, 10am, ..., 9pm) — `text-xs text-muted-foreground`, `pr-2 text-right`; aralık 60px/saat (ayarlanabilir)
- **Sağ alan:** yatay saat çizgileri (`border-t border-border/40`); etkinlik blokları absolute positioned (top = saat * 60px; height = süre * 60px); blok stili `rounded-md border-l-2 bg-palet-{X}/15 border-palet-{X} px-2 py-1`; içerik: ilk satır başlık (`font-medium text-sm truncate`), ikinci satır saat aralığı (`text-xs text-muted-foreground`)
- **Renk:** Google `colorId` (1-11) → `--palet-*` paletine eşle (en yakın renge map). Yoksa varsayılan `--palet-blue`.
- **Çakışan etkinlikler:** yan yana split (50% / 50% width); 3+ çakışma → `flex-col` (sıkıştırılmış)
- **Bugün marker:** geçerli zamanı kırmızı yatay çizgi (`border-t-2 border-destructive`) — mevcut günü görüntülerken aktif
- **Scroll:** dikey scroll (overflow-y-auto); 9am'de değil görüntülenen ilk etkinlik üzerinde başlangıç pozisyonu (scroll-to)

### 13.13.5 Boş durum CTA (bağlı değilken)

Trello'nun "Hesap bağlayın" deseni birebir:

```
┌──────────────────────────────────┐
│ 📅 May ▾   ◀  Bugün  ▶      ⋯ 🔄 │
├──────────────────────────────────┤
│                                  │
│      [📅 ikon, büyük, soluk]     │
│                                  │
│           Planlayıcı             │
│                                  │
│  Planlayıcıyı ve yapılacak       │
│  işlerinizi yan yana görüntü-    │
│  lemek için takvimlerinizi       │
│  bağlayın.                       │
│                                  │
│       [🔗 Hesap bağlayın]        │   ← primary button, /account/integrations
│                                  │
│  🔒 Planlayıcınızı yalnızca       │
│      siz görebilirsiniz.          │
│                                  │
└──────────────────────────────────┘
```

- İkon: `Calendar` lucide, `size-12 text-muted-foreground/40`
- Başlık: `text-base font-semibold`
- Body: `text-sm text-muted-foreground text-balance text-center max-w-[240px]`
- CTA: `Button` link `<Link href="/account/integrations">`, primary varyant
- Alt ipucu: `text-xs text-muted-foreground flex items-center gap-1.5` + `Lock` icon

### 13.13.6 Loading / hata durumları

- **Loading:** etkinlik fetch sırasında skeleton blokları (3-5 random-yükseklik `bg-muted/50 rounded-md animate-pulse`)
- **Boş gün (bağlı, etkinlik yok):** "Bu gün için etkinlik yok." `text-sm text-muted-foreground text-center mt-12`
- **Reconnect gerekiyor:** `UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED` → `Alert` kart "Bağlantı süresi doldu. Yeniden bağlayın." + buton `/account/integrations`
- **Sunucu hatası:** `Alert destructive` + manuel yenile butonu

### 13.13.7 Etkinlik modal anatomisi (`PlannerEventModal`)

shadcn `Dialog`, `w-[min(560px,92vw)] sm:max-w-none`:

```
┌──────────────────────────────────────────┐
│  Toplantı Başlığı                     ✕  │   ← DialogTitle h3 font-semibold
├──────────────────────────────────────────┤
│  📅 31 Mayıs Cumartesi · 10:30 — 11:30    │   ← tarih + saat aralığı
│  📍 Pusula Ofis, Ankara                   │   ← location (varsa)
│                                          │
│  Açıklama                                │   ← SectionHeader
│  Sprint planlama toplantısı. Faz 16'yı    │
│  konuşacağız: planlayıcı paneli +        │
│  Google Takvim entegrasyonu.             │
│                                          │
│  Katılımcılar (3)                        │   ← SectionHeader + count
│  ● Abdullah Demirkol         ✓ Katılıyor │
│  ● Mehmet Yılmaz             ? Belki     │
│  ● Ali Yıldız                ⏳ Bekleniyor│
│                                          │
├──────────────────────────────────────────┤
│                  [↗ Google'da aç]        │   ← right-aligned link
└──────────────────────────────────────────┘
```

- Tarih satırı: `text-sm` + `Calendar` icon
- Konum satırı: `text-sm text-muted-foreground` + `MapPin` icon (yalnız varsa)
- Açıklama: `prose prose-sm max-w-none whitespace-pre-wrap` (Google plain text döner, HTML değil)
- Katılımcı satırı: `Avatar` + isim + RSVP rozeti renkli (`accepted` = success, `declined` = destructive, `tentative` = warning, `needsAction` = muted)
- Footer link: `Button variant="link" asChild` → `<a href={event.htmlLink} target="_blank">Google'da aç</a>` + `ExternalLink` icon

### 13.13.8 Ayarlar > Entegrasyonlar — Google Takvim kartı

`/account/integrations` veya `/account` mevcut sayfada yeni `Tabs` sekmesi:

```
┌──────────────────────────────────────────┐
│ 🔌 Google Takvim                         │   ← kart başlık
│                                          │
│ Takvim etkinliklerinizi Pusula           │
│ Planlayıcı panelinde görün.              │
│                                          │
│ Bağlı değil                              │
│        [🔗 Bağla]                        │   ← bağlı değilken
└──────────────────────────────────────────┘

────────── VEYA ──────────

┌──────────────────────────────────────────┐
│ 🔌 Google Takvim         ● Bağlı         │
│                                          │
│ user@gmail.com hesabıyla bağlı           │
│ 31 Mayıs 2026 tarihinde bağlandı         │
│                                          │
│        [Bağlantıyı kes]                  │   ← destructive variant
└──────────────────────────────────────────┘
```

- Bağlı rozet: `Badge` `bg-success/20 text-success` + `Circle` filled icon
- "Bağlantıyı kes" → confirm dialog "Bağlantı kesilsin mi? Planlayıcı paneli boş kalır; istediğin zaman yeniden bağlayabilirsin." → `integrations.google.disconnect`

### 13.13.9 Disiplin

- **3-panel pattern reuse** — Gezgin + Hızlı Notlar mevcut motion/AnimatePresence/localStorage/mutex deseni birebir kopyalanır, asimetri yok
- **Renk paleti reuse** — yeni renk token YOK; Google `colorId` mevcut 12-renk `--palet-*` paletine eşlenir
- **Hardcode metin YOK** — tüm metinler `strings.planner.*` + `strings.integrations.google.*` (TR; ileride i18n)
- **shadcn-only** — `Dialog`/`DropdownMenu`/`Tabs`/`Alert`/`Button`/`Badge`/`Avatar` mevcut; yeni shadcn primitive eklemiyor
- **Tüm gün etkinlik banner zorunlu değil** — boşsa render edilmez (DOM şişirme yok)
- **Etkinlik bloğu min height 36px** — kısa etkinlik (15dk) bile başlık + saat sığsın diye min-height clamp
- **Read-only — düzenleme/sil/oluştur YOK** — V1 disiplini; UI'da bu aksiyonlar yer almaz
