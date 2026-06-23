# App Store iPhone Ekran Görüntüsü Prompt'ları (Pusula)

iPhone **portrait** App Store görselleri için AI prompt koleksiyonu. Her ekran
için ayrı prompt; her birinde Türkçe başlık + alt metin gömülü.

iPad seti için bkz. [pusula-app-store-screenshot-prompts-ipad.md](./pusula-app-store-screenshot-prompts-ipad.md)

Kaynak ekran görüntüleri: [`iphone/1.png` … `iphone/7.png`](./iphone/) + tema seti
[`iphone/8-1.png` … `iphone/8-5.png`](./iphone/).

---

## ⚙️ Genel kurallar (her prompt için geçerli)

- **Hedef boyut:** Tam **1242 × 2688 px** (portrait, 6.5"). AI bu uzun oranı tam
  veremez; çıktıyı yüklemeden önce **mutlaka** tam 1242×2688'e crop/export et.
  Apple **1 piksel** sapmayı reddeder.
  > Not: Apple'ın güncel **birincil** zorunlu boyutu **6.9" → 1290 × 2796**.
  > 1242×2688 (6.5") hâlâ kabul edilen bir slot; ikisinden birini kullanabilirsin
  > ama ASC yükleme ekranında hangi slotun istendiğini teyit et.
- **Birincil renk:** `#00915B` (emerald / koyu zümrüt yeşili — Pusula varsayılan
  teması). Açık tema yüzeyi `#FFFFFF` (hafif yeşilimsi `#F1F6F3`), koyu tema
  `#111111`.
- **Screenshot yerleştirme:** İlgili ekran görüntüsünü AI aracına **reference/
  attach** olarak ver. Prompt "iPhone ekranına birebir, distorsiyonsuz yerleştir"
  diyor — çıktıda ekranının düz ve okunur olduğunu kontrol et.
- **Türkçe metin tuzağı:** Bazı araçlar Türkçe karakterleri (ç ş ğ ı ö ü) bozar.
  **En iyi sonuç:** Ideogram, GPT-4o / ChatGPT image, Google Nano Banana (Gemini)
  veya Flux. **Midjourney metinde zayıf** — onu kullanırsan metni boş bırakıp
  sonradan Figma/Canva'da ekle. Çıktıdaki Türkçe harfleri tek tek doğrula.
- **Tipografi:** Başlık = kalın serif veya güçlü grotesk, alt metin = sade
  sans-serif. (Pusula uygulama fontu Poppins ile uyumlu, temiz ve modern.)
- **Marka motifi:** Pusula = "pusula/compass". Arka plan dokusu için topografik
  harita yerine **soluk kanban motifleri** kullan: ince sütun/kart silüetleri,
  sürükle-bırak iz çizgileri, kartları birbirine bağlayan noktalı çizgiler ve çok
  hafif bir **pusula gülü / iğne** dokunuşu.
- **Düzen mantığı (portrait):** Metin **üstte** (1-2 satır başlık + 1 satır alt
  metin), telefon **altta**. Çeşitlilik için bazı görsellerde telefon hafif açılı,
  bazılarında düz/merkezde.

---

## 1) Giriş — "Ekibinizin işleri tek pusulada"

**Kullanılacak screenshot:** `iphone/1.png` (giriş ekranı — "Ekibinizin işleri
tek pusulada" sloganı + giriş formu, açık tema).

**Metin:**
- Başlık: «Ekibinizin işleri tek pusulada»
- Alt metin: «Çalışma alanı, pano ve kart — hepsi bir arada»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone (thin bezels, Dynamic Island) shown
upright and centered in the lower two-thirds, slight floating shadow. Place the
provided sign-in screenshot perfectly inside the phone screen — edge to edge,
crisp, sharp, no distortion, respecting rounded corners.

Background: elegant deep emerald gradient on #00915B, fading slightly darker at
the bottom, with very faint kanban-board motifs in a lighter emerald — thin
column outlines, floating card silhouettes and a soft drag-and-drop trail — for
subtle texture. Clean, modern productivity-app aesthetic.

In the TOP area (clean space above the phone) render this exact Turkish text,
centered, keeping all Turkish characters:
  Headline (large bold serif, white):  «Ekibinizin işleri tek pusulada»
  Subheadline (smaller clean sans, light gray):  «Çalışma alanı, pano ve kart —
  hepsi bir arada»

Soft studio lighting, 8k, polished, Apple-style minimalism. No logos.
```

---

## 2) Çalışma Alanları — "İşine sıfır sürtünmeyle başla"

**Kullanılacak screenshot:** `iphone/2.png` (Çalışma Alanları — hızlı notlar +
çalışma alanı kartları, açık tema).

**Metin:**
- Başlık: «İşine sıfır sürtünmeyle başla»
- Alt metin: «Çalışma alanların ve hızlı notların tek ekranda»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered, filling most of the
lower frame, thin bezels, soft shadow. Place the provided workspaces screenshot
inside the phone screen — full bleed, crisp, no distortion.

Background: rich emerald gradient on #00915B with faint abstract kanban column
and stacked-card motifs in a slightly lighter tone, subtle vignette.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (bold serif, white):  «İşine sıfır sürtünmeyle başla»
  Subheadline (clean sans, light gray):  «Çalışma alanların ve hızlı notların
  tek ekranda»

Cinematic soft lighting, 8k, premium, minimal. No logos.
```

---

## 3) Pano — "Sürükle, bırak, ak"

**Kullanılacak screenshot:** `iphone/3.png` (Ürün Yol Haritası kanban panosu —
Backlog / Sprint listeleri, renkli etiketli kartlar, açık tema).

**Metin:**
- Başlık: «Sürükle, bırak, ak»
- Alt metin: «Kanban panolarını saniyeler içinde düzenle»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone tilted slightly to one side with a gentle
3D perspective, positioned in the lower two-thirds, thin bezels, soft realistic
shadow. Place the provided kanban-board screenshot inside the phone screen —
edge to edge, sharp, undistorted.

Background: deep emerald #00915B gradient with a faint motif of board columns
and a curved drag-and-drop trail in a slightly lighter emerald as subtle
texture, soft ambient light.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Sürükle, bırak, ak»
  Subheadline (clean sans, light gray):  «Kanban panolarını saniyeler içinde
  düzenle»

High-end product photography, 8k, polished, minimal. No logos.
```

---

## 4) Kart Detayı — "Her kartın tüm hikâyesi"

**Kullanılacak screenshot:** `iphone/4.png` (Kart detayı — kapak görseli,
açıklama, kontrol listeleri, açık tema).

**Metin:**
- Başlık: «Her kartın tüm hikâyesi»
- Alt metin: «Açıklama, kontrol listesi, ek ve yorum tek kartta»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered in the lower frame, thin
bezels, soft shadow. Place the provided card-detail screenshot inside the phone
screen — full bleed, crisp, no distortion.

Background: warm emerald gradient on #00915B with faint motifs of a checklist,
attachment and comment glyph in a slightly lighter tone for texture, soft
vignette.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (bold serif, white):  «Her kartın tüm hikâyesi»
  Subheadline (clean sans, light gray):  «Açıklama, kontrol listesi, ek ve yorum
  tek kartta»

Soft studio lighting, 8k, premium, minimal. No logos.
```

---

## 5) Bildirimler — "Hiçbir gelişmeyi kaçırma"

**Kullanılacak screenshot:** `iphone/5.png` (Bildirimler listesi — atama, rol
değişimi, yorum, teslim tarihi bildirimleri, açık tema).

**Metin:**
- Başlık: «Hiçbir gelişmeyi kaçırma»
- Alt metin: «Atama, yorum ve teslim tarihleri anında cebinde»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone tilted slightly with a subtle 3D
perspective, lower two-thirds, thin bezels, soft realistic shadow. Place the
provided notifications screenshot inside the phone screen — edge to edge, sharp,
undistorted.

Background: elegant emerald gradient on #00915B with faint bell, @-mention and
activity-dot motifs in a lighter emerald line style, very subtle.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Hiçbir gelişmeyi kaçırma»
  Subheadline (clean sans, light gray):  «Atama, yorum ve teslim tarihleri anında
  cebinde»

High-end product photography, 8k, polished, minimal. No logos.
```

---

## 6) Hesap / Tema — "Sana göre bir görünüm"

**Kullanılacak screenshot:** `iphone/6.png` (Hesap → Görünüm: açık/koyu mod, renk
teması paleti, yazı tipi seçimi).

**Metin:**
- Başlık: «Sana göre bir görünüm»
- Alt metin: «15 renk teması, açık ve koyu mod, kendi yazı tipin»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, front-facing, centered, thin
bezels, soft shadow. Place the provided appearance/settings screenshot inside
the phone screen — full bleed, crisp, no distortion, respecting rounded corners.

Background: refined emerald #00915B gradient with a soft scatter of small color
swatches (faint green, blue, orange, pink, dark) floating as subtle texture,
elegant and minimal.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Sana göre bir görünüm»
  Subheadline (clean sans, light gray):  «15 renk teması, açık ve koyu mod,
  kendi yazı tipin»

Cinematic soft lighting, 8k, premium, minimal. No logos.
```

---

## 7) Koyu Tema — "Gece de gündüz de akıcı"

**Kullanılacak screenshot:** `iphone/7.png` (Kart detayı, **koyu tema** — koyu
zümrüt yüzey; "Gelişmiş arama filtreleri" kartı, açıklama + kontrol listeleri).

**Metin:**
- Başlık: «Gece de gündüz de akıcı»
- Alt metin: «Açık ve koyu mod, göz yormadan çalış»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A modern iPhone upright, centered in the lower frame, thin
bezels, Dynamic Island, soft shadow. Place the provided DARK-MODE card-detail
screenshot inside the phone screen — edge to edge, sharp, no distortion,
respecting rounded corners.

Background: dramatic dark gradient blending near-black #111111 with deep emerald
#00915B toward the edges, faint glowing board-column and drag-trail lines in
emerald, moody and premium.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Gece de gündüz de akıcı»
  Subheadline (clean sans, light gray):  «Açık ve koyu mod, göz yormadan çalış»

Cinematic lighting, 8k, premium, minimal. No logos.
```

---

## 8) Renk Temaları (BONUS) — "Rengini seç"

**Kullanılacak screenshot'lar:** `iphone/8-1.png` … `iphone/8-5.png` — aynı kart
detay ekranının 5 farklı renk temasındaki hâli (yeşil/varsayılan, koyu+yeşil,
sıcak koyu+turuncu, açık+turuncu, açık+mavi). **Beşini birden** referans olarak
ver.

**Metin:**
- Başlık: «Rengini seç»
- Alt metin: «15 hazır renk teması, açık & koyu mod — panonu kişiselleştir»

```
Premium App Store iPhone marketing screenshot, vertical portrait, export at
exactly 1242x2688 px. A single modern iPhone upright, centered in the lower
two-thirds, thin bezels, soft shadow. Inside the phone screen, show the SAME
Pusula card-detail UI but split the screen into 5 clean vertical SLICES from
left to right, each slice rendering the app in a different color theme using the
5 provided reference screenshots in order:
  slice 1 = emerald green (light),
  slice 2 = emerald green (dark),
  slice 3 = warm orange (dark),
  slice 4 = orange (light),
  slice 5 = blue (light).
Keep the slices perfectly vertical, equal width, seamless, edge to edge inside
the screen — like one app shown in five themes at once. Crisp, no distortion.

Background (outside the phone): elegant deep emerald gradient on #00915B with a
faint scatter of colorful theme swatches as subtle texture.

In the TOP area render this exact Turkish text, centered, keeping Turkish
characters:
  Headline (large bold serif, white):  «Rengini seç»
  Subheadline (clean sans, light gray):  «15 hazır renk teması, açık & koyu mod
  — panonu kişiselleştir»

Soft studio lighting, 8k, premium, minimal. No logos.
```

> **İpucu:** AI tek ekranı 5 dilime düzgün bölemezse, 5 referans ekranını
> Figma/Canva'da yan yana dikey şeritler hâlinde birleştirip tek bir kompozit
> "ekran" görüntüsü hazırla, sonra onu bu prompt'ta tek screenshot olarak
> telefona yerleştir.

---

## Önerilen sıra (App Store galerisi)

1. Giriş → 2. Pano → 3. Kart Detayı → 4. Bildirimler → 5. Renk Temaları →
6. Çalışma Alanları → 7. Koyu Tema

İlk 2-3 görsel en kritik (App Store'da önce onlar görünür). En güçlü ekran olan
**Pano (sürükle-bırak)** ve **Renk Temaları**'nı başa yaklaştır. Minimum 1,
maksimum 10 görsel yükleyebilirsin. iPad seti ile aynı başlık dilini kullandık →
iki cihazda tutarlı bir marka anlatımı.
