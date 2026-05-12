// Root ESLint config — for editor support at the repo root only.
// Each app/package owns its own `eslint.config.mjs`; `pnpm lint` runs them
// per-workspace via Turborepo.
import base from '@pusula/config/eslint-base';

export default base;
