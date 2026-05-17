// Metro yapılandırması — Turborepo monorepo + NativeWind.
// Monorepo: Metro workspace kökünü izler ve hem app hem kök node_modules'ı
// çözümler (pnpm izole kurulum). NativeWind: `global.css` Tailwind girişini
// style sistemine bağlar.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm izole kurulumda hiyerarşik arama AÇIK kalmalı — Metro `.pnpm` iç
// node_modules'larına böyle ulaşır (`disableHierarchicalLookup` Yarn/npm
// hoisted monorepo içindir, pnpm'i kırar).

module.exports = withNativeWind(config, { input: './global.css' });
