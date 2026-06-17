---
title: '20 — Hareket & Etkileşim Sistemi'
description: "Pusula web UI'ının hareket (motion) ve etkileşim dili: easing/süre token katalogu, katmanlı elevation, giriş animasyonu kuralı, fizik hissi (snap/manyetik/direnç), basılma feedback'i, component state matrisi (idle/hover/pressed/focus/loading/disabled/success), collapse tekniği, reduced-motion politikası ve Framer Motion motor kuralı. 13 (UI Tasarım Dili) ile ikiz; 13 'neye benziyor', 20 'nasıl hareket ediyor' sorusunu yanıtlar."
aliases:
  - 'Hareket Sistemi'
  - 'Motion System'
  - 'Etkileşim Dili'
  - 'Animation Tokens'
tags:
  - 'pusula'
  - 'architecture/ui'
  - 'architecture/design-system'
  - 'architecture/motion'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/13-ui-tasarim-dili|UI Tasarım Dili]]'
  - '[[docs/architecture/08-web-ve-mobil|Web ve Mobil]]'
  - '[[docs/architecture/02-teknoloji-kararlari|Teknoloji Kararları]]'
  - '[[docs/architecture/05-board-mekanigi|Board Mekaniği]]'
updated: 2026-06-17
---

# 20 — Hareket & Etkileşim Sistemi

> Eksen: **tasarım / teknik**. Bu belge, web UI'ının **hareket dilini** sabitler: easing/süre token'ları, katmanlı
> gölge (elevation), giriş animasyonu, fizik hissi, basılma feedback'i, component state matrisi, collapse tekniği,
> `prefers-reduced-motion` politikası ve Framer Motion motor kuralı.
>
> [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) ile **ikizdir**: 13 _"neye benziyor"_ (renk/radius/spacing/anatomi),
> 20 _"nasıl hareket ediyor"_ (zaman/easing/fizik/state geçişleri) sorusunu yanıtlar. Token isimleri, token rolleri,
> state matrisi ve fizik kuralları **bağlayıcıdır**; cubic-bezier/süre sayısal değerleri implementasyonda ince
> ayarlanabilir ama rol ve isim sabittir.
>
> **Motor kararı (kullanıcı seçimi, 2026-06-17):** Ağırlıklı **Framer Motion** (`motion` paketi — zaten kurulu).
> "shadcn/ui-only" kuralıyla çelişmez: `motion` bir _component library_ değil, bir _animasyon motoru_dur (Tiptap'ın
> headless editör olarak kabul edilmesiyle aynı mantık). Bkz. `02-teknoloji-kararlari.md` Karar kaydı 2026-06-17.

## 20.0 Felsefe — 10 ilke

Tüm bu belge aşağıdaki 10 ilkenin sistematik hâlidir:

1. **Varsayılan geçiş yok.** Arayüz animasyonlarında tarayıcı default'u (`ease`/`linear`) kullanılmaz; her geçiş bir
   token'lı `--ease-*` easing değeri taşır (§20.1).
2. **Token sistemi.** Renk, radius, süre, gölge ve animasyon değişkenden gelir; inline sihirli sayı (`300ms`,
   `cubic-bezier(...)` literal) yazılmaz (§20.1–20.2).
3. **Gerçekçi fizik.** Sürükleme, kaydırma ve hareketli bileşenler spring/momentum hissi taşır; lineer `tween` ile
   taşınmaz (§20.5).
4. **Snap & manyetik & direnç.** Drop hedefleri snap'lenir, yakın hedef manyetik çeker, sınırlarda hafif direnç
   (rubber-band) verilir (§20.5).
5. **Giriş = fade değil.** Mount animasyonu yalnız `opacity` değil; hafif yukarı hareket (`translateY`) + gerekiyorsa
   `blur` ile gelir (§20.4).
6. **Katmanlı gölge.** Tek `box-shadow` yerine 2+ katmanlı elevation sistemi; yükseklik arttıkça katman derinleşir
   (§20.3).
7. **Basılma hissi.** Tıklanabilir her öğe `pressed` (active) durumunda küçük bir ölçek/derinlik feedback'i verir
   (§20.6).
8. **`max-height` hilesi yasak.** Açılır/kapanır alanlar `max-height` transition'ı yerine `grid-template-rows` veya
   Framer `height: auto` layout animasyonu kullanır (§20.7).
9. **Erişilebilirlik.** `prefers-reduced-motion` her hareketli bileşende dikkate alınır; hareket azaltılır/kaldırılır
   ama işlev korunur (§20.8).
