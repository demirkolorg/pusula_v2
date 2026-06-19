import type { ExpoConfig } from 'expo/config';

/**
 * Pusula mobil — dinamik Expo yapılandırması.
 * `extra.eas.projectId` ilk `eas init` çalıştırmasında doldurulur.
 * Native build profilleri `eas.json`'da; runtime env `src/env.ts`'te.
 */
const config: ExpoConfig = {
  name: 'Pusula',
  slug: 'pusula',
  scheme: 'pusula',
  // Faz 15F (DEM-306) — sürüm v1.1.0 (minor). Faz 15 iPad uyarlamasındaki
  // native değişiklikler (`supportsTablet: true`, `orientation: 'default'`,
  // `requireFullScreen: false`, `expo-splash-screen.ios.tabletImage`) OTA ile
  // dağıtılamaz; yeni `eas build` + `eas submit` zorunlu. `runtimeVersion.policy
  // = 'appVersion'` olduğundan bu bump aynı zamanda yeni runtime version
  // demektir — 1.0.0 OTA bundle'ları 1.1.0 client'a düşmez. Sonraki JS-only
  // fix'ler v1.1.x OTA (`eas update --branch production --platform ios`).
  // NOT (2026-06-18): 1.1.2 → 1.1.3. App Store Connect 1.1.2'yi zaten onayladı
  // (build #9), "train 1.1.2 closed" → build #10 (1.1.2 build 10) submit'te
  // REDDEDİLDİ (90062/90186): CFBundleShortVersionString önceki onaylı sürümden
  // YÜKSEK olmalı. buildNumber autoIncrement (appVersionSource: remote) yeterli
  // değil, marketing version'u bump etmek şart. Bonus: runtimeVersion.policy=
  // appVersion → yeni runtime 1.1.3; production'daki crash eden 1.1.2 OTA'ları
  // (reanimated worklet açılış crash'i) bu build'e ERİŞEMEZ — temiz başlangıç.
  // Worklet'li değişiklikler OTA ile değil bu store build ile gidiyor.
  version: '1.1.3',
  // Faz 15A (DEM-301) — iPad uyarlaması (sürüm v1.1.0 hedefli). `portrait` →
  // `default`: tüm route'lar landscape açık. iPhone'da çoğu ekran tek-kolon
  // kalır, iPad'de master-detail layout (Faz 15C) landscape'i kullanır.
  // Karar: `13-ui-tasarim-dili.md` §13.12 + `18-ipad-uyarlamasi.md` §2.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  // EAS Update (OTA) — Faz 7O ilk build sırasında `eas-cli` ekledi (2026-05-20).
  // `runtimeVersion.policy: 'appVersion'` → runtime version = `version` (1.0.0).
  // Native bağımlılık/izin değişmediği sürece aynı versiyona OTA güncellemesi
  // yayımlanabilir (`eas update --branch <channel>`); native değişirse yeni
  // store build'i gerekir. URL EAS Update CDN'i (projectId tabanlı).
  updates: {
    url: 'https://u.expo.dev/42653b08-bbd1-47c7-9d22-99e42e6a1d47',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    // Faz 15A (DEM-301, 2026-05-31) — Faz 7O `supportsTablet: false` kararı
    // (2026-05-21) revize edildi. iPad-native uyarlama (Faz 15) ile sürüm
    // v1.1.0 hedefli; master-detail layout, 768px breakpoint, üst nav tab bar
    // ve landscape orientation eklenir. `requireFullScreen: false` Split View
    // V2 hazırlığı (Faz 15'te aktif değil ama refactor engellemez). Karar
    // detayı: `18-ipad-uyarlamasi.md` §2 + `08-web-ve-mobil.md` Faz 15 notu.
    supportsTablet: true,
    requireFullScreen: false,
    bundleIdentifier: 'com.pusula.app',
    // App Store gönderiminde "ihracat uyumu / şifreleme" sorusunu otomatik
    // yanıtlar: uygulama yalnız standart HTTPS/TLS kullanıyor (muaf) — her
    // gönderimde elle yanıtlamak gerekmez. Faz 7O.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // Faz 7L — universal links. iOS, uygulama kuruluyken `pusulaportal.com`
    // linklerini uygulamada açar (tüm yollar — kullanıcı kararı 2026-05-18).
    // Domain doğrulaması `apple-app-site-association` dosyasını ister; o dosya
    // Apple Team ID gerektirdiği için Faz 7O'da (EAS build) eklenir.
    associatedDomains: ['applinks:pusulaportal.com'],
  },
  android: {
    package: 'com.pusula.app',
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#008e5f',
    },
    // Faz 7L — Android App Links. `https://pusulaportal.com` linkleri uygulamada
    // açılır; `autoVerify` Digital Asset Links (`assetlinks.json`) ile doğrulanır
    // — o dosya imza SHA-256 gerektirdiği için Faz 7O'da eklenir.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'pusulaportal.com' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#008e5f',
        dark: {
          backgroundColor: '#1d2125',
        },
        // Faz 15E (DEM-305) — iPad splash varyantı. `IOSSplashConfig.tabletImage`
        // resmi destek (`@expo/prebuild-config` getIosSplashConfig). iPhone
        // splash'iyle aynı kompozisyon — kullanılan dosya şu an birebir kopya
        // (`splash-icon~ipad.png`); ileride iPad'e özel daha geniş canvas
        // sanatı gelirse aynı yolda swap edilir, config değişmez. iOS app icon
        // tarafında Expo SDK 54 `ios.icon` (`IOSIcons`) yalnız light/dark/tinted
        // kabul ediyor — iPad varyantı yok, 1024×1024 ana ikon iOS asset
        // catalog tarafından otomatik iPad boyutlarına türetilir (Apple HIG).
        ios: {
          tabletImage: './assets/splash-icon~ipad.png',
        },
      },
    ],
    // Sentry native config (crash reporting + source map / debug symbol upload).
    // Xcode'a bir "Upload Debug Symbols to Sentry" build phase ekler; sentry-cli
    // SENTRY_AUTH_TOKEN/ORG/PROJECT/URL ister. Bunlar EAS'te tanımlı —
    // SENTRY_AUTH_TOKEN EAS Secret (3 ortam), ORG/PROJECT/URL/DSN eas.json'da.
    // Gerçek symbol upload yalnız production profilinde; dev/preview'de
    // SENTRY_DISABLE_AUTO_UPLOAD ile atlanır. DEM-234 (2026-05-21) ile geri
    // açıldı — Faz 7O dev build'inde auth token yokken sentry-cli kraşı
    // yüzünden geçici kapatılmıştı.
    '@sentry/react-native',
    // Better Auth oturum cookie'sini şifreli cihaz deposunda tutar (Faz 7B).
    'expo-secure-store',
    // `@better-auth/expo` peer'i — derin bağlantı/OAuth dönüş akışı için.
    'expo-web-browser',
    // Kart eki kamera/galeri izin metinleri (Faz 7J). iOS `Info.plist`
    // `NS*UsageDescription` + Android kamera izni bu plugin'le üretilir.
    [
      'expo-image-picker',
      {
        photosPermission: 'Pusula, karta eklemek istediğin görselleri seçebilmek için galerine erişir.',
        cameraPermission: 'Pusula, karta fotoğraf ekleyebilmen için kameranı kullanır.',
      },
    ],
    // Push bildirim altyapısı (Faz 7K). Native bildirim izni + Expo push
    // token üretimi bu plugin'le bağlanır; foreground/background handler ve
    // deep link açma Faz 7L kapsamı.
    //
    // `sounds`: markaya özel bildirim sesi (2026-06-03, v1.1.1 build). Ses
    // dosyası `notification.wav` build zamanında app bundle'ına kopyalanır;
    // worker push payload'ı `sound: 'notification.wav'` ile bu sesi çaldırır.
    // NATIVE — OTA ile eklenemez, yeni store build gerektirir (bu yüzden 1.1.1).
    [
      'expo-notifications',
      {
        sounds: ['./assets/notification.wav'],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // EAS proje kimliği — `getExpoPushTokenAsync` (Faz 7K push token kaydı)
      // bu id olmadan token üretemez. 2026-05-18'de Expo hesabı/projesi
      // oluşturulunca dolduruldu.
      projectId: '42653b08-bbd1-47c7-9d22-99e42e6a1d47',
    },
  },
};

export default config;
