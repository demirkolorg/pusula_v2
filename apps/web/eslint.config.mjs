import base from '@pusula/config/eslint-base';

// TODO: layer in `next/core-web-vitals` via @eslint/eslintrc FlatCompat once
// the Next 16 + typescript-eslint v8 peer set is pinned.
export default [...base, { ignores: ['.next/**', 'next-env.d.ts'] }];
