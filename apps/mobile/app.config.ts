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
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.pusula.app',
  },
  android: {
    package: 'com.pusula.app',
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#5b51d8',
    },
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
    '@sentry/react-native',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // `eas init` ile doldurulur (Faz 7A kapsamında boş bırakıldı).
      projectId: undefined,
    },
  },
};

export default config;
