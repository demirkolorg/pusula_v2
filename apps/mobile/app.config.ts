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
  version: '1.0.0',
  orientation: 'portrait',
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
    supportsTablet: true,
    bundleIdentifier: 'com.pusula.app',
    // App Store gönderiminde "ihracat uyumu / şifreleme" sorusunu otomatik
    // yanıtlar: uygulama yalnız standart HTTPS/TLS kullanıyor (muaf) — her
    // gönderimde elle yanıtlamak gerekmez. Faz 7O.
    //
    // `UISupportedInterfaceOrientations~ipad`: üst-düzey `orientation: 'portrait'`
    // telefonda kanban'ı portrait'e kilitler; iPad geniş ekranda landscape de
    // mantıklı olduğu için sadece iPad için 4 yön açılır (Apple HIG önerisi —
    // "stretched iPhone" görünümünü hafifletir). Mobil layout iPad-optimize
    // değil (sonraki faz — iş kayıt defteri MOB-2026-05-20-001).
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
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
      backgroundColor: '#5b51d8',
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
        backgroundColor: '#5b51d8',
        dark: {
          backgroundColor: '#1d2125',
        },
      },
    ],
    // Sentry native config (crash reporting). Source map yükleme org/project
    // gerektirir — yalnız CI/EAS build'de anlamlı, opsiyonel.
    // GEÇİCİ DEVRE DIŞI (Faz 7O dev build 2026-05-20): @sentry/react-native
    // plugin'i Xcode'a bir "Upload Debug Symbols to Sentry" build phase ekliyor;
    // SENTRY_AUTH_TOKEN/ORG/PROJECT tanımlı olmadan sentry-cli build sırasında
    // crash ediyor (`SENTRY_DISABLE_AUTO_UPLOAD=true` bile yeterli değil —
    // script env'i okumadan önce node:cjs/loader'da düşüyor). Production
    // build'inden önce auth token + org/project ayarlanıp geri açılacak
    // (Faz 8 follow-up — runbook §12.14).
    // '@sentry/react-native',
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
    'expo-notifications',
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
