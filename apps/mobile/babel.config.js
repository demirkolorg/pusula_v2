// Expo + NativeWind Babel yapılandırması.
// `jsxImportSource: 'nativewind'` → JSX `className` prop'unu RN bileşenlerine
// bağlar. `nativewind/babel` preset'i style dönüşümünü tamamlar.
//
// Reanimated notu (DEM-228): `react-native-reanimated` 4.x worklet dönüşümü
// `react-native-worklets/plugin` ile yapılır. `babel-preset-expo` SDK 54 bu
// plugin'i `react-native-worklets` paketi kuruluysa OTOMATİK ekler (preset
// kaynağı `index.js` ~284. satır) — bu yüzden plugin burada elle eklenmez;
// elle eklemek çift kayıt hatası verir.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
