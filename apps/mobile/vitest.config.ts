import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Faz 7N — iki Vitest projesi.
 *
 * Proje "unit": saf domain/sabit birim testleri (node ortamı, `.test.ts`).
 * Faz 7A'dan beri var olan testler; bu proje değişmeden çalışır.
 *
 * Proje "component": RN bileşen testleri (`.test.tsx`). `react-native`
 * `react-native-web`'e alias'lanır — böylece RN host bileşenleri (View,
 * Text, Pressable, Switch, Image) Flow-tipli native kaynak yerine
 * derlenebilir JS olarak yüklenir ve gerçek DOM ağacına render edilir.
 * Sorgu/etkileşim katmanı `@testing-library/react` (jsdom benzeri
 * `happy-dom` ortamı). Native Expo modülleri `vitest.setup.tsx`'te
 * mock'lanır.
 *
 * Neden RNTL değil de `@testing-library/react`: `@testing-library/
 * react-native` sorguları RN host bileşen tiplerini (`Text`, `View`)
 * bekler; `react-native-web` ise DOM etiketleri (`div`, `span`, `button`)
 * üretir ve hepsi `div`'e indiğinden RNTL `getByText` ile `getByRole`
 * ayrımı çalışmaz. `react-native-web` + `@testing-library/react`
 * (DOM sorguları) React 19 / RN 0.81'de sağlam ve eksiksiz çalışan
 * kombinasyondur. Ayrıntı: Faz 7N raporu.
 *
 * `pnpm test` (vitest run) her iki projeyi tek koşumda çalıştırır.
 */

const alias = {
  '@': resolve(import.meta.dirname, 'src'),
};

/** RNW'nin ESM girişi — `react-native`'in test ortamı karşılığı. */
const reactNativeWebEntry = resolve(
  import.meta.dirname,
  'node_modules/react-native-web/dist/index.js',
);

/**
 * `react-native` (ve `react-native/...` alt yolları) → `react-native-web`
 * yönlendirmesini `resolveId` aşamasında zorlar. `resolve.alias`'tan daha
 * güçlüdür: inline edilmiş bağımlılıkların `react-native` çağrılarını da
 * yakalar, böylece Flow-tipli gerçek `react-native@0.81` kaynağı hiçbir
 * koşulda yüklenmez.
 */
function reactNativeWebPlugin(): Plugin {
  return {
    name: 'pusula:react-native-web-alias',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'react-native') return reactNativeWebEntry;
      if (source.startsWith('react-native/')) return reactNativeWebEntry;
      return null;
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        // ----- Proje A: saf modül birim testleri (Faz 7A+) -----
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // ----- Proje B: RN bileşen testleri (Faz 7N) -----
        plugins: [reactNativeWebPlugin(), react()],
        // RN/Expo kaynak dosyaları derleme-zamanı `__DEV__` global'ini bekler.
        define: {
          __DEV__: 'true',
          'process.env.EXPO_OS': '"ios"',
        },
        resolve: {
          alias: {
            ...alias,
            'react-native': reactNativeWebEntry,
          },
        },
        test: {
          name: 'component',
          environment: 'happy-dom',
          globals: true,
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.tsx'],
          // Tüm bağımlılıkları Vite transform hattından geçir — aksi halde
          // dışsallaştırılan bir CJS modülün ham `require("react-native")`
          // çağrısı alias'ı atlayıp Flow-tipli kaynağa düşer.
          server: {
            deps: {
              inline: [/.*/],
            },
          },
        },
      },
    ],
  },
});
