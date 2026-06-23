# App Store iPad Ekran Görüntüsü Prompt'ları (Pusula)

iPad **landscape** App Store görselleri için AI prompt koleksiyonu. Her ekran
için **ayrı** bir prompt var; her birinde Türkçe başlık + alt metin gömülü.

iPhone seti için bkz. [pusula-app-store-screenshot-prompts-iphone.md](./pusula-app-store-screenshot-prompts-iphone.md)

Kaynak ekran görüntüleri: [`ipad/1.png` … `ipad/7.png`](./ipad/) + tema seti
[`ipad/8-1.png` … `ipad/8-5.png`](./ipad/).

---

## ⚙️ Genel kurallar (her prompt için geçerli)

- **Hedef boyut:** Tam **2732 × 2048 px** (landscape). AI 4:3 üretir; çıktıyı
  yüklemeden önce **mutlaka** tam 2732×2048'e export/resize et. Apple **1 piksel**
  sapmayı bile reddeder.
- **Birincil renk:** `#00915B` (emerald / koyu zümrüt yeşili — Pusula varsayılan
  teması). Açık tema yüzeyi `#FFFFFF` (hafif yeşilimsi `#F1F6F3`), koyu tema
  `#111111`.
- **Screenshot yerleştirme:** İlgili ekran görüntüsünü AI aracına **reference/
  attach** olarak ver. Prompt "iPad ekranına birebir, distorsiyonsuz yerleştir"
  diyor — çıktıda ekranının düz ve okunur olduğunu kontrol et.
- **Türkçe metin tuzağı:** Bazı araçlar Türkçe karakterleri (ç ş ğ ı ö ü) bozar.
  **En iyi sonuç:** Ideogram, GPT-4o / ChatGPT image, Google Nano Banana (Gemini)
  veya Flux. **Midjourney metinde zayıf** — onu kullanırsan metni boş bırakıp
  sonradan Figma/Canva'da ekle. Çıktıdaki Türkçe harfleri tek tek doğrula.
- **Tipografi:** Başlık = kalın serif veya güçlü grotesk (uygulamanın Poppins
  başlık fontuyla uyumlu), alt metin = sade sans-serif.
- **Marka motifi:** Pusula = "pusula/compass". Arka plan dokusu için **soluk
  kanban motifleri** kullan: ince sütun/kart silüetleri, sürükle-bırak iz
  çizgileri, kartları bağlayan noktalı çizgiler ve çok hafif bir **pusula gülü /
  iğne** dokunuşu.

---

## 1) Giriş — "Ekibinizin işleri tek pusulada"

**Kullanılacak screenshot:** `ipad/1.png` (giriş ekranı — sol slogan, sağ giriş
formu, altta mini pano önizlemesi, açık tema).

**Metin:**
- Başlık: «Ekibinizin işleri tek pusulada»
- Alt metin: «Çalışma alanı, pano ve kart — web, mobil ve masaüstünde tek arada»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro shown in landscape, floating on the right side
with a subtle 3D perspective tilt, thin uniform bezels and a soft realistic
shadow. Place the provided sign-in screenshot perfectly inside the iPad screen —
edge to edge, crisp, sharp, no distortion, respecting rounded corners.

Background: elegant deep emerald gradient built on #00915B, fading darker in the
corners, with very faint kanban-board motifs in a slightly lighter emerald —
thin column outlines, floating card silhouettes and a soft drag trail — for
subtle texture. Clean, sophisticated productivity-app aesthetic.

On the LEFT third (clean negative space) render this exact Turkish text, keeping
all Turkish characters intact:
  Headline (large bold serif, white):  «Ekibinizin işleri tek pusulada»
  Subheadline (smaller clean sans, light gray):  «Çalışma alanı, pano ve kart —
  web, mobil ve masaüstünde tek arada»

Soft studio lighting, high-end product photography, 8k, polished, Apple-style
minimalism. No logos, no extra UI overlays.
```

---

## 2) Pano — "Sürükle, bırak, ak"

**Kullanılacak screenshot:** `ipad/2.png` (Ürün Yol Haritası kanban panosu —
Backlog / Sprint / Geliştirmede / İncelemede dört liste, açık tema).

**Metin:**
- Başlık: «Sürükle, bırak, ak»
- Alt metin: «Kanban panolarını saniyeler içinde düzenle»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro centered and nearly front-facing with a very
slight tilt, thin bezels, soft shadow, floating. Place the provided kanban-board
screenshot inside the iPad screen — full bleed, crisp, no distortion.

Background: rich emerald gradient on #00915B with a faint motif of board columns
and a curved drag-and-drop trail in a slightly lighter tone, subtle vignette.
Modern productivity-app feel.

Render this exact Turkish text at the TOP center, keeping Turkish characters:
  Headline (bold serif, white):  «Sürükle, bırak, ak»
  Subheadline (clean sans, light gray):  «Kanban panolarını saniyeler içinde
  düzenle»

Cinematic soft lighting, 8k, premium, minimal. No logos.
```

