/**
 * Playwright global setup (Faz 3D — DEM-45). Runs once before the webServer +
 * the test run: applies pending DB migrations, then runs the deterministic e2e
 * seed (`e2e/fixtures/seed.ts`). Both go through pnpm/tsx subprocesses so the
 * workspace packages (`@pusula/db`) resolve exactly as they do in the apps —
 * Playwright's own loader doesn't transpile `node_modules`.
 *
 * Requires the local infra to be running (`pnpm infra:up` — repo-root
 * docker-compose Postgres/Redis). If migrate/seed fail (no DB), this throws and
 * the run is aborted with a clear message.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { E2E_DATABASE_URL } from './fixtures/env';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const DATABASE_URL = E2E_DATABASE_URL;

const childEnv = { ...process.env, DATABASE_URL };

function run(cmd: string): void {
  console.warn(`[e2e:setup] $ ${cmd}`);
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit', env: childEnv });
}

export default async function globalSetup(): Promise<void> {
  try {
    run('pnpm db:migrate');
    run('pnpm exec tsx e2e/fixtures/seed.ts');
  } catch (err) {
    throw new Error(
      `[e2e:setup] DB migrate/seed failed — is the local stack up? Run \`pnpm infra:up\` first.\n${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
