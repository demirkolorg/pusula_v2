---
title: '18 — iPad Uyarlaması'
description: 'Pusula mobil uygulamasının iPad-native uyarlaması (Faz 15): supportsTablet, breakpoint, master-detail (kart detayı yan-yana açıklama+kontrol dahil), landscape, floating pill bottom nav, sheet→popover, asset varyantları, App Store geçişi.'
aliases:
  - 'iPad Uyarlaması'
  - 'Tablet Layout'
  - 'Faz 15 Mimari'
tags:
  - 'pusula'
  - 'architecture/ipad'
  - 'mobile'
  - 'responsive'
type: 'architecture'
axis: 'architecture'
status: 'planned'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/08-web-ve-mobil|08 — Web ve Mobil]]'
  - '[[docs/architecture/13-ui-tasarim-dili|13 — UI Tasarım Dili]]'
  - '[[docs/architecture/02-teknoloji-kararlari|02 — Teknoloji Kararları]]'
  - '[[docs/process/02-mvp-faz-plani|02 — MVP Faz Planı]]'
updated: 2026-05-31
implementation: 'Faz 15 (DEM-299 epic) — 15.0/15A/15B/15C/15D/15E (revize)/15F/15H alt işleri; ~9-11 iş günü, sürüm v1.1.0'
---

# 18 — iPad Uyarlaması

> Eksen: **tasarım / teknik** — `apps/mobile` Expo uygulamasının iPad-native uyarlama planı. Faz 7O (2026-05-21, App Store v1.0.0 build 6) ile iPhone-only yayınlandı; bu belge **Faz 15 ile** `supportsTablet: true` geçişinin mimari kararlarını ve uygulama planını sabitler.

