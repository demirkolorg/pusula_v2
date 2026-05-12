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
  - "[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]"
updated: 2026-05-12
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
> (headless editör; storage = Tiptap JSON — bkz. §9.5). (5) Faz 2.7'de eklenecek shadcn primitive'leri: `Tooltip` / `DropdownMenu`
> / `Checkbox` / `Tabs` (hepsi Radix tabanlı, "yalnız shadcn/ui" kuralı içinde).
>
> § içindeki OKLCH değerleri **önerilen** palettir; 2.7A implementasyonunda ince ayar yapılabilir. Bağlayıcı olan: token isimleri,
> token rolleri, board/kart/modal anatomisi ve bileşen sözleşmeleri.

## 9.1 Design token sistemi

Tailwind v4; tek `@import "tailwindcss"` + `@theme inline { ... }` (mevcut `packages/ui/src/styles/theme.css` yapısı). Renkler OKLCH;
`:root` light, `.dark` dark. Inline hex/rgb yasak — her renk token'dan gelir.

### Çekirdek renk token'ları

| Token | Light (≈) | Rol |
| --- | --- | --- |
| `--background` | `oklch(0.96 0.02 240)` | Board zemini (açık mavi-gri). Board-başına özelleştirilebilir renk/degrade → ileri faz; şimdilik bu token. App-shell/diğer sayfalar `oklch(0.985 0.005 240)` (daha açık). |
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

`@theme inline` bloğunda her `--palet-*` → `--color-palet-*` map'lenir (Tailwind `bg-palet-mavi` vb.). `apps/web/src/lib/label-colors.ts` ham Tailwind isimleri (`green-500` vb.) yerine bu token seti üzerine kurulur (2.7A).

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

## 9.2 Board ekranı anatomisi

### Board zemini & üst bar

