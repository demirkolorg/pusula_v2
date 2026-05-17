import base from '@pusula/config/eslint-base';

// Mobil (Expo) — paylaşılan flat config + Expo'ya özgü üretilmiş/araç
// dosyalarının yok sayılması. RN bileşen lint kuralları (react-native plugin)
// ileri fazda (7N test altyapısı) eklenir.
export default [
  ...base,
  {
    ignores: [
      '.expo/**',
      'dist/**',
      'expo-env.d.ts',
      'nativewind-env.d.ts',
      'babel.config.js',
      'metro.config.js',
      'tailwind.config.js',
    ],
  },
];
