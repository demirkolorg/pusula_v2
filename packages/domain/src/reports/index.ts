/**
 * @pusula/domain/reports — Faz 13 raporlama sistemi domain paketi
 * (DEM-259 / 13C).
 *
 * Saf TypeScript: React, Drizzle, tRPC bağımlılığı YOK.
 *
 * - `types`         — Zod şemaları + TS tipleri
 * - `comparison`    — period-over-period delta hesabı (saf fonksiyon)
 * - `scope-adapter` — ScopeAdapter contract + QueryCtx + resolveRange
 * - `permission`    — yetki matrisi helper (canPerformReportAction)
 * - `registry`      — 30 micro-report data manifest (UI manifest 13F'de)
 * - `presets`       — 19 preset şablon manifest
 * - `i18n-keys`     — tüm string ID sabitleri
 */
export * from './types';
export * from './comparison';
export * from './scope-adapter';
export * from './permission';
export * from './registry';
export * from './presets';
export * from './i18n-keys';
