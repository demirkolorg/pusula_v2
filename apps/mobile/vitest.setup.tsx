import { createRequire, Module } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import { vi } from 'vitest';

/**
 * Faz 7N — bileşen testleri (`*.test.tsx`) için ortak Vitest setup.
 *
 * RN bileşenleri `react-native` → `react-native-web` alias'ı sayesinde
 * derlenebilir JS olarak yüklenir ve `happy-dom` DOM ağacına render edilir;
 * ancak bazı native Expo modülleri test ortamında çalışmaz — burada hafif
 * mock'lanır.
 *
 * NativeWind notu: testte JSX `nativewind` import-source'u DEĞİL, standart
 * React JSX runtime kullanılır. `className` bir style'a çevrilmez;
 * `react-native-web` onu zararsız bir prop olarak kabul eder. Bileşen
 * testleri görünürlük/prop/callback davranışını doğrular — style hesabı
 * (NativeWind) testin kapsamı dışındadır.
 */

// RN/Expo kaynakları `__DEV__` global'ini bekler — runtime'da garanti et.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

/**
 * `expo-modules-core` `globalThis.expo` üzerinden native köprüye erişir
 * (`EventEmitter`, `NativeModule`, `SharedObject`). Native runtime bunu
 * enjekte eder; test ortamında minimal bir stub yeterli — bileşen testleri
 * native modül davranışını değil presentational davranışı doğrular.
 */
class StubEventEmitter {
  addListener() {
    return { remove() {} };
  }
  removeAllListeners() {}
  emit() {}
}
(globalThis as { expo?: unknown }).expo = {
  EventEmitter: StubEventEmitter,
  NativeModule: class {},
  SharedObject: class {},
  SharedRef: class {},
  modules: {},
  getViewConfig: () => undefined,
  uuidv4: () => '00000000-0000-0000-0000-000000000000',
  uuidv5: () => '00000000-0000-0000-0000-000000000000',
};

/**
 * Bazı CJS bağımlılıkları ham Node `require("react-native")` çağırır; bu
 * çağrı Vite alias/plugin'lerini atlayıp Flow-tipli gerçek
 * `react-native@0.81` kaynağına düşer (`typeof` parse hatası). Node
 * `Module.prototype.require`'ı yamalayıp `react-native`'i derlenebilir
 * `react-native-web`'e yönlendiririz — setup dosyası test'ten önce koşar.
 */
const requireFromHere = createRequire(import.meta.url);
const reactNativeWebPath = resolve(
  import.meta.dirname,
  'node_modules/react-native-web/dist/cjs/index.js',
);
const moduleProto = Module.prototype as unknown as {
  require: (this: unknown, id: string) => unknown;
};
const originalRequire = moduleProto.require;
moduleProto.require = function patchedRequire(this: unknown, id: string) {
  if (id === 'react-native' || id.startsWith('react-native/')) {
    return requireFromHere(reactNativeWebPath);
  }
  return originalRequire.call(this, id);
};

// --- @expo-google-fonts/poppins — `.ttf` asset'leri Vitest'te yüklenemez ---
vi.mock('@expo-google-fonts/poppins', () => ({
  useFonts: () => [true, null],
  Poppins_400Regular: 'Poppins_400Regular',
  Poppins_500Medium: 'Poppins_500Medium',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
  Poppins_700Bold: 'Poppins_700Bold',
}));

// --- @expo/vector-icons (Feather) — native font, testte mock ---
vi.mock('@expo/vector-icons', () => {
  const Stub = (props: Record<string, unknown>) =>
    React.createElement('icon-stub', { ...props, children: null });
  return { Feather: Stub, Ionicons: Stub, MaterialIcons: Stub };
});

// --- lottie-react-native — native animasyon motoru, testte mock ---
vi.mock('lottie-react-native', () => ({
  default: () => React.createElement('lottie-stub', null),
}));

// --- react-native-safe-area-context — JSDOM'da layout ölçemez ---
vi.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    initialWindowMetrics: { insets, frame },
  };
});

// --- expo-constants — yapılandırma sabitleri ---
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} }, manifest: {} },
}));

// --- expo-secure-store — native keychain/keystore, testte bellek mock'u ---
vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: vi.fn(async (k: string) => void store.delete(k)),
  };
});

// --- @react-native-async-storage/async-storage — bellekte tutan mock ---
vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
      removeItem: vi.fn(async (k: string) => void store.delete(k)),
      clear: vi.fn(async () => void store.clear()),
    },
  };
});