İlgili Linear: [DEM-299](https://linear.app/demirkol/issue/DEM-299) (epic) → DEM-300 (15.0 önce-belge) → DEM-301..306. Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) "Karar kaydı" 2026-05-31 satırı (Faz 7O `supportsTablet: false` kararı revize edildi).

## 1. Niçin ayrı dosya?

Faz 7 (Mobil) [`08-web-ve-mobil.md`](08-web-ve-mobil.md) altında dokümante edildi — Expo + expo-router + NativeWind + Better Auth Expo + push/realtime mobil cephesi. O dosya **iPhone-first** varsayımıyla yazıldı: tek-kolonlu stack, portrait-only, bottom tab bar.

iPad uyarlaması bu varsayımları kıran bir layer:

- Tek-kolonlu stack → **master-detail** (tablet'te yan yana sidebar + main; kart detayında açıklama+kontrol listeleri yan-yana, web modali pariteli)
- Portrait-only → **default orientation** (landscape açık)
- Tüm-genişlik bottom tab bar → **floating pill bottom nav** (içeriğin üstünde, ortada, sadece kapladığı kadar yer; Apple Music iPad / Trello iPad güncel pattern)
- ~288px sabit kolon → **breakpoint-aware** kolon genişliği
- Bottom sheet → **anchor-based popover** (iPad branch)

Bu beş kırılma bağımsız bir mimari katman — `08-web-ve-mobil.md`'yi şişirmek yerine kendi dosyasında izlenir. Faz 15 kapanınca `08-web-ve-mobil.md` bu dosyaya pointer verir + kısa özet bırakır.

## 2. Dört ana karar (2026-05-31)

`AskUserQuestion` ile kontrol odası tab'ında netleşti:

### Karar 1 — Master-detail kapsamı: TÜM ekranlar

| Ekran grubu | Tablet davranışı | Phone (değişmez) |
|---|---|---|
| Board (`(boards)/[boardId]`) | Sol: kart/liste özet sidebar · Sağ: kanban veya kart detay | Tek-kolon kanban |
| Workspace (`(boards)/workspaces/[workspaceId]`) | Sol: workspace listesi · Sağ: detay | Tek-kolon detay |
| Account (`(account)/*`) | Sol: sekme listesi (Profil/Güvenlik/Hesap/Bildirimler) · Sağ: seçili sekme | Stack push |
| Settings (`notification-settings`) | Sol: kategori (Genel/Kanallar/Matrix/Quiet Hours/Cihazlar) · Sağ: detay | Accordion |
| Auth (`(auth)/*`) | Center'da `max-w-md` form (master-detail YOK) | Mevcut |

Reddedilen alternatifler: (a) "sadece board" — diğer ekranlarda "büyütülmüş iPhone" hissi kalır; (b) "yok" — App Store "iPad-specific value" reddi riski.

### Karar 2 — Tablet breakpoint: **768px**

NativeWind `md:` breakpoint (Tailwind default). iPad mini 8.3" (768×1024) **dahil** — tablet branch'i alır.

Reddedilen alternatifler: (a) 1024px — iPad mini'de "phone layout" tutarsızlığı; (b) iki seviye (768 + 1024) — effort artışı düşük ROI.

### Karar 3 — Landscape orientation: TÜM ekranlar

`app.config.ts` `orientation: 'default'` (mevcut `'portrait'` yerine). Tüm route'lar landscape açık.

Reddedilen alternatifler: (a) "sadece board" — karma rotation davranışı garip; (b) "yok" — Apple "iPad-optimize" saymaz.

iOS `requireFullScreen: false` (Split View V2 hazırlığı — Faz 15'te aktif değil ama refactor sırasında engellemez).

### Karar 4 — Tab bar konumu: floating pill bottom nav (revize 2026-05-31)

iPad'de tab bar alt-ortada **floating pill** olarak yerleştirilir — tüm satırı kaplamaz, sadece içerdiği sekmeler kadar yer kapsar, scroll içeriğinin **üstünde** durur (Apple Music iPad / Trello iPad güncel pattern). Phone'da mevcut alt full-width tab bar aynen korunur.

> **Revizyon notu:** 2026-05-31 ilk turunda K4 "üst nav (iPadOS 18 pattern)" olarak alındı, **15E `Done`** ile shipped (`tabBarPosition: 'top'`). Aynı gün ikinci turunda kullanıcı kararıyla revize edildi → üst nav reddedildi, floating pill bottom benimsendi. Gerekçe: top nav'ın iPad-native hissi açık navigation pattern'lerle (Apple Music, Trello iPad güncel) örtüşmüyor; minimal/yüzen kapsül daha "iPad-app" hissi veriyor ve kart detayında **yan-yana açıklama+kontrol** (web kart modali paritesi) kullanım alanını sıkıştırmaz. **15E rollback edildi** (`tabBarPosition: 'top'` revert); yeniden shipping **15H** alt işinde yapılır.

Reddedilen alternatifler (revize sonrası):
- "Üst nav (iPadOS 18 pattern)" — Trello/Linear/Asana iPad pattern'iyle uyumlu olsa da bu üründe alt+floating daha iPad-native his veriyor; başlık alanı kart detay yan-yana panel için daha sade kalsın.
- "Alt'ta kalır (full-width)" — iPad-native his vermez, "büyütülmüş iPhone" izlenimi.
- "Sidebar/drawer" — navigation modeli refactor scope çok büyük (L → XL).
- "Centered bottom bar (kendi şeridinde, full-row)" — minimal hissini vermez, scroll içerik nav'ın üzerine binmez ama görsel hafiflik az.

Teknik:
- Expo Router 4 + React Navigation 7 `<Tabs tabBar={(props) => …}>` — custom render. Phone'da `BottomTabBar` (`@react-navigation/bottom-tabs`) default'a fallback; tablet'te custom `FloatingPillTabBar`.
- Pill anatomi: `position: absolute`, `bottom: safeInset + 12px`, `alignSelf: 'center'`, `flex-row gap-1.5`, `rounded-full`, `bg-card` `border border-border` `shadow-lg`, içerde her sekme `px-3 py-2` ikon + label.
- Aktif sekme highlight: pill içinde **alt-tone background** (mevcut segmented control pattern'iyle uyumlu — bkz. `description-checklist-tabs`'da `bg-card shadow-sm`).
- Scroll içeriği nav'ın **altına geçer** (içeriğin üstünde durur) — `ScrollView`/`Animated.ScrollView` `contentContainerStyle.paddingBottom` = pill yüksekliği + safe inset + breath (≥ 80px) ile içerik son satırı pill arkasında saklanmaz.
- Klavye davranışı: `tabBarHideOnKeyboard: true` (default) — composer focus'unda pill gizlenir (zaten phone'da olan davranış; iPad'de de mantıklı çünkü floating pill klavye accessory'sini örter).
- Bkz. [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.12 "Tablet design token" → "Floating pill nav anatomy".

## 3. Tablet design language

Detaylı token sistemi → [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) §13.x "Tablet design token" bölümü (Faz 15.0 ile eklenir). Buradaki özet:

### 3.1 Spacing & sizing

| Token | Phone | Tablet |
|---|---|---|
| Board kolon genişliği | `w-72` (288px) | Portrait: `w-80` (320px) · Landscape: `w-96` (384px) |
| Kart padding | `p-3` (12px) | `p-4` (16px) |
| Tap target min | `h-12` (48px) | `min-h-[44px]` HIG iPad |
| Sidebar genişlik (master-detail) | — | 320-400px |
| Header height | `h-14` (56px) | `h-16` (64px) |

### 3.2 Typography scale

`useDeviceClass()` tabanlı auto-apply, opt-out prop'u var:

| Class | Phone | Tablet (1.125×) |
|---|---|---|
| `text-sm` | 14px | 16px |
| `text-base` | 16px | 18px |
| `text-lg` | 18px | 20px |
| `text-xl` (board title) | 20px | 24px (`text-2xl`) |

`<Text tabletScale={1.0}>` ile override (örn. metadata satırlarında küçük kalmalı).

### 3.3 Breakpoint utility

```ts
// apps/mobile/src/lib/use-device-class.ts
export function useDeviceClass(): 'phone' | 'tablet' {
  const { width } = useWindowDimensions();
  return width >= 768 ? 'tablet' : 'phone';
}

export function useIsTablet(): boolean {
  return useDeviceClass() === 'tablet';
}
```

NativeWind `md:` (`>=768px`) standart Tailwind breakpoint — custom alias yok.

## 4. Master-detail mimari

### 4.1 `<MasterDetailLayout>` primitive

```tsx
// apps/mobile/src/components/master-detail-layout.tsx (15C'de yaratılır)
<MasterDetailLayout
  master={<BoardSidebar boardId={boardId} />}
  detail={<BoardKanban boardId={boardId} />}
  selectedDetail={cardId}
  fallback="master"  // phone: detail seçili değilse master göster
/>
```

Tablet: flexbox `flex-row` (sidebar 320-400px sabit + main `flex-1`).
Phone: tek view — `selectedDetail` varsa detail, yoksa master (history stack ile geri navigation).

### 4.2 Board ekranı — kritik tasarım

iPad'de board ekranı **en büyük tasarım meydan okuması**:

- Sol sidebar (320px): liste başlıkları + altında o listenin kartlarının başlık özeti (Trello iPad pattern'iyle uyumlu)
- Sağ main (`flex-1`): kanban (yatay scroll, kolonlar yan yana 2-3) veya kart detay (master-detail right pane)
- Kart seçimi: sidebar'dan tap veya kanban'dan tap → sağ main'de kart detay render edilir
- "Geri" tuşu / ESC: sağ main → kanban'a döner

Route refactor: `cards/[cardId].tsx` tablet'te dışarıdan açılsa bile (deep link, notification) sağ panel'e yerleşir. Phone'da yine full-screen stack push.

### 4.3 Kart detayında açıklama + kontrol listeleri yan-yana (15C scope içinde)

Mevcut kart detayında ([`cards/[cardId].tsx`](../../apps/mobile/app/(app)/(boards)/cards/[cardId].tsx)) `DescriptionChecklistTabs` segmented control altında "Açıklama" ve "Yapılacaklar" iki sekme — varsayılan `description`. Bu pattern phone'da doğru ama iPad genişliğinde dar kalıyor; web kart modali ([`card-detail-dialog.tsx:772`](../../apps/web/src/app/(app)/workspaces/%5Bid%5D/boards/%5BboardId%5D/_components/card-detail/card-detail-dialog.tsx#L772)) iki bölümü `grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` ile yan yana gösteriyor.

15C kapsamında **3-sekmeli iPad varyantı** eklenir; phone değişmez:

| Mod | Phone | Tablet (default) | Tablet alternatif |
|---|---|---|---|
| Sekme sırası | `[Açıklama] [Yapılacaklar]` | `[Yan-yana] [Açıklama] [Yapılacaklar]` | aynı |
| Varsayılan | `description` | **`both`** (yan-yana) | kullanıcı `description` veya `checklist`'i de seçebilir |
| Layout (`both`) | yok | `flex-row gap-3` — sol açıklama `flex-1`, sağ kontrol listeleri `flex-1`, tek `bg-card` yüzeyde | — |
| iPad mini portrait | yan-yana 768px → sıkı; kabul edilir (iPad mini en küçük tablet hedef) | aynı | kullanıcı dilerse tek-sütun sekmeye geçer |

`DescriptionChecklistTabs` props imzası genişler: `Tab = 'both' | 'description' | 'checklist'`; `useIsTablet()` ile default seçilir. Alt bileşenler (`DescriptionEditor`, `ChecklistSection`) değişmez — sadece kapsayıcı layout farklılaşır. Web paritesi: bu pattern web modal'ın iki kolonlu yapısının iPad karşılığı.

### 4.3 Diğer ekranlar

| Route | Master (tablet sidebar) | Detail (tablet main) |
|---|---|---|
| `workspaces/[workspaceId]` | Workspace listesi (`workspaces.list`) | Workspace detay (üye, board listesi, ayarlar) |
| `(account)/_layout` | Sekme listesi statik (Profil/Güvenlik/Bildirimler/Cihazlar) | Seçili sekme içeriği |
| `notification-settings` | Kategori listesi statik | Seçili kategori (matrix / quiet hours / cihazlar) |

Auth route'ları (`(auth)/*`) master-detail almıyor — center'da form, etrafı boş (eski Pusula web pattern'i).

## 5. Sheet → popover stratejisi (iPad branch)

Mevcut `apps/mobile/src/components/sheet.tsx` bottom sheet primitive — ~15+ yerde kullanılıyor (`move-to-list-sheet`, `list-actions-sheet`, `BoardActionsSheet`, `member-invite-form`, kart detay action'ları, vb.).

Faz 15D'de:

```tsx
// Pseudo
export function Sheet({ children, anchor, ... }: SheetProps) {
  const isTablet = useIsTablet();
  if (isTablet) {
    return <Popover anchor={anchor} {...rest}>{children}</Popover>;
  }
  return <BottomSheet {...rest}>{children}</BottomSheet>;
}
```

Tablet popover davranışı:
- Anchor verilirse anchor'a yakın konum; verilmezse viewport center
- Backdrop dim + tap-outside-to-close
- ESC tuşu (external keyboard) kapatır
- VoiceOver focus trap (iOS standartı)

İstisna: `attachment-image-viewer.tsx` `<Modal>` (1 yer) — iPad'de full-screen kalır (image viewer için doğru pattern).

## 6. Asset varyantları

| Dosya | Phone | Tablet | Mekanizma |
|---|---|---|---|
| App icon | `assets/icon.png` (1024×1024) | **ayrı dosya YOK** — Apple iOS asset catalog 1024×1024'ten iPad boyutlarına otomatik türetir | Expo SDK 54 `ios.icon` (`IOSIcons`) yalnız `light`/`dark`/`tinted` kabul eder; iPad varyantı **desteklenmez** |
| Splash | `assets/splash-icon.png` | `assets/splash-icon~ipad.png` | `app.config.ts` `plugins.expo-splash-screen.ios.tabletImage` (15E ✅) — `@expo/prebuild-config` `getIosSplashConfig` resmi destek |
| Adaptive icon (Android) | mevcut — değişmez | — | Android sürüm v1.1.0'da iPad scope dışı |

Faz 15E ile `splash-icon~ipad.png` dosyası `splash-icon.png` ile birebir kopya olarak eklendi (iPad-özel splash kompozisyonu **planlanmamış** — designer'dan ayrı sanat gelirse yalnız dosya swap edilir, config değişmez). iPad app icon için tasarım gerekirse bu Expo sınırlamasını aşmak için custom config plugin yazılması gerekir; v1.1.0 kapsamı dışı.

## 7. App Store Connect geçişi

Faz 7O ile yayınlanan iPhone-only app'in **yeni sürümü** (v1.1.0) iPad device family ile gönderilir.

| Adım | Detay |
|---|---|
| Device Family | App Store Connect → App Information → "iPad" eklenir |
| Screenshot | iPad Pro 12.9" (2048×2732): 5 adet · iPad mini (1488×2266): opsiyonel (12.9" upscale otomatik) |
| App Privacy | Form taşınır — yeni veri kategorisi YOK (kamera/foto/push aynı izinler) |
| What's New | Türkçe: "iPad desteği eklendi — uygulama artık iPad ekranına optimize." |
| Build | `eas build --profile production --platform ios` (credentials cache'li) |
| Submit | `eas submit --profile production --platform ios` (ASC API key cache'li) |
| Inceleme | ~24-48h Apple review |
| Yayın | "Manually release" — kontrol için (Faz 7O pattern) |

## 8. Sürüm planı

| Sürüm | İçerik | OTA mı yeni build mı? |
|---|---|---|
| **v1.1.0** | Faz 15 iPad uyarlaması (native — `supportsTablet`, orientation, asset) | **Yeni build** (`eas build` + `eas submit`) |
| v1.1.x | Faz 15 sonrası iPad JS-only fix'leri (UI bug, copy, layout tweak) | **OTA** (`eas update --branch production --platform ios`) |
| v1.2.0 | Sonraki native değişiklik (yeni izin, yeni paket, yeni asset) | Yeni build |

Memory referansı: [`faz7o-ios-yayin-sureci`](../../../C:/Users/asya/.claude/projects/d--projects-pusula-v2/memory/faz7o-ios-yayin-sureci.md) — OTA-vs-build matrisi. Faz 15 = "Yeni native paket / `app.config.ts` native" satırı.

## 9. Bilinen risk noktaları

| Risk | Etki | Azaltma |
|---|---|---|
| Realtime collision iPad'de daha sık | Multi-device edit bozulur | Faz 8 sertleştirme kapsamında — Faz 15 dışı; smoke'da gözlenir |
| `useWindowDimensions` orientation cache (Expo) | Rotate sonrası kolon genişliği güncel değil | Expo 54+ test edildi OK; 15A unit test + 15F manuel rotate smoke |
| Floating pill nav scroll padding hesabı | İçeriğin son satırı pill arkasında saklanır | 15H `useBottomTabBarHeight` + safe-inset + 16px breath; her ekran scroll'unda `contentContainerStyle.paddingBottom` ya da `automaticallyAdjustsScrollIndicatorInsets` |
| Floating pill nav klavye + composer | Pill klavye accessory'sini örter | `tabBarHideOnKeyboard: true` default; composer focus'unda pill gizlenir |
| Yan-yana açıklama+kontrol iPad mini portrait | 768px'te iki kolon sıkı kalır (Tiptap toolbar + checklist item satırı) | `'both'` modu kullanıcı tercihiyle 1 sütuna düşürülebilir; default kalır; 15F manuel iPad mini smoke |
| Apple "iPad-specific value" reddi | Yayın gecikir | Master-detail TÜM ekran ile ret riski düşük; screenshot ↔ UI uyum kritik (Faz 7O DEM-191 Guideline 2.3.1 dersi) |
| Phone↔tablet runtime geçişi | iPad mini portrait/landscape arası nadir state loss | 15F orientation smoke; state Zustand/atom'da, refetch trigger değilse korunur |
| Stack history davranışı (master-detail) | "Geri" tuşu beklenmedik route'a gider | 15C `Stack.Screen` `presentation` ayarları; 15F manuel test |

## 10. Kapsam dışı (V2'ye)

- Stage Manager / external display çoklu pencere
- Apple Pencil (kart üzerine el yazısı, çizim — domain modeli destek vermiyor)
- Keyboard shortcut tam set (sadece ESC ile popover kapama minimal)
- Drag-drop board mobile'da (Faz 3 web-only kararı korunur — `MoveToListSheet` mevcut)
- Split View iPadOS multi-app
- iPad-spesifik feature flag'ler (tüm iPad'ler aynı kapsamı görür)

## 11. Alt iş zinciri

```
15.0 önce-belge (DEM-300, kontrol odası)
  ↓
15A Foundation (DEM-301, kod tab'ı) — app.config.ts + useDeviceClass + responsive utility
  ↓
{15B Kanban responsive (DEM-302) ∥
 15C Master-detail + kart detayı yan-yana açıklama+kontrol (DEM-303) ∥
 15D Sheet→popover (DEM-304) ∥
 15E (revize) Üst nav rollback + typography + asset (DEM-305) ∥
 15H Floating pill bottom nav — yeniden shipping (yeni Linear)}
  ↓
15F Test + App Store + production build v1.1.0 submit (DEM-306)
```

| Alt iş | Tab | Efor | Linear |
|---|---|---|---|
| 15.0 | Kontrol odası | 0.5 gün | [DEM-300](https://linear.app/demirkol/issue/DEM-300) |
| 15A | Kod | 1 gün | [DEM-301](https://linear.app/demirkol/issue/DEM-301) |
| 15B | Kod | 1-1.5 gün | [DEM-302](https://linear.app/demirkol/issue/DEM-302) |
| 15C | Kod | 3-4 gün (+ yan-yana açıklama+kontrol +0.5g) | [DEM-303](https://linear.app/demirkol/issue/DEM-303) |
| 15D | Kod | 1 gün | [DEM-304](https://linear.app/demirkol/issue/DEM-304) |
| 15E (revize) | Kod | 0.5 gün (rollback) | [DEM-305](https://linear.app/demirkol/issue/DEM-305) |
| **15H** (yeni) | Kontrol odası → Kod | 1 gün | yeni DEM-3xx (Pre-Dev'de açılacak) |
| 15F | Kod + op | 1 gün (+ Apple inceleme) | [DEM-306](https://linear.app/demirkol/issue/DEM-306) |

**Toplam:** ~9-11 iş günü (Apple inceleme hariç) — 15E rollback 1.5g → 0.5g düştü, 15H +1g geldi, 15C +0.5g eklendi → net ≈ değişmedi.

## 12. Referanslar

- Faz 7O App Store yayını: memory `faz7o-ios-yayin-sureci.md` (kararlar, kimlikler, OTA-vs-build matrisi)
- iPhone-only kararı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) Karar kaydı 2026-05-21 (Faz 15 ile revize)
- Mobil mimari temel: [`08-web-ve-mobil.md`](08-web-ve-mobil.md)
- Tablet design token: [`13-ui-tasarim-dili.md`](13-ui-tasarim-dili.md) (Faz 15.0 ile tablet bölümü eklenir)
- Faz planı: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) "Faz 15 alt işleri"
- Apple HIG iPad: <https://developer.apple.com/design/human-interface-guidelines/designing-for-ipad>
- iPadOS 18 tab bar: <https://developer.apple.com/documentation/uikit/uitabbarcontroller>
