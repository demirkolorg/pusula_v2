# Pusula mobil — Maestro e2e akışları

Faz 7N kapsamında yazılan [Maestro](https://maestro.mobile.dev) uçtan-uca akış
dosyaları. Pusula mobil için seçilen e2e aracı **Maestro**'dur (Detox değil —
Faz 7.0 test kararı).

> **Önemli:** Bu fazda yalnızca akış YAML dosyaları üretildi. Akışların
> **gerçek koşumu** cihaz/emülatör + kurulu uygulama gerektirir; Expo Go veya
> `expo export` ile çalıştırılamaz. Uçtan-uca koşum **Faz 7O** (EAS dev build)
> turunda yapılacak.

## Akış dosyaları

| Dosya                  | Kapsanan akış                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth-sign-up.yaml`     | Kayıt: sign-in → "Kayıt ol" → form (Ad/E-posta/Parola) → Panolar sekmesine iniş.                          |
| `auth-sign-in.yaml`     | Giriş: sign-in ekranı → form → "Çalışma Alanları" başlığı (board listesi kökü).                           |
| `auth-sign-out.yaml`    | Çıkış: giriş → Hesap sekmesi → "Çıkış yap" → sign-in ekranına dönüş.                                       |
| `board-view.yaml`       | Board görüntüleme: workspace listesi → board listesi → board ekranı (liste/kart render doğrulaması).      |
| `card-create-move.yaml` | Kart oluşturma + taşıma: kolon "Kart ekle" composer → kart → "Listeyi değiştir" → move-to-list sheet.      |
| `notifications.yaml`    | Bildirim merkezi: Bildirimler sekmesi → notification center → satıra dokun (`markRead` + yönlendirme).     |

`config.yaml` — Maestro proje config'i; `flows` deseni ile koşum sırasını
belirler.

## appId

Tüm akışlar `appId: com.pusula.app` kullanır. Bu değer
`apps/mobile/app.config.ts`'ten gelir — `ios.bundleIdentifier` ve
`android.package` her iki platformda aynıdır.

## Önkoşul (gerçek koşum — Faz 7O)

1. **Maestro CLI kurulu olmalı** — <https://maestro.mobile.dev/getting-started/installing-maestro>
2. **EAS dev build** kurulu bir cihaz/emülatör (iOS Simulator veya Android
   emülatör). Expo Go / `expo export` Maestro koşumu için **yeterli değil** —
   native build (`com.pusula.app`) gereklidir.
3. **Backend erişilebilir olmalı** — akışlar canlı tRPC API'sine bağlanır
   (giriş, board verisi, bildirim). Lokal koşumda `apps/api-server` ayakta
   olmalı ve mobil `src/env.ts` API URL'i ona işaret etmeli.
4. **Seed hesabı** — `auth-sign-in` / `auth-sign-out` / `board-view` /
   `card-create-move` / `notifications` akışları kayıtlı bir hesabı varsayar.
   E-posta/parola env değişkeniyle geçilir:

   ```bash
   maestro test \
     -e MAESTRO_EMAIL=hesap@pusula.test \
     -e MAESTRO_PASSWORD='Parola1234!' \
     .maestro/
   ```

   Env verilmezse her dosyadaki `env:` bloğundaki varsayılan
   (`maestro@pusula.test` / `Parola1234!`) kullanılır — lokal seed hesabıyla
   eşleşmeli.

## Koşum

```bash
# Tüm akışlar (config.yaml sırasıyla)
maestro test .maestro/

# Tek akış
maestro test .maestro/auth-sign-in.yaml

# Env ile (seed hesabı)
maestro test -e MAESTRO_EMAIL=... -e MAESTRO_PASSWORD=... .maestro/

# İnteraktif geliştirme (canlı düzenleme + yeniden koşum)
maestro studio
```

## 7O follow-up — eksik `testID`'ler

Akışlar şu an **ekrandaki gerçek Türkçe metinlere** ve `accessibilityLabel`
değerlerine dayanır (uygulama kaynak kodu Faz 7N'de değiştirilmedi). Aşağıdaki
noktalar metin-bağımlı veya konum-bağımlı seçicilerle çözüldü; Faz 7O'da
kararlılık için `testID` eklenmesi önerilir:

- **Form alanları (`TextField` / `InlineComposer`)** — `id` seçici şu an
  `accessibilityLabel` (TextField'da `label`, InlineComposer'da `placeholder`)
  ile eşleşir; bu metinler `strings.ts` değişirse akış kırılır. `TextField` ve
  `InlineComposer` `TextInput`'larına açık `testID` eklenmeli
  (örn. `testID="auth-email"`, `testID="card-title-input"`).
- **Liste satırları (`ListRow`)** — workspace/board satırları dinamik adlı;
  akışlar `index: 0` + `point` ile ilk satıra dokunuyor. `ListRow`'a
  `testID` eklenirse satır seçimi deterministik olur.
- **Board kolonu / kart yüzeyi (`BoardColumn` / `CardFace`)** — kolon ve kart
  ögelerinde `testID` yok; `card-create-move` akışı oluşturulan kartı başlık
  metniyle buluyor (çalışır ama metin-bağımlı). Move-to-list sheet satırları
  da `point` ile seçiliyor — `MoveToListSheet` satırlarına `testID` eklenmeli.
- **Bildirim satırı (`NotificationRow`)** — `notifications` akışı tarih grubu
  metnine (`Bugün`) göre koşullu dokunuyor; `NotificationRow`'a `testID`
  eklenirse ilk okunmamış satır deterministik seçilebilir.
- **Alt tab bar** — sekmeler etiket metniyle (`Hesap`, `Bildirimler`) bulunuyor;
  native `Tabs` etiketleri genelde kararlıdır, `testID` opsiyonel.

> Kaynak kodu değişikliği (testID ekleme) **Faz 7N kapsamı dışında** — paralel
> ajan alanı / 7O işidir. Bu README o follow-up'ları kayıt altına alır.

## CI

Faz 7O'da bu akışlar CI pipeline'ına bağlanacak (Maestro Cloud veya self-hosted
emülatör runner). CI koşumu EAS dev build artefaktı + seed backend + seed hesabı
secret'ı (`MAESTRO_EMAIL` / `MAESTRO_PASSWORD`) gerektirir.