10. **Tam state seti.** Bir bileşen yalnız görünümden ibaret değildir; `idle / hover / pressed / focus-visible /
    loading / disabled / success` durumlarının tümü tasarlanır (§20.6).

## 20.1 Zaman & easing token'ları

Tailwind v4 + `@theme inline`. `packages/ui/src/styles/theme.css` `:root`/`.dark`'a eklenir, `@theme inline`'da
Tailwind utility'lerine map'lenir. Inline `cubic-bezier(...)` / ham `ms` değeri **yasak** — her geçiş token'dan gelir.

### Easing kataloğu (`--ease-*`)

| Token                | Değer (öneri)                       | Rol — ne zaman                                                                                          |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--ease-standard`    | `cubic-bezier(0.4, 0, 0.2, 1)`      | Genel amaçlı; renk/opaklık/küçük dönüşümler, hover/focus, çoğu UI geçişi. Şüphedeysen bunu kullan.       |
| `--ease-out`         | `cubic-bezier(0.16, 1, 0.3, 1)`     | Güçlü yavaşlama (decelerate). **Giriş animasyonları** — öğe hızlı girer, yumuşak durur (§20.4).          |
| `--ease-in`          | `cubic-bezier(0.4, 0, 1, 1)`        | Hızlanma (accelerate). **Çıkış animasyonları** — öğe ekrandan çıkarken ivmelenir.                        |
| `--ease-spring`      | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Overshoot/"pop". Basılma bırakma, toggle, küçük vurgular. Mevcut `card-complete` ailesinin akrabası.     |
| `--ease-emphasized`  | `cubic-bezier(0.22, 1, 0.36, 1)`    | Vurgulu yüzeyler — modal/sheet/popover açılışı; belirgin ama yumuşak.                                    |

> Spring **fizik** (gerçek yay) için CSS `cubic-bezier` yetmez → Framer `spring` preset'leri kullanılır (§20.5).
> `--ease-spring` yalnız tek-yönlü "pop" hissi gereken **CSS** geçişleri içindir.

### Süre ölçeği (`--duration-*`)

| Token                 | Değer (öneri) | Rol                                                                                       |
| --------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `--duration-instant`  | `80ms`        | Micro-feedback: `pressed` ölçek, ripple başlangıcı. "Anlık" hissi.                          |
| `--duration-fast`     | `140ms`       | Hover, focus halkası, küçük renk/opaklık değişimi, chip/badge.                              |
| `--duration-base`     | `220ms`       | Varsayılan. Modal içerik, dropdown, accordion, kart hover elevation.                        |
| `--duration-slow`     | `320ms`       | Büyük yüzey: modal kabuk, sidebar slide, liste collapse, sayfa düzeyi geçiş.                |
| `--duration-slower`   | `480ms`       | Kutlama/vurgu: `card-complete`, success onay animasyonu.                                    |

Eşleştirme kılavuzu: küçük öğe + kısa süre + `--ease-standard`; giriş + `--duration-base/slow` + `--ease-out`;
çıkış + `--ease-in`; modal + `--duration-slow` + `--ease-emphasized`; toggle/pop + `--ease-spring`.

## 20.2 `@theme inline` map & kullanım

`@theme inline` bloğunda token'lar Tailwind utility köküne map'lenir:

```css
@theme inline {
  /* Easing → Tailwind `ease-*` utility */
  --ease-standard: var(--ease-standard);
  --ease-out: var(--ease-out);
  --ease-in: var(--ease-in);
  --ease-spring: var(--ease-spring);
  --ease-emphasized: var(--ease-emphasized);

  /* Duration → Tailwind `duration-*` utility */
  --duration-instant: var(--duration-instant);
  --duration-fast: var(--duration-fast);
  --duration-base: var(--duration-base);
  --duration-slow: var(--duration-slow);
  --duration-slower: var(--duration-slower);
}
```

Kullanım (Tailwind class). **Not:** Tailwind v4'te `--ease-*` resmî theme namespace'tir → `ease-standard` /
`ease-spring` utility üretir. `--duration-*` için namespace **yok**; süre token'ı `duration-(--duration-base)`
shorthand'i (v4) veya component CSS'inde `var(--duration-base)` ile tüketilir.

```html
<!-- Doğru: token'lı geçiş -->
<button class="transition-transform duration-(--duration-instant) ease-spring active:scale-[0.97]">

