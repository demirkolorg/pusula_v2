/**
 * Shared e2e environment defaults (Faz 3D — DEM-45).
 *
 * Single source of truth for the default URLs / credentials used across
 * playwright.config.ts, global-setup.ts, auth.fixture.ts, and the spec files.
 * Must NOT import any workspace package — Playwright transpiles this file
 * directly; workspace packages resolve only inside the apps/worker processes.
 */

export const E2E_WEB_URL =
  process.env.APP_URL ??
  `http://localhost:${Number(process.env.WEB_PORT ?? 3000)}`;

export const E2E_API_URL =
  process.env.API_URL ??
  `http://localhost:${Number(process.env.API_PORT ?? 3001)}`;

export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://pusula:pusula@localhost:5436/pusula';
