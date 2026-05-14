---
title: "13 — UI Tasarım Dili"
description: "Pusula web UI'ının tasarım dili: design token sistemi (renk paleti / radius / shadow / spacing / tipografi), board-kolon-kart anatomisi, kart detay modalı yapısı, ortak desenler ve bileşen spec'leri. Faz 2.7'nin 'önce belge' çıktısı."
aliases:
  - "UI Tasarım Dili"
  - "Design Language"
  - "Design Tokens"
tags:
  - "pusula"
  - "architecture/ui"
  - "architecture/design-system"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
related:
  - "[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]"
  - "[[docs/architecture/02-teknoloji-kararlari|Teknoloji Kararları]]"
  - "[[docs/architecture/05-board-mekanigi|Board Mekaniği]]"
  - "[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]"
  - "[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]"
updated: 2026-05-14
---
# 13 — UI Tasarım Dili

> Eksen: **tasarım / teknik**. Bu dosya, Faz 2.7 ([DEM-58](https://linear.app/demirkol/issue/DEM-58)) "önce belge" adımının çıktısıdır:
> mevcut web UI fonksiyonel ama görsel olarak ham ("HTML+JS yazdık, CSS unuttuk"); bu belge UI'ın **tasarım dilini** sabitler —
> design token'lar, board/kolon/kart anatomisi, kart detay modalı yapısı, ortak desenler ve `packages/ui` bileşen spec'leri.
> Uygulama Faz 2.7'nin alt işlerinde (`faz-bol 2.7` → 2.7A/2.7B/2.7C/2.7D) yapılır; **kod değişikliği bu belgede yok**.
>
> **Referans (karar):** karma — eski Pusula projesinin (`D:\projects\pusula`) layout/anatomi/token sistemi **baz** + Trello'dan
> birkaç olgun pattern. Eski projenin *tasarımı* referans alınır, *kodu birebir kopyalanmaz* (`@base-ui/react` getirmemek için
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

| Token | Light (≈) | Rol |
| --- | --- | --- |
| `--background` | `oklch(0.96 0.02 240)` | Board zemini (açık mavi-gri) ve `boards.background = null` varsayılanı. Board-başına renk/degrade DEM-100 ile `--bg-gradient-*` + `--palet-*` token'larından seçilir. App-shell/diğer sayfalar `oklch(0.985 0.005 240)` (daha açık). |
| `--card` | `oklch(1 0 0)` | Kart, modal, popover yüzeyi (beyaz) |
| `--muted` | `oklch(0.97 0.01 240)` | Kolon zemini (`bg-muted/40` ile yarı saydam), modal sağ panel (`bg-muted/40 backdrop-blur`), disabled |
| `--muted-foreground` | `oklch(0.50 0.02 250)` | İkincil metin, kart metadata, kolon meta |
| `--foreground` | `oklch(0.18 0.01 250)` | Birincil metin |
| `--border` | `oklch(0.91 0.01 240)` | Kenarlıklar |
| `--input` | `oklch(0.91 0.01 240)` | Form kenarlığı |
| `--ring` | `oklch(0.55 0.16 245)` | Focus halkası (primary-türevli; görünür — a11y) |
| `--primary` | `oklch(0.55 0.16 245)` | Parlak mavi — buton/link, board üst bar vurgusu, progress dolgusu, aktif sekme |
| `--primary-foreground` | `oklch(0.99 0 0)` | Primary üstü metin |
| `--secondary` | `oklch(0.97 0.01 240)` | İkincil/ghost buton zemini |
| `--secondary-foreground` | `oklch(0.20 0.01 250)` | |
| `--accent` | `oklch(0.96 0.02 245)` | Hover zemini (`hover:bg-accent`) |
| `--accent-foreground` | `oklch(0.20 0.01 250)` | |
| `--success` | `oklch(0.62 0.16 150)` | Yeşil — tamamlandı tik, dolu checklist progress, "onaylandı" |
| `--success-foreground` | `oklch(0.99 0 0)` | |
| `--warning` | `oklch(0.78 0.14 75)` | Amber — yaklaşan due (24–72 saat) noktası, dikkat |
| `--destructive` | `oklch(0.58 0.21 27)` | Kırmızı — "GECİKTİ" rozeti/chip, sil, hata |
| `--destructive-foreground` | `oklch(0.99 0 0)` | |

`.dark`: aynı token seti, L değerleri yukarı/aşağı ayarlanır (background ≈ `oklch(0.18 0.01 250)`, card ≈ `oklch(0.22 0.01 250)`, foreground ≈ `oklch(0.97 0 0)`, primary ≈ `oklch(0.62 0.15 245)`); border `oklch(1 0 0 / 12%)`. Dark mode baştan desteklenir (token sistemi zaten her ikisini taşır).

### Etiket paleti (12 renk)

`--palet-{ad}` + her birinin `--palet-{ad}-foreground` eşi (kontrast garantili, light+dark). Adlar: `kirmizi`, `turuncu`, `sari`, `lime`, `yesil`, `sky`, `mavi`, `indigo`, `mor`, `pembe`, `gri`, `siyah`. Kullanım:

- **Kart üstü etiket chip'i / şerit:** solid — `bg-palet-{ad} text-palet-{ad}-foreground`
- **Picker / yumuşak gösterim:** soft — `bg-palet-{ad}/15 text-palet-{ad}`
- **Renk swatch (noktacık):** `size-2.5 rounded-full bg-palet-{ad}`
- **Kart kapak rengi / modal başlık çubuğu:** kartın kapak rengi seçildiyse o `--palet-{ad}` (modal başlık çubuğu o renge boyanır + `text-palet-{ad}-foreground`)

`@theme inline` bloğunda her `--palet-*` → `--color-palet-*` map'lenir (Tailwind `bg-palet-mavi` vb.). Mevcut `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/label-colors.ts` (yeni dosya açılmaz — bu var olan dosya) ham Tailwind isimleri (`green-500` vb.) yerine bu token seti üzerine kurulur (2.7A): `LABEL_SWATCH` değerleri `bg-palet-{ad}` literal'leri olur + `@pusula/domain` `LabelColor` (10 değer) → `@pusula/ui` `PaletteName` (12 ad) eşlemesi `LABEL_PALETTE` ile verilir. 12 `--palet-*` token'undan 10'u domain renklerine eşlenir; `indigo` ve `gri` ileride kapak rengi / yeni etiket renkleri için yedek kalır. `LabelChip` bileşeni `packages/ui`'de (`color: PaletteName`) — web tarafı domain rengini `LABEL_PALETTE` ile çevirir.

### Radius / shadow / spacing / tipografi

| Eksen | Değer | Not |
| --- | --- | --- |
| `--radius` (base) | `0.5rem` (8px) | `-sm` = `calc(--radius - 2px)` = 6px, `-md` = `--radius`, `-lg` = `calc(--radius + 2px)` = 10px, `-xl` = `calc(--radius + 6px)` = 14px. Kart `rounded-md`, kolon `rounded-lg`, modal `rounded-xl`, chip `rounded-sm`/`rounded-full` |
| Shadow | `--shadow-card` (≈ `0 1px 2px oklch(0 0 0 / 0.06), 0 1px 1px oklch(0 0 0 / 0.04)`), `--shadow-card-hover` (biraz daha derin), `--shadow-popover` (md — dropdown/modal/popover), `--shadow-drag` (2xl — drag overlay) | Tailwind `shadow-xs/sm/md` token'larıyla hizalanır; kartlarda `shadow-card`, sürüklemede `shadow-drag` |
| Spacing | Tailwind 4px ölçeği | Kart `p-2`; kart-içi dikey `gap-1`/`gap-1.5`; kart başlık satırı `gap-1.5`; metadata satırı `gap-x-2 gap-y-1`; kolon `p-2`, başlık `p-2`, gövde `px-2 py-2 gap-2`; kolonlar arası `gap-3`; modal sol kolon `px-5 py-4 space-y-5`, section başlık `mb-2` |
| Tipografi | Font = **Inter** (`--font-sans`, next/font self-host) | Ölçek: `text-[10px]`/`leading-tight` (kart metadata), `text-xs` 12px (chip, kolon meta, aktivite satırı), `text-sm` 14px (kart başlığı `leading-snug`, gövde, kolon başlığı `font-semibold`), `text-base` 16px (modal section/yorum), `text-lg` 18px (modal kart başlığı `font-semibold`), `text-xl` 20px (sayfa başlığı `tracking-tight`). Ağırlıklar 400/500/600 (heading 600). Kart başlığı `line-clamp-3`; section başlık `uppercase tracking-wide` `text-xs font-semibold text-muted-foreground` |

`packages/ui/src/styles/theme.css` hedef şekli (özet):

```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --radius: 0.5rem;
  --background: oklch(0.96 0.02 240);
  --card: oklch(1 0 0);
  --muted: oklch(0.97 0.01 240);
  --foreground: oklch(0.18 0.01 250);
  --primary: oklch(0.55 0.16 245);
  --primary-foreground: oklch(0.99 0 0);
  --success: oklch(0.62 0.16 150); --success-foreground: oklch(0.99 0 0);
  --warning: oklch(0.78 0.14 75);
  --destructive: oklch(0.58 0.21 27); --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.91 0.01 240); --input: oklch(0.91 0.01 240); --ring: oklch(0.55 0.16 245);
  /* ...muted-foreground, secondary*, accent*, popover*... */
  --palet-mavi: oklch(0.55 0.16 245); --palet-mavi-foreground: oklch(0.99 0 0);
  --palet-yesil: oklch(0.62 0.16 150); --palet-yesil-foreground: oklch(0.99 0 0);
  /* ...12 etiket rengi + -foreground eşleri... */
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.06), 0 1px 1px oklch(0 0 0 / 0.04);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}
.dark { /* L değerleri ayarlı aynı set */ }

@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-success: var(--success); --color-warning: var(--warning);
  --color-palet-mavi: var(--palet-mavi); /* ...12 renk... */
  --radius-sm: calc(var(--radius) - 2px); --radius-md: var(--radius); --radius-lg: calc(var(--radius) + 2px); --radius-xl: calc(var(--radius) + 6px);
  --font-sans: var(--font-sans);
}
```

## 13.2 Board ekranı anatomisi

### Board zemini & üst bar

- **Zemin:** `bg-background` (açık mavi-gri; varsayılan — `boards.background = null`). İçerik alanı `flex-1 overflow-hidden p-4`. **Board-başına özelleştirilebilir background** Faz 2.7 follow-up #4 ([DEM-100](https://linear.app/demirkol/issue/DEM-100)) kapsamında eklenir: `boards.background` `text` nullable, kanonik format `'gradient:<ad>' | 'solid:<paletAd>'`; `null` varsayılan `bg-background` zemindir. Mutation: `board.update` mevcut procedure'üne `background?: string | null` alanı eklenir (rename ile aynı kapı — `canManageBoard`, admin-only); activity `board.background_changed`/`board.background_cleared` + `boards.version + 1` + `realtime_events` aynı tx'te. Fotoğraf/Unsplash kapsam dışı (MinIO → Faz 8).

  **DEM-100 gradient token listesi ve class haritası (kesin):**

  | Değer | CSS token | Utility class | Türkçe ad |
  | --- | --- | --- | --- |
  | `gradient:sunset` | `--bg-gradient-sunset` | `bg-gradient-sunset` | Gün batımı |
  | `gradient:ocean` | `--bg-gradient-ocean` | `bg-gradient-ocean` | Okyanus |
  | `gradient:rainbow` | `--bg-gradient-rainbow` | `bg-gradient-rainbow` | Gökkuşağı |
  | `gradient:forest` | `--bg-gradient-forest` | `bg-gradient-forest` | Orman |
  | `gradient:lavender` | `--bg-gradient-lavender` | `bg-gradient-lavender` | Lavanta |
  | `gradient:sunrise` | `--bg-gradient-sunrise` | `bg-gradient-sunrise` | Gündoğumu |
  | `gradient:midnight` | `--bg-gradient-midnight` | `bg-gradient-midnight` | Gece yarısı |
  | `gradient:mint` | `--bg-gradient-mint` | `bg-gradient-mint` | Nane |
  | `gradient:aurora` | `--bg-gradient-aurora` | `bg-gradient-aurora` | Kuzey ışığı |
  | `gradient:coral` | `--bg-gradient-coral` | `bg-gradient-coral` | Mercan |

  **Düz renk haritası:** `solid:<paletAd>` → `bg-palet-{paletAd}`; `paletAd ∈ CARD_COVER_COLORS` (`kirmizi`, `turuncu`, `sari`, `lime`, `yesil`, `sky`, `mavi`, `indigo`, `mor`, `pembe`, `gri`, `siyah`). Bu liste kart kapak rengiyle aynı token setini kullanır; `boardBackgroundClass(background)` utility'si gradient/düz renk class'larını tek yerden döndürür, bilinmeyen değerlerde `bg-background` fallback'ine düşer.
- **Board üst barı (`BoardTopBar`):** sticky, `h-13 sm:h-14 flex items-center gap-3 px-4 bg-background border-b`.
  - Sol: `BoardIdentity` — board ikonu/renk noktası + "Pano" etiketi (`text-[10px] uppercase text-muted-foreground`) + board adı (`text-sm font-semibold truncate`) + ⭐ favori butonu (`StarIcon`; favori altyapısı Faz 8 / [DEM-57](https://linear.app/demirkol/issue/DEM-57) — şimdilik görsel toggle veya gizli).
  - Orta: `BoardViewSwitch` — "Pano / Liste / Etiketler" sekme grubu (`inline-flex rounded-md border bg-secondary p-[3px]`; aktif sekme `bg-card shadow-xs`). "Liste" ve "Etiketler" görünümleri Faz 2.7 kapsamında **değil** — sekme placeholder/disabled veya yalnız "Pano" görünür.
  - Sağ: `BoardActions` — `Davet et` (board ayarları dropdown'unu **Davetler** sekmesinde açar) · `Paylaş` (board linkini panoya kopyalar; kalıcı paylaşım linki/izin yönetimi ileri faz) · `SearchIcon` (board içi arama → Faz 6.5, şimdilik gizli/disabled) · `ActivityIcon` (board activity → ileri faz) · `Pano ayarları` `DropdownMenu` (sekme içerikleri: Üyeler / Davetler / Etiketler / Arka plan / Pano işlemleri). Eski `Davet et / paylaş` birleşik butonu ve ayrı `⋮` board menüsü yoktur; rename/archive/restore aynı işi tekrar eden ikinci yüzey oluşturmadan `Pano işlemleri` altında toplanır.

### Kolon (liste)

```
<section class="w-72 shrink-0 flex max-h-full flex-col rounded-lg border bg-muted/30">
  <header class="flex shrink-0 items-center justify-between gap-1 p-2">
    <div> liste adı (text-sm font-semibold truncate) · kart sayısı (text-muted-foreground text-xs) </div>
    <div> ShieldIcon (→ board üyeleri) · PanelLeftCloseIcon (daralt — ileri faz) · ⋮ DropdownMenu (yeniden adlandır / arşivle) </div>
  </header>
  <div class="pusula-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2"> {kartlar} </div>
  <footer class="shrink-0 p-2"> AddCardForm | <Button variant=ghost size=sm class="w-full justify-start text-muted-foreground"> + Kart ekle </Button> </footer>
</section>
```

- Arşivli liste: `bg-muted/20 border-dashed`, başlıkta arşiv ikonu; içi salt-okunur (yeni kart eklenemez — backend kapısı + UI).
- Sona: "+ Liste ekle" — `w-72 shrink-0 rounded-lg border border-dashed bg-muted/30 p-2` içinde ghost buton / inline form.
- Drag (Faz 3 — placeholder spec): sürüklenen kolon `shadow-drag`, bırakılacak yer `w-72 h-32 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5`.
- **Scroll & scrollbar ([DEM-88](https://linear.app/demirkol/issue/DEM-88) — 2026-05-13):** kolon `max-h-full` (parent strip yüksekliği kadar; içerik az ise içeriği kadar kompakt durur — `h-full` değil) + 3-segment (header `shrink-0` / cards area `flex min-h-0 overflow-y-auto pusula-scrollbar` / footer `shrink-0`); cards area `flex-1` taşımaz (boş kolonlar viewport-tall görünmesin). Strip `items-start` ile kolonlar top-aligned; strip kendisi `overflow-x-auto overflow-y-hidden` (yatay scroll yalnız). Custom scrollbar utility `.pusula-scrollbar` (`packages/ui/src/styles/theme.css` `@layer utilities` — 6px thin, transparent track, soft OKLCH thumb); token'lar `--scrollbar-thumb` + `--scrollbar-thumb-hover` (light + dark). Wired chain → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.4 "Layout & scroll davranışı".

### Kart (`CardItem`)

`<article class="bg-card rounded-md border p-2 text-sm shadow-card hover:border-foreground/30 hover:shadow-card-hover group/kart cursor-pointer">` — tıklayınca kart detay modalı (`?card=<id>`). İçerik sırası (yalnızca ilgili veri varsa render):

1. **Kapak görseli** (varsa) — `-mx-2 -mt-2 mb-1.5 h-24 w-[calc(100%+1rem)] rounded-t-md object-cover`.
2. **Etiket chip'leri** (varsa) — `flex flex-wrap gap-1 mb-1.5`; her chip `LabelChip` solid (`bg-palet-{ad} text-palet-{ad}-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium`; adı varsa ad, yoksa kısa renkli bar `h-2 w-8`). Kapak görseli yoksa ve etiket varsa chip'ler kartın görsel "rengini" verir (Trello hissi).
3. **Başlık satırı** — `flex items-start gap-1.5`: solda `CardCompleteToggle` (kartta `opacity-0 group-hover/kart:opacity-100`, tamamlanmışsa hep görünür: `bg-success` tik), başlık `line-clamp-3 font-medium leading-snug` (tamamlanmış kart → `line-through text-muted-foreground`). _(Durum — güncel 2026-05-13: kart-seviyesi "tamamlandı" backend'i ([DEM-66](https://linear.app/demirkol/issue/DEM-66) — `cards.completed`/`completedAt`/`completedBy` + `card.complete`/`card.uncomplete`) ve kapak rengi backend'i ([DEM-67](https://linear.app/demirkol/issue/DEM-67) — `cards.coverColor` + `CARD_COVER_COLORS`) `checklist_items.completed`'tan **bağımsız** (bkz. [`03-backend.md`](03-backend.md) Faz 2.7, [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) invariant 15) — ve **DEM-74 (2.7C-2)'de UI'ye wire edildi**: `CardCompleteToggle` kartta+modalda → `card.complete`/`card.uncomplete`; kart kapak rengi şeridi (kapak görseli yoksa `coverColor` varsa) `-mx-2 -mt-2 mb-1.5 h-3 rounded-t-md bg-palet-{ad}`; modal başlık çubuğu `coverColor` seçiliyse `bg-palet-{ad}` (§13.3); meta chip satırında kapak rengi picker (12-renk `--palet-*` → `card.update({coverColor})`). `CardCompleteToggle` bileşeni `packages/ui`'de; modaldaki checklist madde checkbox'larında da kullanılır.)_
4. **Metadata satırı (`CardMetaRow`)** — `mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground`; sırayla, varsa: due chip (`CalendarIcon` + tarih; gecikmiş → `bg-destructive/12 text-destructive rounded-sm px-1 py-px font-medium` + "GECİKTİ" rozeti `bg-destructive text-destructive-foreground text-[9px] uppercase tracking-wide px-1`; 24–72 saat içinde → `--warning` nokta `size-1.5 rounded-full`) · açıklama-var (`AlignLeftIcon`, açıklama doluysa) · checklist progress (`CheckSquareIcon` + `tamamlanan/toplam`; tamsa `text-success`) · yorum sayısı (`MessageSquareIcon` + n) · üye avatarları (son ~3 `Avatar size-xs` `-space-x-1` üst üste + "+N"). _(Veri: `board.get` Faz 2.7B'de bu sayaçları additive döndürür — `checklistTotal`/`checklistDone`, `commentCount`, `members[]`; bkz. [`03-backend.md`](03-backend.md). **Ek sayısı `PaperclipIcon` chip'i bu fazda yok** — attachment/ek Faz 8.)_
5. **Drag preview (`CardDragPreview`)** — sürükleme esnasında cursor'la birlikte gezen, kartın sadeleştirilmiş kopyası: `rotate-2 shadow-md` opaque kart + cover şerit + başlık + temel meta chip'leri (tooltip yok — detached React root). **Body-portal pattern**: `position: fixed; pointer-events: none; z-index: 9999` body element'ına `createRoot` ile mount edilir, cursor takibi DOM `style.transform = translate(...)` ile imperative — HTML5 drag-image bitmap **kullanılmaz** (`disableNativeDragPreview` 1×1 transparent gif → browser preview görünmez), bu sayede alpha/soft-shadow/rotated-corner sızıntı bug'larından kaçınılır. Sürüklenen kartın orijinali "**rüya modu**"na geçer: outer `<article>` `border border-dashed border-primary/60 bg-primary/5` (aktif drop hedefi placeholder), iç wrapper `invisible` (boyut korunur, layout shift yok). Eski Pusula `dnd-kit DragOverlay` deneyiminin Pragmatic DnD'ye uyarlaması. (DEM-87; wiring → [`08-web-ve-mobil.md`](08-web-ve-mobil.md) §8.1.8.)

### Filter bar & loading

- **Filter bar** (board ekranı üstünde — DEM-54'ten var, cilalama): etiket çipleri (`LabelChip` soft; aktif → `ring-2 ring-primary/60` veya solid) + "arşivli listeleri göster" toggle. `flex flex-wrap items-center gap-2 rounded-md border bg-card p-2`.
- **Loading skeleton:** kolon iskeleti (`w-72 rounded-lg border bg-muted/40` + 3-4 kart iskeleti `h-16 rounded-md bg-muted animate-pulse`).

## 13.3 Kart detay modalı anatomisi

shadcn `Dialog` (board arkada; `?card=<id>` derin link — Faz 2.5 kararı [DEM-49]). Boyut: `w-[min(960px,92vw)] h-[min(85vh,800px)] flex flex-col gap-0 overflow-hidden p-0`.

### Başlık çubuğu (`CardModalHeader`)

`flex items-center justify-between gap-2 px-4 py-2.5 border-b` — kartın kapak rengi seçilmişse çubuk `bg-palet-{ad} text-palet-{ad}-foreground` (kenarlık yok); yoksa `bg-background border-b`.

- Sol: `ListIcon` + breadcrumb (`pano adı / liste adı`, `text-xs`, kapak renkli modda `text-current/80`).
- Sağ: `BellIcon` (takip — ileri faz) · `LinkIcon` (derin linki kopyala) · ⋮ `DropdownMenu` (taşı / kopyala / arşivle — taşı/kopyala ileri faz) · ayraç · `X` kapat (`size-sm` ghost; kapak renkli modda `hover:bg-current/15`).

### İçerik — iki kolon

`grid grid-cols-1 md:grid-cols-[1fr_360px] overflow-hidden flex-1`.

**Sol kolon** — `overflow-y-auto px-5 py-4 space-y-5`:

- **Sticky başlık alanı** (`sticky top-0 bg-background z-10 pb-2 -mt-4 pt-4`): `CardCompleteToggle` (yuvarlak, hep görünür) + başlık inline-edit (`textarea`, `text-lg font-semibold leading-tight`, `field-sizing-content`).
- **Meta chip satırı (`CardModalMetaChips`)** — `flex flex-wrap items-center gap-1`; chip shell `group inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground`: `ShieldIcon`+üye sayısı (→ üye picker `Popover`) · `CalendarIcon`+due (→ date picker; gecikmiş kırmızı + "GECİKTİ" rozeti, soon amber nokta) · `TagIcon`+etiket sayısı (→ etiket picker) · `PaletteIcon`+kapak rengi (→ renk picker) · `+` ekle.
- **AÇIKLAMA** — `SectionHeader` (`AlignLeftIcon` + "AÇIKLAMA" + sağda düzenle/iptal): `RichTextEditor` (Tiptap — §13.5; toolbar sticky `border-b px-1 py-1 bg-background`: **B I S** `<>` ` | ` **H1 H2 H3** ` | ` bullet ordered ` | ` link). Boşken `bg-muted/40 rounded-md p-3 text-muted-foreground` "Açıklama ekle…".
- **KONTROL LİSTESİ** — `SectionHeader` (`CheckSquareIcon` + "KONTROL LİSTESİ" + sağda toplam `Progress` mini-bar `w-20` + `x/y` `text-primary text-[11px] font-semibold` + "+ Liste ekle" `Button variant=outline size=sm border-dashed`): her checklist `border rounded-md p-3 space-y-1.5` — başlık (inline edit) + `x/y` + `Progress` (`h-1`, dolu → `bg-success`) + maddeler (`flex items-center gap-2`: `Checkbox` yuvarlak + madde metni inline-edit [tamsa `line-through text-muted-foreground`] + sağda atanan `Avatar size-xs` + chip "Ad S." `text-[10px] text-muted-foreground` + sil ikonu hover) + "+ Madde ekle" ghost.

**Sağ panel (`CardModalSidebar`)** — `bg-muted/40 backdrop-blur border-t md:border-t-0 md:border-l overflow-y-auto flex flex-col`:

- **Sticky header** (`px-4 py-2.5 bg-muted/40 backdrop-blur sticky top-0 z-10`): sekme strip `Tabs` — `inline-flex rounded-md border bg-card p-[3px]`; **Yorumlar N** · **Aktivite N** · **Ekler N** · **Tümü N** (aktif `bg-muted text-foreground`, pasif `text-muted-foreground hover:text-foreground`).
- **Yorum composer** (her zaman üstte): `flex items-start gap-2` — `Avatar size-sm` + `border rounded-md bg-card`: içte `RichTextEditor` mini (Placeholder "Yorum yaz, @ ile etiketle…"; @mention → Faz 6) + alt toolbar `border-t px-1.5 py-1 flex items-center justify-between`: sol **B I** + `PaperclipIcon` (`size-6` ghost), sağ "Gönder" (`h-6 px-2.5 text-[11.5px]` + `SendIcon`; boşken disabled).
- **Liste (sekmeye göre):** Yorumlar = yorum kartları (`Avatar size-sm` + ad + zaman + içerik render + edit/sil hover; silinmiş → "silindi" italic placeholder; düzenlenmişse "(düzenlendi)"). Aktivite = `flex gap-2 text-xs` (actor `Avatar size-xs` + ad + Türkçe özet + zaman + `InfoIcon`). Ekler = ek listesi (ileri faz; boş). Tümü = yorum + aktivite birleşik kronolojik.
- **Boş durum:** `EmptyState` (`MessageSquareIcon`/`ActivityIcon` `size-8 text-muted-foreground/60` + "Henüz yorum yok." / "Henüz aktivite yok." `text-sm text-muted-foreground py-6 text-center`).

**Mobil (`md:` altında):** tek kolon — sağ panel alta düşer, sekme strip yatay kalır; modal full-width Dialog (üst başlık çubuğu sticky). (Mobil app = Faz 7, ayrı.)

## 13.4 Ortak desenler + bileşenler (`packages/ui`'ye eklenecek)

| Bileşen | Spec |
| --- | --- |
| `SectionHeader` | İkon + UPPERCASE label (`text-xs font-semibold uppercase tracking-wide text-muted-foreground`) + opsiyonel sağ aksiyon slotu; `flex items-center justify-between mb-2` |
| `Avatar` | `users.image` URL varsa `<img>`, yoksa baş harf(ler); arka plan = isimden deterministik hash → `--palet-*` renklerinden biri; boyutlar `xs` 16px / `sm` 24px / `md` 32px / `lg` 40px; `rounded-full`; opsiyonel ring |
| `Progress` | `h-1` (veya `h-1.5`) `bg-muted rounded-full overflow-hidden`; dolgu `bg-primary` (tamsa `bg-success`); `role="progressbar"` `aria-valuenow` |
| `EmptyState` | İkon (`size-8 text-muted-foreground/60`) + mesaj (`text-sm text-muted-foreground`) + opsiyonel CTA; `flex flex-col items-center gap-2 py-6` |
| `MetaChip` / `MetaRow` | Kart metadata + modal meta chip ortak shell; kart sürümü `text-[10px]`, modal sürümü `h-8 rounded-md px-2 text-xs hover:bg-muted`; variant: `due` (normal / overdue + "GECİKTİ" rozeti / soon + amber nokta), `count` (ikon + sayı), `members` (avatar stack) |
| `LabelChip` | Solid (`bg-palet-{ad} text-palet-{ad}-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium`) / soft (`bg-palet-{ad}/15 text-palet-{ad}`); renk swatch `size-2.5 rounded-full bg-palet-{ad}` |
| `CardCompleteToggle` | `size-4 rounded-full border-2`; boş: `border-muted-foreground/40 hover:border-foreground`; tamamlanmış: `bg-success border-success text-success-foreground` (`CheckIcon size-3`); kartta `opacity-0 group-hover/kart:opacity-100` (tamamlanmışsa hep görünür), modalda hep görünür |
| `Tooltip` | shadcn `Tooltip` (`@radix-ui/react-tooltip`) — kolon ikon butonları, kart metadata ikonları, modal meta chip'leri |
| `DropdownMenu` | shadcn `DropdownMenu` (`@radix-ui/react-dropdown-menu`) — kolon/kart/board ⋮ menüleri (DEM-37/53/54'teki "ghost button + onaylı Dialog" kalıbının yerine; yıkıcı aksiyonlar yine `AlertDialog`/onaylı) |
| `Checkbox` | shadcn `Checkbox` (`@radix-ui/react-checkbox`) — checklist maddeleri + filter çipleri (DEM-53 native `<input type=checkbox>` yerine) |
| `Tabs` | shadcn `Tabs` (`@radix-ui/react-tabs`) — modal sağ panel sekme strip'i |

**Section başlık deseni:** her modal bölümü (AÇIKLAMA / KONTROL LİSTESİ / sağ panel sekmeleri) ve workspace/board ayar bölümleri aynı `SectionHeader` desenini kullanır. **Hover/focus:** kartlarda `hover:border-foreground/30 hover:shadow-card-hover`; ikon butonlarında `hover:bg-accent`; chip'lerde `hover:bg-muted hover:text-foreground`; tüm odaklanabilirlerde `--ring` ile görünür `focus-visible:ring-2 ring-ring/60` (a11y).

## 13.5 Tiptap rich text entegrasyonu

- **Paketler:** `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-placeholder` (+ ileride `@tiptap/extension-mention` — Faz 6 @mention). Headless editör — component library değil; "yalnız shadcn/ui + Tailwind + lucide" kuralının istisnası değil, ek (bkz. `02-teknoloji-kararlari.md` Karar kaydı 2026-05-12).
- **Bileşenler** (`packages/ui` veya `apps/web/_components`): `RichTextEditor` (toolbar + `EditorContent` — editable) ve `RichTextContent` (read-only `EditorContent` — yoruma/açıklamaya render). Kart açıklaması = full toolbar (B I S code · H1-3 · bullet/ordered · link); yorum = mini toolbar (B I · link).
- **Storage = Tiptap JSON.** Mevcut `cards.description` ve `comments.body` `text` kolonları değişmez — Tiptap `getJSON()` çıktısı JSON string olarak saklanır. **Geriye dönük:** mevcut plain-text içerikler render/edit anında düz paragrafa parse edilir (`{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:eski}]}]}`); migration **gerekmez** (parse-time fallback). **XSS:** içerik Tiptap'ın controlled şema'sıyla üretilir + read-only render Tiptap `EditorContent` ile (DOM'a Tiptap basar) → `dangerouslySetInnerHTML` yok, ekstra sanitizer gerekmez.
- **Sıralama/yetki etkisi yok:** Tiptap yalnızca `description`/`body` alanlarının *biçimini* değiştirir; `card.update` / `comment.{create,update}` procedure imzaları aynı (string in, string out). Faz 2.7 görsel — backend mantığı değişmez.

## 13.6 Kapsam dışı + uygulama sırası

**Kapsam dışı (Faz 2.7'de yapılmaz):** drag-drop davranışı (Faz 3 — [DEM-26](https://linear.app/demirkol/issue/DEM-26); §13.2'deki drag spec'leri yalnızca *hedef görsel* — uygulama Faz 3) · optimistic UI cache modeli (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27); Faz 2.7'de mutation → invalidate → refetch kalır) · realtime (Faz 5) · @mention (Faz 6) · board içi/global arama (Faz 6.5 — [DEM-56](https://linear.app/demirkol/issue/DEM-56)) · board favorileri/son görülenler (Faz 8 — [DEM-57](https://linear.app/demirkol/issue/DEM-57)) · fotoğraf/Unsplash/user-uploaded/custom gradient arka planları (Faz 8 / ayrı iş) · mobil app (Faz 7 — [DEM-30](https://linear.app/demirkol/issue/DEM-30)) · attachment/ek yükleme (Faz 8) · "Liste"/"Etiketler" board görünümleri (ileri faz).

**Uygulama sırası (`faz-bol 2.7` ile Linear alt issue'larına bölünür):** 2.7.0 (bu belge — tamam) → **2.7A** (tema + token + `packages/ui`: yeni `theme.css`, Inter font, 12-renk etiket token'ları, `Avatar`/`SectionHeader`/`Progress`/`EmptyState`/`MetaChip`/`LabelChip`/`CardCompleteToggle` + shadcn `Tooltip`/`DropdownMenu`/`Checkbox`/`Tabs`, `_components/label-colors.ts` → token + `LABEL_PALETTE`; mevcut shadcn bileşenlerinin tema rafinasyonu) ∥ **2.7B** (board ekranı: zemin/üst bar/kolon/kart anatomisi + metadata satırı + "GECİKTİ" rozeti + filter bar cilalama + loading skeleton + hover/focus) ∥ **2.7C** (kart detay modalı: iki-kolon yeniden yapı + kapak-renkli başlık + meta chip satırı + AÇIKLAMA/KONTROL LİSTESİ + sağ panel sekme strip/yorum composer/aktivite feed + Tiptap entegrasyonu) → **2.7D** (workspace/app-shell ekranlarının yeni tema uyumu + accessibility pass + `Dialog` hardcoded "Kapat" → `strings`) → **2.7C-2** ([DEM-74](https://linear.app/demirkol/issue/DEM-74) — kapanış-sonrası: 2.7C modalını §13.3'e tam çekme [modal genişlik `w-[min(960px,92vw)]` + `sm:max-w-none`, iki-kolon grid `min-w-0`, `SectionHeader` aksiyon-slotu ikon-only, "İşlemler"→"Aktivite", sol kolon overflow fix] + DEM-66/67 backend'ini UI'ye wire [`CardCompleteToggle` → `card.complete`/`uncomplete`; kapak rengi picker → `card.update({coverColor})`; kart kapak şeridi]) → **dark/light tema desteği** ([DEM-96](https://linear.app/demirkol/issue/DEM-96) — kapanış-sonrası #2: §13.7 "Tema modu" + `next-themes` wire + app-shell `ThemeToggle`). Tüm uygulama Faz 2.5 web bittiğinden serbest; Faz 2.7 → Faz 3. Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.board.*` / `strings.card.*` / `strings.common.theme.*` genişletilir).

## 13.7 Tema modu (light/dark)

> Eksen: **tasarım / teknik**. Bu bölüm, [DEM-96](https://linear.app/demirkol/issue/DEM-96) (Faz 2.7 kapanış-sonrası follow-up #2) "önce belge" çıktısıdır: design token sistemi (§13.1) `:root` light + `.dark` setlerini zaten taşıyor; eksik olan **kullanıcı tarafı bağlantı** (provider + toggle + persistence + tüm ekran görsel pass). Uygulama DEM-96'da; **kod değişikliği bu belgede yok**.

### 13.7.1 Kararlar (kullanıcı seçimi, 2026-05-14)

- **Mod seti = `light` + `dark` ikili.** OS algılaması (`system`) **yok**. Default = `light` (Trello-vari palet light-first; eski Pusula projesi de light-first).
- **Strateji = `next-themes`.** shadcn'in resmi tema entegrasyonu; SSR mismatch'i `suppressHydrationWarning` + provider script ile çözer; minimal kod; ekosistem standardı.
- **Toggle = app-shell header sağ üst.** `Sun` (light aktifken) / `Moon` (dark aktifken) ikon swap, `Button variant=ghost size=icon`. İkili mod → DropdownMenu **gerekmez** (tıklayınca diğer moda flip).
- **Persistence = `localStorage`** (next-themes default). `storageKey="pusula-theme"` (namespaced — diğer Pusula key'leriyle aynı disiplin). Cihaz başına ayrı tercih; server preference YOK (sonraki tur — `users` tablosuna kolon eklemek istenirse Faz 8 / `bosluk-tara` benzeri ayrı iş).
- **Cookie modu YOK.** Kullanıcı seçimi: SSR'da ilk render her zaman `light` ile gelir; client mount sonrası localStorage'tan okunan tercih `<html class>` üzerinden uygulanır. Hydration flash riskini next-themes script'i (provider'ın eklediği inline `<script>`) küçültür; ilk render flash'ı kabul edilir (UX trade-off; `system` algılama olmadığı için daha az kritik).
- **Auth route'larında toggle:** opsiyonel; ilk turda **dışarıda** (sign-in/sign-up basit kalır). Kullanıcı isterse sonraki tur eklenir.

### 13.7.2 ThemeProvider entegrasyonu

`apps/web/src/app/layout.tsx` (root layout):

```tsx
<html lang="tr" suppressHydrationWarning>
  <body className="font-sans antialiased">
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light", "dark"]}
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
- **Board ekranı**: zemin (`bg-background` varsayılanı + DEM-100 `bg-gradient-*` / `bg-palet-*` board background seçenekleri), top bar, view switch, kolon (`bg-muted/30`), kolon header, kart (`bg-card` + `shadow-card`), kart hover (`hover:border-foreground/30`), drag preview (rüya modu placeholder), filter bar, loading skeleton.
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
- **Board-başına renk/gradient zemin** — DEM-100 kapsamıyla §13.2'de tanımlı; tema modundan bağımsız aynı token setini kullanır. Fotoğraf/Unsplash/user-uploaded/custom gradient seçenekleri Faz 8 / ayrı iş.

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
- **K8 — Faz/Linear pozisyonu:** Faz 2.7 follow-up #3 (DEM-58 epic Done; DEM-74 + DEM-96 ile aynı kapanış-sonrası disiplini, küçük scope, UI-only). Milestone = Faz 2.7.

### 13.8.2 Header anatomisi

Sticky `bg-card border-b shadow-card`, `h-14`, `mx-auto max-w-7xl px-4`. İçerik üç yatay grup:

```
┌─ Sol grup ───────────────────────────────┐  ┌─ Sağ grup ────────────────┐
│ [⬢ Pusula]  [WS▼ ad rol ⇕]  [Pano▼ ad ⇕] │  │ [🔔][☀️][Avatar▼]         │
└──────────────────────────────────────────┘  └───────────────────────────┘
```

- **Düzen:** `flex items-center justify-between gap-4`. Sol grup `flex items-center gap-2 min-w-0` (switcher'lar `truncate` ile uzun adları kısaltır). Sağ grup `flex items-center gap-1 shrink-0`.
- **Brand link:** mevcut [app-shell.tsx:62-75](apps/web/src/app/(app)/_components/app-shell.tsx#L62-L75) (`LayoutGridIcon` rozet + "Pusula" tracking-tight) — dokunulmaz; sol grubun ilk öğesi.
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
    <span className="truncate text-sm font-medium">{workspaceName ?? strings.shell.workspaceSwitcher.placeholder}</span>
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

- Aktif workspace ID: `useParams<{ id?: string }>()` (workspace ve board route'larında dolu). `useTRPC().workspace.get.queryOptions({ workspaceId })` cache hit beklenir (workspace sayfası zaten kullanıyor — [workspaces/[id]/page.tsx:41](apps/web/src/app/(app)/workspaces/[id]/page.tsx#L41)).
- Liste: `useTRPC().workspace.list.queryOptions()`. `(app)/page.tsx` zaten kullanıyor — cache hit.

**State'ler:**

| Route | Trigger | Disabled? |
| --- | --- | --- |
| `/` (workspace list) | "Workspace seç" + chevron (workspace seçili yok) | hayır (tıklayınca liste açılır) |
| `/workspaces/[id]` | aktif workspace adı + rol | hayır |
| `/workspaces/[id]/boards/[boardId]` | aktif workspace adı + rol | hayır |
| `/account` | "Workspace seç" + chevron | hayır |

### 13.8.4 `BoardSwitcher` bileşeni

`apps/web/src/app/(app)/_components/board-switcher.tsx` (yeni). `WorkspaceSwitcher` ile aynı pattern; farklar:

**Trigger** — `Button variant=outline size=sm` (h-9), `gap-2 px-2 max-w-56`:

```tsx
<Button variant="outline" size="sm" className="h-9 max-w-56 gap-2 px-2" disabled={!workspaceId}>
  <span className="size-2.5 shrink-0 rounded-full bg-palet-{hash}" aria-hidden />
  <span className="truncate text-sm font-medium">
    {boardTitle ?? (workspaceId ? strings.shell.boardSwitcher.placeholder : strings.shell.boardSwitcher.disabled)}
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

`apps/web/src/app/(app)/_components/user-nav-menu.tsx` (yeni). Mevcut [app-shell.tsx:78-90](apps/web/src/app/(app)/_components/app-shell.tsx#L78-L90) "Hesap" link + "Çıkış yap" butonu **silinir**; bu bileşene taşınır.

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
      <Button variant="ghost" size="icon" className="size-9" disabled aria-label={strings.shell.notifications.label}>
        <BellIcon className="size-4" aria-hidden />
      </Button>
    </span>
  </TooltipTrigger>
  <TooltipContent>{strings.shell.notifications.soon}</TooltipContent>
</Tooltip>
```

- Disabled `Button` `<span>` ile sarılır (tooltip için — disabled element'e pointer event gelmez, span'a gelir; mevcut `ComingSoonAction` pattern'i — [board-top-bar.tsx:45-73](apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L45-L73) ile aynı).

### 13.8.7 `BoardTopBar` etkisi (K2 uygulama notu)

[board-top-bar.tsx:135-184](apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L135-L184) içindeki **identity bloğu** (`{/* Identity */}` yorumundan view switch öncesine kadar — workspace `Link` rozet + eyebrow + `RenameBoardForm`/h1 + arşiv ikonu + arşivli rozet + favori `StarIcon` + `Tooltip`) **kaldırılır**.

- Kalan: view switch (`BoardViewSwitch`) — sola çekilir (`flex-1` veya `mr-auto` yerine bilinçli sola hizalı); actions sağda.
- `RenameBoardForm` render edilmeye devam eder, ama yalnız `editing=true` durumunda — tetikleyici ⋮ menüdeki "Yeniden adlandır" `DropdownMenuItem` (zaten var, [board-top-bar.tsx:228-231](apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx#L228-L231)). `hideTrigger` prop zaten destekliyor — değişiklik yalnız identity bloğunun kaldırılması.
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
- **Klavye kısayolu** (örn. `⌘K` workspace/board command palette) — Faz 8, [DEM-73](https://linear.app/demirkol/issue/DEM-73).
- **Search input** app-shell'de (global arama) — Faz 6.5, [DEM-56](https://linear.app/demirkol/issue/DEM-56).
- **`apps/mobile` tema/switcher** — `apps/mobile` yok zaten; gelirse Expo bağlamında ayrı tartışılır.
- **Server-side recent/pinned workspace/board** — Faz 8 (cookie veya `users.recent_boards` jsonb kolonu — ayrı iş).