<!-- Yanlış: ham değer -->
<button class="transition-transform duration-[83ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]">
```

Framer tarafında token'lar `packages/ui/src/lib/motion.ts`'ten okunur (§20.9) — JS'te de sihirli sayı yazılmaz.

## 20.3 Katmanlı gölge (elevation)

Tek `box-shadow` yerine **2+ katmanlı** sistem (yakın sıkı gölge + uzak yumuşak gölge). Mevcut token seti (light+dark)
korunur, roller netleşir:

| Token                 | Elevation | Rol                                                                            |
| --------------------- | --------- | ------------------------------------------------------------------------------ |
| _(yok)_               | 0         | Düz yüzey — kolon zemini, inline alan. Gölge yok.                               |
| `--shadow-card`       | 1         | Dinlenen kart, küçük yüzey. 2 katman.                                           |
| `--shadow-card-hover` | 2         | Hover'da yükselen kart; `--shadow-card` → bu, `--duration-base ease-standard`. |
| `--shadow-popover`    | 3         | Dropdown / popover / tooltip / küçük modal.                                     |
| `--shadow-drag`       | 4         | Sürüklenen öğe (drag overlay) — en yüksek, en derin gölge.                      |

Kurallar: (1) elevation **bir basamak** atlanmaz (0→2 değil, hover ile 1→2). (2) Hover'da elevation artışı her zaman
geçişli (`transition-shadow`), anlık değil. (3) Drag overlay daima `--shadow-drag` + hafif `rotate` (mevcut board
deseni — `card-drag-preview`/`renderLiftedPreview` korunur). (4) Yeni elevation gerekmedikçe bu 4 token dışına çıkma.

## 20.4 Giriş & çıkış animasyonları

**Giriş yalnız `fade` olamaz.** Mount animasyonu: `opacity 0→1` **+** hafif `translateY` (8–12px aşağıdan yukarı) +
ihtiyaç hâlinde `blur(4px)→0`. Easing `--ease-out`, süre `--duration-base` (küçük) / `--duration-slow` (büyük yüzey).

| Bağlam                       | Giriş                                                            | Çıkış                                            |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Liste içine yeni kart        | `opacity + translateY(8px→0)`, `--duration-base --ease-out`     | `opacity + scale(1→0.96)`, `--ease-in`           |
| Kart detay modalı            | `opacity + translateY(12px→0) + blur(4px→0) + scale(0.98→1)`    | tersine, `--ease-in` `--duration-fast`           |
| Dropdown / popover / tooltip | tw-animate-css `fade + zoom + slide-from-side` (token süreyle)  | `fade-out + zoom-out`                            |
| Sidebar / panel              | `translateX` + `opacity` (kenardan), `--duration-slow`          | tersine                                          |
| Toast (sonner)               | kenardan `translateY/X + opacity`                               | `opacity + scale`                                |

Liste/akış girişlerinde 30–50ms **stagger** (sıralı gecikme) tercih edilir ama uzun listede (>~12 öğe) ilk ekranla
sınırlı tut — her kartı tek tek canlandırma. Stagger Framer `staggerChildren` ile (§20.9).

## 20.5 Fizik hissi — drag, snap, manyetik, direnç

Board drag-drop motoru **Atlassian Pragmatic Drag and Drop**'tur (değişmez — `05-board-mekanigi.md`). Hareket sistemi
bunun _üstüne_ his katar; pointer takibi/hit-test PDnD'de kalır.

- **Drag lift:** Öğe sürüklenmeye başlayınca anlık değil kısa bir `scale(1→1.02) + rotate(~2deg) + shadow-drag`
  geçişiyle "kalkar" (`--duration-fast --ease-out`). Mevcut `card-drag-preview` (`rotate-2 shadow-md`) ve kolon
  `renderLiftedPreview` (`rotate(1deg)` + ağır gölge) bu kuralın uygulamasıdır; korunur, token'a bağlanır.
- **Snap:** Bırakma sonrası öğe hedef pozisyonuna **spring** ile oturur (anlık zıplama değil). Pragmatic DnD'nin
  "settle until cache update" akışı korunur; görünür yerleşme `springSmooth` ile yapılır.
- **Manyetik tutma:** Drop indicator/placeholder, en yakın geçerli hedefe yapışır (closest-edge — mevcut). Placeholder
  **belirir/kaybolurken** anlık değil `--duration-fast` ile fade+scale yapar (boş→dolu sıçraması olmaz).
- **Hafif direnç (rubber-band):** Sürükleme geçersiz bölgeye/sınıra taşındığında öğe oraya tam gitmez; hedefe doğru
  **sönümlenmiş** (damped) bir miktar hareket eder ("lastik" hissi). Auto-scroll kenarlarında da ivme yumuşaktır.
- **Momentum/scroll:** Yatay board scroll ve liste scroll'da native momentum korunur; programatik scroll
  `behavior: 'smooth'` + reduced-motion'da `'auto'`.

Spring preset'leri (`motion.ts`, §20.9):

| Preset         | Karakter                          | Kullanım                                   |
| -------------- | --------------------------------- | ------------------------------------------ |
| `springSnappy` | sert, hızlı oturur (az overshoot) | küçük öğe, press release, toggle thumb     |
| `springSmooth` | dengeli                           | kart snap, layout reorder, modal           |
| `springGentle` | yumuşak, geniş                    | büyük panel, sidebar, sayfa düzeyi         |

## 20.6 Component state matrisi (ZORUNLU)

Her **interaktif** bileşen şu state'lerin tümünü tasarlar. Eksik state, eksik bileşen demektir.

| State            | Görsel sözleşme                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `idle`           | Dinlenme; elevation 0/1, nötr renk.                                                                    |
| `hover`          | Hafif renk/elevation artışı, `--duration-fast --ease-standard`. (`touch:` cihazda hover'a bel bağlama.) |
| `pressed`        | **Basılma hissi:** `scale(0.97)` veya elevation düşüşü, `--duration-instant`. `active:` ile.            |
| `focus-visible`  | `ring-[3px] ring-ring` görünür halka (klavye erişilebilirliği — asla kaldırılmaz).                      |
| `loading`        | Spinner/skeleton, `aria-busy`, etkileşim kilidi (pointer-events kapalı ama layout sabit).              |
| `disabled`       | `opacity-50 pointer-events-none`, `aria-disabled`. İmleç `not-allowed`.                                 |
| `success`        | Geçici onay (tik/renk), `--ease-spring`; sonra `idle`'a döner. (Örn. `CardCompleteToggle`.)            |

**Basılma hissi** ilkesi: tıklanabilir her öğe (`button`, kart, menü öğesi, chip-buton, switch, checkbox) `pressed`
feedback'i taşır. `pointer` cihazda `active:scale-[0.97]`, `touch:` cihazda da çalışır (active touch'ta tetiklenir).

### Primitive uygulama matrisi (`packages/ui`)

| Bileşen          | Eklenecek                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `button.tsx`     | `active:scale-[0.97]` (pressed) · `loading` prop (spinner + `aria-busy` + disabled) · `success` varyant |
| `card.tsx`       | `interactive` varyantı: `hover:shadow-card-hover` + `active:scale-[0.99]` + `cursor-pointer`            |
| `checkbox.tsx`   | `active:scale-90` press; check geçişi `--ease-spring`                                                  |
| `switch.tsx`     | thumb `springSnappy`/`transition-transform`; press feedback                                            |
| `tabs.tsx`       | aktif sekme geçişi token'lı smooth (`--duration-base ease-standard`; renk/bg/shadow). Tam **kayan pill** (Framer `layoutId`) bir follow-up'tır — Radix `Tabs`'ın aktif-değerini bileşene açmayı gerektirir; bu kapsamda yapılmadı |
| `skeleton.tsx`   | `motion-reduce:animate-none`                                                                           |
| `dialog/popover/dropdown/tooltip` | hardcoded `duration-200` → `duration-base`; easing token'a bağlı                       |
| `progress.tsx`   | bar genişliği `--duration-base --ease-out`                                                             |

## 20.7 Açılır/kapanır alanlar — `max-height` yasağı

`max-height: 0 → 9999px` transition'ı **kullanılmaz** (yanlış süre eğrisi, içerik clipping, hesaplanamayan yükseklik).
Yerine, öncelik sırasıyla:

1. **Framer `motion` `height: auto`** layout animasyonu (`AnimatePresence` + `animate={{ height: 'auto' }}`) — ölçülen
   gerçek yüksekliğe spring ile açılır. Açıklama/checklist/yorum gibi dinamik içerik için tercih.
2. **CSS `grid-template-rows: 0fr → 1fr`** (içerik `overflow: hidden` bir child'da) — JS gerektirmeyen, ucuz, saf-CSS
   collapse. Basit, statik-yükseklikli alanlar için.
3. Liste kolonu daralt/genişlet zaten `width` + `overflow` swap kullanıyor (`list-column.tsx`); `max-height` değil —
   bu uyumludur, yalnız explicit `--duration-slow --ease-standard` verilir.

## 20.8 Reduced-motion politikası

Hareket bir tercih değil, erişilebilirlik gereğidir. İki katman:

1. **Global CSS sigorta** — `theme.css`'e:

   ```css
   @media (prefers-reduced-motion: reduce) {
     *,
     ::before,
     ::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```

   Bu, hiçbir şeyi unutsak bile büyük/dekoratif hareketi söndürür. `0.01ms` (0 değil) — `transitionend`/`animationend`
   bağımlı mantık çalışmaya devam etsin diye.

2. **Framer `useReducedMotion`** — JS animasyonlarında zorunlu. `true` ise: `translateY`/`blur`/`scale` giriş
   dönüşümleri kaldırılır, yalnız `opacity` fade (veya anlık geçiş) kalır; spring → `duration-fast` tween'e düşer;
   `layout`/stagger devre dışı. `sign-in` bileşenleri bu deseni zaten uyguluyor; `app-shell.tsx` paneline de eklenir
   (mevcut eksik).

**İşlev korunur:** Reduced-motion animasyonu kaldırır, _içeriği/erişimi_ değil. Açılan panel yine açılır (anlık),
modal yine görünür, drop yine olur.

## 20.9 Motor kuralı — Framer Motion vs saf CSS

`motion` paketi resmî motion motorudur (Karar 2026-06-17). Hangi durumda hangisi:

| Kullan **saf CSS / Tailwind**            | Kullan **Framer `motion`**                                    |
| ---------------------------------------- | ------------------------------------------------------------- |
| hover / focus / pressed state geçişleri  | mount/unmount (`AnimatePresence`) — kart/modal/panel giriş    |
| renk / opaklık / küçük transform         | layout animasyonu (reorder, `layoutId` tab indicator)         |
| tw-animate-css ile Radix open/close      | gerçek **spring fizik** (snap, drag settle, rubber-band)      |
| `card-complete` keyframe ailesi          | gesture (drag takip his katmanı), stagger                     |
| basit `grid-rows` collapse               | `height: auto` collapse                                       |

**Ortak yardımcılar** `packages/ui`'de tek yerde toplanır (kopyala-yapıştır animasyon yasak):

- `packages/ui/src/lib/motion.ts` — `durations` (token okur), `easings`, `springSnappy/Smooth/Gentle`,
  `fadeInUp` (variants), `prefersReducedMotion` yardımcıları.
- `packages/ui/src/components/motion/` — yeniden kullanılabilir primitive'ler:
  - `<Pressable>` — herhangi bir öğeye standart basılma hissi (`whileTap`/`active:scale`) + reduced-motion bilinçli.
  - `<FadeInUp>` — standart giriş (opacity + translateY [+ blur]); `AnimatePresence` dostu.
  - `<Collapse>` — `height: auto` açılır/kapanır (§20.7 madde 1).

Board ve uygulama kodu bu yardımcıları tüketir; her ekranda yeniden spring/variant tanımlamaz.

## 20.10 Uygulama haritası (faz)

Bu belge "önce belge"dir; uygulama şu sırayla yapılır (kod değişikliği bu belgede yok):

1. **Token altyapısı** — `theme.css`: `--ease-*`, `--duration-*`, elevation rol netleştirme, reduced-motion `@media`,
   `@theme inline` map (§20.1–20.3, 20.8).
2. **Primitive'ler + helper'lar** — `packages/ui`: `motion.ts` + `motion/` bileşenleri, primitive state matrisi
   (§20.6), `dialog/popover/dropdown` token bağlama, `app-shell` reduced-motion.
3. **Board uygulaması** — `apps/web`: modal açılış (shadcn Dialog), sidebar slide (grid-track geçişi), liste collapse
   (§20.7), kart hover/press token (§20.3/§20.6), drop placeholder opacity geçişi (§20.5).

   **Board kart giriş animasyonu — bilinçli ertelendi (follow-up):** Board kartları Pragmatic DnD ile `closest-edge`
   hit-test + "settle until cache update" akışında kartın `getBoundingClientRect` geometrisini okur; `FadeInUp`'ın
   mount `translateY` transform'u bu settle penceresinde kartı kaydırıp yanlış edge hesabı / görsel sıçrama riski
   yaratır. "Drag-drop sağlamlığı > giriş animasyonu" gereği board kartında giriş animasyonu uygulanmadı. Drop
   placeholder'ın görünür belir/kaybol fade'i de aynı nedenle (DOM'da exit boyunca kalma + yükseklik etkileşimi)
   ertelendi — şu an yalnız token'lı `opacity` geçişi var. İkisi de DnD geometri akışıyla birlikte test edilerek
   ileride `AnimatePresence` ile eklenebilir. Bu kısıt board'a özeldir; DnD olmayan listelerde (`FadeInUp`) giriş
   animasyonu §20.4 gereği serbesttir.

İlgili: bileşen anatomisi/spec → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md); board mekaniği/DnD →
[`05-board-mekanigi.md`](05-board-mekanigi.md); web pattern → [`08-web-ve-mobil.md`](08-web-ve-mobil.md).
