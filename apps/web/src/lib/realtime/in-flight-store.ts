/**
 * Process-wide set of in-flight `clientMutationId`s — Phase 5C (DEM-85).
 *
 * `useOptimisticBoardMutation` (Phase 4C / DEM-80) adds a mutation's
 * `clientMutationId` here in `onMutate` and removes it in `onSettled`; the
 * realtime listener (`useBoardRealtime`) consults the same set to decide
 * whether an incoming `RealtimeEventEnvelope` is the echo of *this* client's
 * own optimistic mutation (skip it — the optimistic patch already landed).
 *
 * The store is a plain module-scoped `Set` — not React state, not Zustand,
 * not context — because both producers (the mutation hook) and consumers
 * (the realtime listener) need a single, synchronous source of truth that's
 * independent of render cycles. Spec: `08-web-ve-mobil.md` §8.1.10.
 */

const inFlight = new Set<string>();

export function addInFlightClientMutationId(id: string): void {
  inFlight.add(id);
}

export function removeInFlightClientMutationId(id: string): void {
  inFlight.delete(id);
}

export function hasInFlightClientMutationId(id: string): boolean {
  return inFlight.has(id);
}

/** Test helper — clears the set between cases. Not used in production code. */
export function clearInFlightClientMutationIds(): void {
  inFlight.clear();
}
