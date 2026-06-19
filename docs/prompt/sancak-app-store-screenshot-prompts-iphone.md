# App Store iPhone Ekran Görüntüsü Prompt'ları (Sancak)

iPhone **portrait** App Store görselleri için AI prompt koleksiyonu. Her ekran
için ayrı prompt; her birinde Türkçe başlık + alt metin gömülü.

iPad seti için bkz. [app-store-screenshot-prompts.md](./app-store-screenshot-prompts.md)

---

## ⚙️ Genel kurallar (her prompt için geçerli)

- **Hedef boyut:** Tam **1242 × 2688 px** (portrait, 6.5"). AI bu uzun oranı tam
  veremez; çıktıyı yüklemeden önce **mutlaka** tam 1242×2688'e crop/export et.
  Apple **1 piksel** sapmayı reddeder.
  > Not: Apple'ın güncel **birincil** zorunlu boyutu **6.9" → 1290 × 2796**.
  > 1242×2688 (6.5") hâlâ kabul edilen bir slot; ikisinden birini kullanabilirsin
  > ama ASC yükleme ekranında hangi slotun istendiğini teyit et.
- **Birincil renk:** `#7C2D3E` (koyu bordo / maroon). Açık tema yüzeyi `#FAFAF7`,
  koyu tema `#111111`.
- **Screenshot yerleştirme:** İlgili ekran görüntüsünü AI aracına **reference/
  attach** olarak ver. Prompt "iPhone ekranına birebir, distorsiyonsuz yerleştir"
  diyor — çıktıda ekranının düz ve okunur olduğunu kontrol et.
- **Türkçe metin tuzağı:** Bazı araçlar Türkçe karakterleri (ç ş ğ ı ö ü) bozar.
  **En iyi sonuç:** Ideogram, GPT-4o / ChatGPT image, Google Nano Banana (Gemini)
  veya Flux. **Midjourney metinde zayıf** — onu kullanırsan metni boş bırakıp
  sonradan Figma/Canva'da ekle. Çıktıdaki Türkçe harfleri tek tek doğrula.
- **Tipografi:** Başlık = kalın serif, alt metin = sade sans-serif.
- **Düzen mantığı (portrait):** Metin **üstte** (1-2 satır başlık + 1 satır alt
  metin), telefon **altta**. Çeşitlilik için bazı görsellerde telefon hafif açılı,
  bazılarında düz/merkezde.

---

## 1) Ana Sayfa — "Tüm Türkiye, tek ekranda"

**Kullanılacak screenshot:** Ana Sayfa (açık tema, manşet + istatistikler).

**Metin:**
- Başlık: «Tüm Türkiye, tek ekranda»
- Alt metin: «81 il, 973 ilçe, her vali ve kaymakam»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone (thin bezels, Dynamic Island) shown
upright and centered in the lower two-thirds, slight floating shadow. Place the
provided app screenshot perfectly inside the phone screen — edge to edge, crisp,
sharp, no distortion, respecting rounded corners.

Background: elegant deep burgundy gradient on #7C2D3E, fading slightly darker at
the bottom, with very faint topographic map contour lines in a lighter burgundy
for subtle texture.

In the TOP area (clean space above the phone) render this exact Turkish text,
centered, keeping all Turkish characters:
  Headline (large bold serif, white):  «Tüm Türkiye, tek ekranda»
  Subheadline (smaller clean sans, light gray):  «81 il, 973 ilçe, her vali ve
  kaymakam»

Soft studio lighting, 8k, polished, Apple-style minimalism. No logos.
```

---

## 2) Harita — "Dokun, keşfet"

**Kullanılacak screenshot:** Harita (sınıf renklendirmeli tam ekran).

**Metin:**
- Başlık: «Dokun, keşfet»
- Alt metin: «İl ve ilçeleri sınıf, gelişmişlik ve döneme göre renkli incele»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered, filling most of the
lower frame, thin bezels, soft shadow. Place the provided map screenshot inside
the phone screen — full bleed, crisp, no distortion.

Background: rich burgundy gradient on #7C2D3E with a faint abstract map
graticule / grid pattern in a slightly lighter tone, subtle vignette.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (bold serif, white):  «Dokun, keşfet»
  Subheadline (clean sans, light gray):  «İl ve ilçeleri sınıf, gelişmişlik ve
  döneme göre renkli incele»

Cinematic soft lighting, 8k, premium, minimal. No logos.
```

---

## 3) İl Profili — "Her ilin künyesi"

**Kullanılacak screenshot:** İller → Ankara detay (künye + vali).

**Metin:**
- Başlık: «Her ilin künyesi»
- Alt metin: «Nüfus, yüzölçümü, vali ve idari yapı tek kartta»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone tilted slightly to one side with a gentle
3D perspective, positioned in the lower two-thirds, thin bezels, soft realistic
shadow. Place the provided province-detail screenshot inside the phone screen —
edge to edge, sharp, undistorted.

Background: deep burgundy #7C2D3E gradient with a faint dotted map of Turkey in
a slightly lighter burgundy as subtle texture, soft ambient light.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Her ilin künyesi»
  Subheadline (clean sans, light gray):  «Nüfus, yüzölçümü, vali ve idari yapı
  tek kartta»

High-end product photography, 8k, polished, minimal. No logos.
```

---

## 4) Haberler — "Gündemi kaçırma"

**Kullanılacak screenshot:** Haberler (manşet + haber listesi).

**Metin:**
- Başlık: «Gündemi kaçırma»
- Alt metin: «Mülki idareden son haberler ve atama kararları»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered in the lower frame, thin
bezels, soft shadow. Place the provided news-feed screenshot inside the phone
screen — full bleed, crisp, no distortion.

Background: warm burgundy gradient on #7C2D3E with faint abstract newspaper /
column line motifs in a slightly lighter tone for texture, soft vignette.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (bold serif, white):  «Gündemi kaçırma»
  Subheadline (clean sans, light gray):  «Mülki idareden son haberler ve atama
  kararları»

Soft studio lighting, 8k, premium, minimal. No logos.
```

---

## 5) Rehber — "Mülki idareyi öğren"

**Kullanılacak screenshot:** Rehber (illüstrasyonlu konu kartları).

**Metin:**
- Başlık: «Mülki idareyi öğren»
- Alt metin: «38 konuda kariyer ve mevzuat rehberi»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone tilted slightly with a subtle 3D
perspective, lower two-thirds, thin bezels, soft realistic shadow. Place the
provided guide/Rehber screenshot inside the phone screen — edge to edge, sharp,
undistorted.

Background: elegant burgundy gradient on #7C2D3E with faint hand-drawn civic
illustration motifs (flag, building, map pin) in a lighter burgundy line style,
very subtle, scholarly mood.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Mülki idareyi öğren»
  Subheadline (clean sans, light gray):  «38 konuda kariyer ve mevzuat rehberi»

High-end product photography, 8k, polished, minimal. No logos.
```

---

## 6) Hakkında / Manifesto — "Bilginin haritası kamusaldır"

**Kullanılacak screenshot:** Daha Fazla → Hakkında (manifesto).

**Metin:**
- Başlık: «Bilginin haritası kamusaldır»
- Alt metin: «Açık, bağımsız, herkes için bir veri projesi»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, front-facing, centered, thin
bezels, soft shadow, calm and editorial. Place the provided About/manifesto
screenshot inside the phone screen — full bleed, crisp, no distortion.

Background: refined deep burgundy #7C2D3E, mostly solid with a soft radial glow
behind the device, very minimal and elegant.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Bilginin haritası kamusaldır»
  Subheadline (clean sans, light gray):  «Açık, bağımsız, herkes için bir veri
  projesi»

Cinematic soft lighting, 8k, premium, editorial minimalism. No logos.
```

---

## 7) Koyu Tema — "Gözüne göre tema"

**Kullanılacak screenshot:** Hakkında **koyu tema** (manifesto, dark mode).

**Metin:**
- Başlık: «Gözüne göre tema»
- Alt metin: «Açık ve koyu tema, gece gündüz rahat okuma»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered in the lower frame, thin
bezels, Dynamic Island, soft shadow. Place the provided DARK-MODE screenshot
inside the phone screen — edge to edge, sharp, no distortion, respecting rounded
corners.

Background: dramatic dark gradient blending near-black #111111 with deep burgundy
#7C2D3E toward the edges, faint glowing map contour lines in burgundy, moody and
premium.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Gözüne göre tema»
  Subheadline (clean sans, light gray):  «Açık ve koyu tema, gece gündüz rahat
  okuma»

Cinematic lighting, 8k, premium, minimal. No logos.
```

---

## Önerilen sıra (App Store galerisi)

1. Ana Sayfa → 2. Harita → 3. İl Profili → 4. Haberler → 5. Rehber →
6. Hakkında → 7. Koyu Tema

İlk 2-3 görsel en kritik (App Store'da önce onlar görünür). Minimum 1, maksimum
10 görsel yükleyebilirsin. iPad seti ile aynı başlıkları kullandık → iki cihazda
tutarlı bir marka dili.