---

## 3) Kart Detayı — "Her kartın tüm hikâyesi"

**Kullanılacak screenshot:** `ipad/3.png` (Kart detayı — kapak, solda açıklama,
sağda kontrol listeleri, altta ekler/yorumlar/aktivite, açık tema).

**Metin:**
- Başlık: «Her kartın tüm hikâyesi»
- Alt metin: «Açıklama, kontrol listesi, ek, yorum ve aktivite tek ekranda»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro positioned on the LEFT, angled with a 3D
perspective tilt toward the viewer, thin bezels, soft realistic shadow. Place
the provided card-detail screenshot inside the iPad screen — edge to edge,
sharp, undistorted.

Background: deep emerald #00915B gradient, faint checklist / attachment /
comment glyph motifs in a slightly lighter emerald on the right side as subtle
texture, soft ambient light.

On the RIGHT side (clean negative space) render this exact Turkish text, keeping
Turkish characters:
  Headline (large bold serif, white):  «Her kartın tüm hikâyesi»
  Subheadline (clean sans, light gray):  «Açıklama, kontrol listesi, ek, yorum ve
  aktivite tek ekranda»

High-end product photography, 8k, polished, Apple-style minimalism. No logos.
```

---

## 4) Bildirimler — "Hiçbir gelişmeyi kaçırma"

**Kullanılacak screenshot:** `ipad/4.png` (Bildirimler — solda liste, sağda
bildirim detayı + "Karta git", açık tema; tablet master-detail düzeni).

**Metin:**
- Başlık: «Hiçbir gelişmeyi kaçırma»
- Alt metin: «Atama, yorum ve teslim tarihleri anında; tek dokunuşla karta git»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro floating with a gentle perspective tilt,
slightly right of center, thin bezels, soft shadow. Place the provided
notifications (master-detail) screenshot inside the iPad screen — full bleed,
crisp, no distortion.

Background: warm emerald gradient on #00915B, with faint bell, @-mention and
activity-dot motifs in a slightly lighter tone for texture, soft vignette.

On the UPPER-LEFT (clean negative space) render this exact Turkish text, keeping
Turkish characters:
  Headline (bold serif, white):  «Hiçbir gelişmeyi kaçırma»
  Subheadline (clean sans, light gray):  «Atama, yorum ve teslim tarihleri anında;
  tek dokunuşla karta git»

Soft studio lighting, 8k, premium, minimal. No logos.
```

---

## 5) Koyu Tema — "Gece de gündüz de akıcı"

**Kullanılacak screenshot:** `ipad/5.png` ("Ev & Düzen" kanban panosu, **koyu
tema** — Yapılacaklar / Bu Hafta / Bekliyor / Devam Eden listeleri).

**Metin:**
- Başlık: «Gece de gündüz de akıcı»
- Alt metin: «Açık ve koyu mod, göz yormadan çalış»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro floating with a subtle 3D tilt, centered-right,
thin bezels, soft shadow. Place the provided DARK-MODE kanban-board screenshot
inside the iPad screen — edge to edge, sharp, no distortion.

Background: dramatic dark gradient blending near-black #111111 with deep emerald
#00915B toward the edges, faint glowing board-column and drag-trail lines in
emerald, moody and premium.

On the LEFT (clean negative space) render this exact Turkish text, keeping
Turkish characters:
  Headline (large bold serif, white):  «Gece de gündüz de akıcı»
  Subheadline (clean sans, light gray):  «Açık ve koyu mod, göz yormadan çalış»

