/**
 * Realtime module — Phase 5C (DEM-85).
 *
 *   • `client.ts`           — Socket.IO singleton (`getRealtimeSocket`).
 *   • `in-flight-store.ts`  — `clientMutationId` set for echo skipping.
 *   • `event-handlers.ts`   — `dispatchRealtimeEvent` → board-cache primitives.
 *   • `use-board-realtime.ts` — mount on a board page to keep `board.get` in sync.
 *
 * Spec: `docs/architecture/05-board-mekanigi.md` §5.3, `08-web-ve-mobil.md` §8.1.10.
 */
export { REALTIME_EVENT_CHANNEL, disconnectRealtimeSocket, getRealtimeSocket } from './client';
export {
  addInFlightClientMutationId,
  clearInFlightClientMutationIds,
  hasInFlightClientMutationId,
  removeInFlightClientMutationId,
} from './in-flight-store';
export { dispatchRealtimeEvent } from './event-handlers';
export type { RealtimeFilters } from './event-handlers';
export { useBoardRealtime } from './use-board-realtime';
export type { UseBoardRealtimeResult } from './use-board-realtime';
