import base from './eslint-base.mjs';

/**
 * ESLint config for the Next.js web app. The `next/core-web-vitals` and
 * `next/typescript` shareable configs are merged in `apps/web/eslint.config.mjs`
 * via `eslint-config-next`'s flat-config entry points, which need to resolve
 * from the app directory. This file just carries the shared base so the app
 * config stays a one-liner: `[...base, ...next]`.
 * @type {import("eslint").Linter.Config[]}
 */
export default base;
