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

// --- @expo-google-fonts/* — `.ttf` asset'leri Vitest'te yüklenemez ---
// Her aile, gerçek export adlarını string'e mock'lar (RN'de `fontFamily` adı).
// §13.7.7 Faz 3: 7 aile font kişiselleştirmesi için yüklenir; testte hepsi
// stub'lanmalı yoksa `fonts.ts`/`_layout` çeken testler asset parse hatasıyla
// patlar.
vi.mock('@expo-google-fonts/poppins', () => ({
  useFonts: () => [true, null],
  Poppins_400Regular: 'Poppins_400Regular',
  Poppins_500Medium: 'Poppins_500Medium',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
  Poppins_700Bold: 'Poppins_700Bold',
}));
vi.mock('@expo-google-fonts/inter', () => ({
  Inter_400Regular: 'Inter_400Regular',
  Inter_500Medium: 'Inter_500Medium',
  Inter_600SemiBold: 'Inter_600SemiBold',
  Inter_700Bold: 'Inter_700Bold',
}));
vi.mock('@expo-google-fonts/manrope', () => ({
  Manrope_400Regular: 'Manrope_400Regular',
  Manrope_500Medium: 'Manrope_500Medium',
  Manrope_600SemiBold: 'Manrope_600SemiBold',
  Manrope_700Bold: 'Manrope_700Bold',
}));
vi.mock('@expo-google-fonts/dm-sans', () => ({
  DMSans_400Regular: 'DMSans_400Regular',
  DMSans_500Medium: 'DMSans_500Medium',
  DMSans_600SemiBold: 'DMSans_600SemiBold',
  DMSans_700Bold: 'DMSans_700Bold',
}));
vi.mock('@expo-google-fonts/jetbrains-mono', () => ({
  JetBrainsMono_400Regular: 'JetBrainsMono_400Regular',
  JetBrainsMono_500Medium: 'JetBrainsMono_500Medium',
  JetBrainsMono_600SemiBold: 'JetBrainsMono_600SemiBold',
  JetBrainsMono_700Bold: 'JetBrainsMono_700Bold',
}));
vi.mock('@expo-google-fonts/lora', () => ({
  Lora_400Regular: 'Lora_400Regular',
  Lora_500Medium: 'Lora_500Medium',
  Lora_600SemiBold: 'Lora_600SemiBold',
  Lora_700Bold: 'Lora_700Bold',
}));
vi.mock('@expo-google-fonts/atkinson-hyperlegible', () => ({
  AtkinsonHyperlegible_400Regular: 'AtkinsonHyperlegible_400Regular',
  AtkinsonHyperlegible_700Bold: 'AtkinsonHyperlegible_700Bold',
}));

// --- nativewind — `vars()`/`cssInterop` native CSS köprüsü, testte mock ---
// §13.7.7: merkezi `Text` artık `theme-provider`'ı (renk paleti için `vars()`)
// import eder → `Text` çeken her test `nativewind`'i de yükler. Test ortamında
// `vars` yalnız bir style objesi döndürmeli (görsel etki kapsam dışı);
// gerçeği require edilirse native asset parse hatası verir.
vi.mock('nativewind', () => ({
  vars: (input: Record<string, string>) => input,
  cssInterop: () => undefined,
  remapProps: () => undefined,
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: () => undefined }),
  styled: (component: unknown) => component,
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

// --- expo-crypto — native rastgele/UUID üretimi, testte deterministik stub ---
vi.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-0000-0000-000000000000',
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

// --- expo-image — native görsel motoru (disk/bellek cache), testte mock ---
// DEM-228: `RemoteImage` `expo-image` `<Image>` kullanır. Testte gerçek native
// görsel motoru çalışmaz; `<Image>` basit bir host elemanına indirgenir.
// `accessibilityLabel` `aria-label` olarak yansıtılır — `RemoteImage` testi
// `getByLabelText` ile görseli sorgular. `onLoad`/`onError` çağrılmaz; testler
// görsel "inme" anını değil görselin/placeholder'ın render'ını doğrular.
vi.mock('expo-image', () => {
  const Image = (props: Record<string, unknown>) => {
    const { accessibilityLabel, style } = props as {
      accessibilityLabel?: string;
      style?: unknown;
    };
    return React.createElement('expo-image-stub', {
      'aria-label': accessibilityLabel,
      style,
    });
  };
  return { Image };
});

// --- react-native-reanimated — UI-thread animasyon motoru, testte mock ---
// DEM-228: `SwipeRow` + kart detay scroll handler reanimated kullanır. Testte
// worklet/UI-thread yok; shared value düz bir nesneye, `Animated.View`/
// `Animated.ScrollView` sıradan RN bileşenlerine indirgenir, hook'lar boş/sabit
// değer döndürür. Bileşen testleri animasyonu değil görünürlük/callback'i doğrular.
vi.mock('react-native-reanimated', async () => {
  const rn = (await vi.importActual('react-native')) as {
    View: unknown;
    ScrollView: unknown;
  };
  const AnimatedComponent = (component: unknown) => component;
  return {
    default: {
      View: rn.View,
      ScrollView: rn.ScrollView,
      createAnimatedComponent: AnimatedComponent,
    },
    View: rn.View,
    ScrollView: rn.ScrollView,
    createAnimatedComponent: AnimatedComponent,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => () => {},
    withTiming: (toValue: unknown) => toValue,
    withSpring: (toValue: unknown) => toValue,
    runOnJS:
      (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
  };
});

// --- react-native-gesture-handler — native jest motoru, testte mock ---
// DEM-228: `SwipeRow` `Gesture.Pan()` + `GestureDetector` kullanır. Testte
// gerçek jest tanıma yok; `GestureDetector` çocuğunu olduğu gibi render eder,
// `Gesture.Pan()` zincirlenebilir no-op bir builder döndürür. `SwipeRow` testi
// sil butonunun `onPress`'ini doğrular — jest simülasyonu kapsam dışı.
vi.mock('react-native-gesture-handler', () => {
  const chainable = (): Record<string, unknown> => {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get: (_target, prop) => {
        if (prop === 'then') return undefined;
        return () => proxy;
      },
    };
    const proxy = new Proxy({}, handler);
    return proxy;
  };
  return {
    GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    GestureDetector: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Gesture: {
      Pan: chainable,
      Tap: chainable,
      Pinch: chainable,
      Race: chainable,
      Simultaneous: chainable,
    },
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
