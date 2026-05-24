import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import pluginPusula from './eslint-plugin-pusula.mjs';

/**
 * Shared flat ESLint config for all Pusula packages/apps.
 *
 * `pusula/no-hardcoded-text-in-reports` (Faz 13Q): reports modülünde JSX
 * text literal + görünür string attribute hardcode yasak — i18n key
 * (t(key)) kullanılmalı. Plugin tüm dosyalarda kurulu ama sadece
 * `apps/web/src/components/reports/**` + `packages/ui/src/reports/**`
 * altındaki non-test dosyaları kontrol eder (plugin içi filename guard).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(
  {
    ignores: ['dist/**', '.next/**', '.turbo/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      pusula: pluginPusula,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'pusula/no-hardcoded-text-in-reports': 'error',
    },
  },
  prettier,
);
