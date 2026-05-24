/**
 * @pusula/ui/reports — Faz 13F UI primitives + micro-report
 * component'leri (DEM-262). Domain (`@pusula/domain/reports`) data
 * manifest ile aynı id üzerinden eşlenir; `apps/web` 13G/13H'de
 * composer + workspace `/reports` sayfasını bu paketten besler.
 *
 * Saf React + Tailwind + shadcn primitives + lucide + recharts.
 * Domain saf TS olduğu için bu paket UI bağımlılıklarını taşır.
 */
export * from './types';
export * from './primitives';
export * from './micro';
export * from './registry';
export { PrintPageFrame, type PrintPageFrameProps } from './print/print-page-frame';
