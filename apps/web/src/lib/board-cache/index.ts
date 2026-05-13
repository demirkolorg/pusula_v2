/**
 * Board cache module — Phase 4 optimistic UI infrastructure (DEM-79).
 *
 *   • `keys.ts`        — query key factory (component code never writes a literal key array).
 *   • `types.ts`       — `BoardCache` / `ListCache` / `CardCache` from tRPC outputs.
 *   • `primitives.ts`  — pure cache transforms (move/patch/add/remove/archive).
 *   • `mutations.ts`   — `useOptimisticBoardMutation` higher-order hook.
 *
 * Doc: `docs/architecture/05-board-mekanigi.md` §5.2, `08-web-ve-mobil.md` §8.1.9.
 */
export * from './keys';
export * from './types';
export * from './primitives';
export * from './mutations';