Cinematic lighting, 8k, premium, minimal. No logos.
```

---

## 6) Görünüm / Tema — "Sana göre kişiselleştir"

**Kullanılacak screenshot:** `ipad/6.png` (Hesap → Görünüm: tema (açık/koyu/
sistem), 15 renk teması paleti, yazı tipi seçimi; tablet master-detail düzeni).

**Metin:**
- Başlık: «Sana göre kişiselleştir»
- Alt metin: «15 renk teması, açık & koyu mod ve kendi yazı tipin»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro floating with a subtle 3D tilt, centered-right,
thin bezels, soft realistic shadow. Place the provided appearance/settings
(master-detail) screenshot inside the iPad screen — full bleed, crisp, no
distortion.

Background: elegant emerald gradient on #00915B with a soft scatter of small
color swatches (faint green, blue, orange, pink, dark) floating as subtle
texture, sophisticated mood.

On the LEFT (clean negative space) render this exact Turkish text, keeping
Turkish characters:
  Headline (large bold serif, white):  «Sana göre kişiselleştir»
  Subheadline (clean sans, light gray):  «15 renk teması, açık & koyu mod ve
  kendi yazı tipin»

High-end product photography, 8k, polished, minimal. No logos.
```

---

## 7) Hakkında — "Her yerde senkron"

**Kullanılacak screenshot:** `ipad/7.png` (Hakkında — Pusula, öne çıkanlar: akıcı
kanban, çalışma alanı & yetki, anlık bildirim, her yerde senkron; master-detail).

**Metin:**
- Başlık: «Her yerde senkron»
- Alt metin: «Web, mobil ve masaüstünde aynı an, aynı pano»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A modern iPad Pro front-facing with a barely-there tilt, centered,
thin bezels, soft shadow, calm and editorial. Place the provided About
(master-detail) screenshot inside the iPad screen — full bleed, crisp, no
distortion.

Background: refined deep emerald #00915B, mostly solid with a soft radial glow
behind the device and faint concentric sync-arc / compass-ring lines in a
lighter emerald, very minimal and elegant.

Render this exact Turkish text on the LEFT (generous negative space), keeping
Turkish characters:
  Headline (large bold serif, white):  «Her yerde senkron»
  Subheadline (clean sans, light gray):  «Web, mobil ve masaüstünde aynı an,
  aynı pano»

Cinematic soft lighting, 8k, premium, editorial minimalism. No logos.
```

---

## 8) Renk Temaları (BONUS) — "Rengini seç"

**Kullanılacak screenshot'lar:** `ipad/8-1.png` … `ipad/8-5.png` — aynı kanban
pano ekranının 5 farklı renk temasındaki hâli (yeşil/varsayılan, açık+turuncu,
açık+turkuaz, koyu+mavi, sıcak koyu+turuncu). **Beşini birden** referans olarak
ver.

**Metin:**
- Başlık: «Rengini seç»
- Alt metin: «15 hazır renk teması, açık & koyu mod — panonu kişiselleştir»

```
Premium App Store marketing screenshot, 4:3 landscape, export at exactly
2732x2048 px. A single modern iPad Pro centered with a very slight tilt, thin
bezels, soft shadow. Inside the iPad screen, show the SAME Pusula kanban-board
UI but split the screen into 5 clean vertical SLICES from left to right, each
slice rendering the app in a different color theme using the 5 provided
reference screenshots in order:
  slice 1 = emerald green (light, default),
  slice 2 = orange (light),
  slice 3 = teal / turquoise (light),
  slice 4 = blue (dark),
  slice 5 = warm orange (dark).
Keep the slices perfectly vertical, equal width, seamless, edge to edge inside
the screen — like one board shown in five themes at once. Crisp, no distortion.

Background (outside the iPad): elegant deep emerald gradient on #00915B with a
faint scatter of colorful theme swatches as subtle texture.

Render this exact Turkish text at the TOP center, keeping Turkish characters:
  Headline (large bold serif, white):  «Rengini seç»
  Subheadline (clean sans, light gray):  «15 hazır renk teması, açık & koyu mod
  — panonu kişiselleştir»

Soft studio lighting, 8k, premium, minimal. No logos.
```

> **İpucu:** AI tek ekranı 5 dilime düzgün bölemezse, 5 referans ekranını
> Figma/Canva'da yan yana dikey şeritler hâlinde birleştirip tek bir kompozit
> "ekran" görüntüsü hazırla, sonra onu bu prompt'ta tek screenshot olarak iPad'e
> yerleştir.

---

## Önerilen sıra (App Store galerisi)

1. Giriş → 2. Pano → 3. Kart Detayı → 4. Bildirimler → 5. Renk Temaları →
6. Koyu Tema → 7. Hakkında

İlk 2-3 görsel en kritik (App Store'da önce onlar görünür) — en güçlü ekranları
(**Pano** ve **Renk Temaları**) başa koy. Minimum 1, maksimum 10 görsel
yükleyebilirsin. iPhone seti ile aynı başlık dilini kullandık → iki cihazda
tutarlı bir marka anlatımı.