- **Zemin:** `bg-background` (açık mavi-gri). İçerik alanı `flex-1 overflow-hidden p-4`. (Board-başına özelleştirilebilir background → ileri faz; şimdilik tek token.)
- **Board üst barı (`BoardTopBar`):** sticky, `h-13 sm:h-14 flex items-center gap-3 px-4 bg-background border-b`.
  - Sol: `BoardIdentity` — board ikonu/renk noktası + "Pano" etiketi (`text-[10px] uppercase text-muted-foreground`) + board adı (`text-sm font-semibold truncate`) + ⭐ favori butonu (`StarIcon`; favori altyapısı Faz 8 / [DEM-57](https://linear.app/demirkol/issue/DEM-57) — şimdilik görsel toggle veya gizli).
  - Orta: `BoardViewSwitch` — "Pano / Liste / Etiketler" sekme grubu (`inline-flex rounded-md border bg-secondary p-[3px]`; aktif sekme `bg-card shadow-xs`). "Liste" ve "Etiketler" görünümleri Faz 2.7 kapsamında **değil** — sekme placeholder/disabled veya yalnız "Pano" görünür.
  - Sağ: `BoardActions` — "Davet/Paylaş" butonu (board ayarları üye sekmesini açar) · `SearchIcon` (board içi arama → Faz 6.5, şimdilik gizli/disabled) · `ActivityIcon` (board activity → ileri faz) · ⋮ `DropdownMenu` (yeniden adlandır / arşivle / board ayarları).

### Kolon (liste)

```
<section class="w-72 shrink-0 flex flex-col rounded-lg border bg-muted/40 max-h-[calc(100vh-9rem)]">
  <header class="flex items-center justify-between gap-1 p-2">
    <div> liste adı (text-sm font-semibold truncate) · kart sayısı (text-muted-foreground text-xs) </div>
    <div> ShieldIcon (→ board üyeleri) · PanelLeftCloseIcon (daralt — ileri faz) · ⋮ DropdownMenu (yeniden adlandır / arşivle) </div>
  </header>
  <div class="flex flex-col gap-2 px-2 pb-2 overflow-y-auto"> {kartlar} </div>
  <footer class="p-2"> AddCardForm | <Button variant=ghost size=sm class="w-full justify-start text-muted-foreground"> + Kart ekle </Button> </footer>
</section>
```

- Arşivli liste: `bg-muted/20 border-dashed`, başlıkta arşiv ikonu; içi salt-okunur (yeni kart eklenemez — backend kapısı + UI).
- Sona: "+ Liste ekle" — `w-72 shrink-0 rounded-lg border border-dashed bg-muted/30 p-2` içinde ghost buton / inline form.
- Drag (Faz 3 — placeholder spec): sürüklenen kolon `shadow-drag`, bırakılacak yer `w-72 h-32 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5`.

### Kart (`CardItem`)

`<article class="bg-card rounded-md border p-2 text-sm shadow-card hover:border-foreground/30 hover:shadow-card-hover group/kart cursor-pointer">` — tıklayınca kart detay modalı (`?card=<id>`). İçerik sırası (yalnızca ilgili veri varsa render):

1. **Kapak görseli** (varsa) — `-mx-2 -mt-2 mb-1.5 h-24 w-[calc(100%+1rem)] rounded-t-md object-cover`.
2. **Etiket chip'leri** (varsa) — `flex flex-wrap gap-1 mb-1.5`; her chip `LabelChip` solid (`bg-palet-{ad} text-palet-{ad}-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium`; adı varsa ad, yoksa kısa renkli bar `h-2 w-8`). Kapak görseli yoksa ve etiket varsa chip'ler kartın görsel "rengini" verir (Trello hissi).
3. **Tamamla toggle + başlık** — `flex items-start gap-1.5`: `CardCompleteToggle` (hover'da görünür, tamamlanmışsa hep görünür) + başlık `line-clamp-3 font-medium leading-snug` (tamamlanmış: `text-muted-foreground line-through`).
4. **Metadata satırı (`CardMetaRow`)** — `mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground`; sırayla, varsa: due chip (`CalendarIcon` + tarih; gecikmiş → `bg-destructive/12 text-destructive rounded-sm px-1 py-px font-medium` + "GECİKTİ" rozeti `bg-destructive text-destructive-foreground text-[9px] uppercase tracking-wide px-1`; 24–72 saat içinde → `--warning` nokta `size-1.5 rounded-full`) · açıklama-var (`AlignLeftIcon`, açıklama doluysa) · checklist progress (`CheckSquareIcon` + `tamamlanan/toplam`; tamsa `text-success`) · yorum sayısı (`MessageSquareIcon` + n) · ek sayısı (`PaperclipIcon` + n) · üye avatarları (son ~3 `Avatar size-xs` `-space-x-1` üst üste + "+N").

### Filter bar & loading

- **Filter bar** (board ekranı üstünde — DEM-54'ten var, cilalama): etiket çipleri (`LabelChip` soft; aktif → `ring-2 ring-primary/60` veya solid) + "arşivli listeleri göster" toggle. `flex flex-wrap items-center gap-2 rounded-md border bg-card p-2`.
- **Loading skeleton:** kolon iskeleti (`w-72 rounded-lg border bg-muted/40` + 3-4 kart iskeleti `h-16 rounded-md bg-muted animate-pulse`).

## 9.3 Kart detay modalı anatomisi

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
- **AÇIKLAMA** — `SectionHeader` (`AlignLeftIcon` + "AÇIKLAMA" + sağda düzenle/iptal): `RichTextEditor` (Tiptap — §9.5; toolbar sticky `border-b px-1 py-1 bg-background`: **B I S** `<>` ` | ` **H1 H2 H3** ` | ` bullet ordered ` | ` link). Boşken `bg-muted/40 rounded-md p-3 text-muted-foreground` "Açıklama ekle…".
- **KONTROL LİSTESİ** — `SectionHeader` (`CheckSquareIcon` + "KONTROL LİSTESİ" + sağda toplam `Progress` mini-bar `w-20` + `x/y` `text-primary text-[11px] font-semibold` + "+ Liste ekle" `Button variant=outline size=sm border-dashed`): her checklist `border rounded-md p-3 space-y-1.5` — başlık (inline edit) + `x/y` + `Progress` (`h-1`, dolu → `bg-success`) + maddeler (`flex items-center gap-2`: `Checkbox` yuvarlak + madde metni inline-edit [tamsa `line-through text-muted-foreground`] + sağda atanan `Avatar size-xs` + chip "Ad S." `text-[10px] text-muted-foreground` + sil ikonu hover) + "+ Madde ekle" ghost.

**Sağ panel (`CardModalSidebar`)** — `bg-muted/40 backdrop-blur border-t md:border-t-0 md:border-l overflow-y-auto flex flex-col`:

- **Sticky header** (`px-4 py-2.5 bg-muted/40 backdrop-blur sticky top-0 z-10`): sekme strip `Tabs` — `inline-flex rounded-md border bg-card p-[3px]`; **Yorumlar N** · **Aktivite N** · **Ekler N** · **Tümü N** (aktif `bg-muted text-foreground`, pasif `text-muted-foreground hover:text-foreground`).
- **Yorum composer** (her zaman üstte): `flex items-start gap-2` — `Avatar size-sm` + `border rounded-md bg-card`: içte `RichTextEditor` mini (Placeholder "Yorum yaz, @ ile etiketle…"; @mention → Faz 6) + alt toolbar `border-t px-1.5 py-1 flex items-center justify-between`: sol **B I** + `PaperclipIcon` (`size-6` ghost), sağ "Gönder" (`h-6 px-2.5 text-[11.5px]` + `SendIcon`; boşken disabled).
- **Liste (sekmeye göre):** Yorumlar = yorum kartları (`Avatar size-sm` + ad + zaman + içerik render + edit/sil hover; silinmiş → "silindi" italic placeholder; düzenlenmişse "(düzenlendi)"). Aktivite = `flex gap-2 text-xs` (actor `Avatar size-xs` + ad + Türkçe özet + zaman + `InfoIcon`). Ekler = ek listesi (ileri faz; boş). Tümü = yorum + aktivite birleşik kronolojik.
- **Boş durum:** `EmptyState` (`MessageSquareIcon`/`ActivityIcon` `size-8 text-muted-foreground/60` + "Henüz yorum yok." / "Henüz aktivite yok." `text-sm text-muted-foreground py-6 text-center`).

**Mobil (`md:` altında):** tek kolon — sağ panel alta düşer, sekme strip yatay kalır; modal full-width Dialog (üst başlık çubuğu sticky). (Mobil app = Faz 7, ayrı.)

## 9.4 Ortak desenler + bileşenler (`packages/ui`'ye eklenecek)

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

## 9.5 Tiptap rich text entegrasyonu

- **Paketler:** `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-placeholder` (+ ileride `@tiptap/extension-mention` — Faz 6 @mention). Headless editör — component library değil; "yalnız shadcn/ui + Tailwind + lucide" kuralının istisnası değil, ek (bkz. `02-teknoloji-kararlari.md` Karar kaydı 2026-05-12).
- **Bileşenler** (`packages/ui` veya `apps/web/_components`): `RichTextEditor` (toolbar + `EditorContent` — editable) ve `RichTextContent` (read-only `EditorContent` — yoruma/açıklamaya render). Kart açıklaması = full toolbar (B I S code · H1-3 · bullet/ordered · link); yorum = mini toolbar (B I · link).
- **Storage = Tiptap JSON.** Mevcut `cards.description` ve `comments.body` `text` kolonları değişmez — Tiptap `getJSON()` çıktısı JSON string olarak saklanır. **Geriye dönük:** mevcut plain-text içerikler render/edit anında düz paragrafa parse edilir (`{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:eski}]}]}`); migration **gerekmez** (parse-time fallback). **XSS:** içerik Tiptap'ın controlled şema'sıyla üretilir + read-only render Tiptap `EditorContent` ile (DOM'a Tiptap basar) → `dangerouslySetInnerHTML` yok, ekstra sanitizer gerekmez.
- **Sıralama/yetki etkisi yok:** Tiptap yalnızca `description`/`body` alanlarının *biçimini* değiştirir; `card.update` / `comment.{create,update}` procedure imzaları aynı (string in, string out). Faz 2.7 görsel — backend mantığı değişmez.

## 9.6 Kapsam dışı + uygulama sırası

**Kapsam dışı (Faz 2.7'de yapılmaz):** drag-drop davranışı (Faz 3 — [DEM-26](https://linear.app/demirkol/issue/DEM-26); §9.2'deki drag spec'leri yalnızca *hedef görsel* — uygulama Faz 3) · optimistic UI cache modeli (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27); Faz 2.7'de mutation → invalidate → refetch kalır) · realtime (Faz 5) · @mention (Faz 6) · board içi/global arama (Faz 6.5 — [DEM-56](https://linear.app/demirkol/issue/DEM-56)) · board-başına özelleştirilebilir zemin + favoriler/son görülenler (Faz 8 — [DEM-57](https://linear.app/demirkol/issue/DEM-57)) · mobil app (Faz 7 — [DEM-30](https://linear.app/demirkol/issue/DEM-30)) · attachment/ek yükleme (Faz 8) · "Liste"/"Etiketler" board görünümleri (ileri faz).

**Uygulama sırası (`faz-bol 2.7` ile Linear alt issue'larına bölünür):** 2.7.0 (bu belge — tamam) → **2.7A** (tema + token + `packages/ui`: yeni `theme.css`, Inter font, 12-renk etiket token'ları, `Avatar`/`SectionHeader`/`Progress`/`EmptyState`/`MetaChip`/`LabelChip`/`CardCompleteToggle` + shadcn `Tooltip`/`DropdownMenu`/`Checkbox`/`Tabs`, `label-colors.ts` → token; mevcut shadcn bileşenlerinin tema rafinasyonu) ∥ **2.7B** (board ekranı: zemin/üst bar/kolon/kart anatomisi + metadata satırı + "GECİKTİ" rozeti + filter bar cilalama + loading skeleton + hover/focus) ∥ **2.7C** (kart detay modalı: iki-kolon yeniden yapı + kapak-renkli başlık + meta chip satırı + AÇIKLAMA/KONTROL LİSTESİ + sağ panel sekme strip/yorum composer/aktivite feed + Tiptap entegrasyonu) → **2.7D** (workspace/app-shell ekranlarının yeni tema uyumu + accessibility pass + `Dialog` hardcoded "Kapat" → `strings`). Tüm uygulama Faz 2.5 web bittiğinden serbest; Faz 2.7 → Faz 3. Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.board.*` / `strings.card.*` genişletilir).
