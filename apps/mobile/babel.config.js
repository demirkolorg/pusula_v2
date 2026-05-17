// Expo + NativeWind Babel yapılandırması.
// `jsxImportSource: 'nativewind'` → JSX `className` prop'unu RN bileşenlerine
// bağlar. `nativewind/babel` preset'i style dönüşümünü tamamlar.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
