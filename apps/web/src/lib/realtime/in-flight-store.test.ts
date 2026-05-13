/**
 * In-flight `clientMutationId` set tests — Phase 5C (DEM-85).
 *
 * The store is the bridge between `useOptimisticBoardMutation` (Phase 4C) and
 * the realtime listener (Phase 5C): the mutation hook adds the id on `onMutate`
 * and removes it on `onSettled`, so the listener can `.has(id)` to skip the
 * echo of the user's own mutation. The store must therefore be a process-wide
 * singleton — no React context, no per-hook closure — so an event arriving on
 * any socket can ask any mutation hook "is this yours?".
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  addInFlightClientMutationId,
  clearInFlightClientMutationIds,
  hasInFlightClientMutationId,
  removeInFlightClientMutationId,
} from './in-flight-store';

afterEach(() => {
  clearInFlightClientMutationIds();
});

describe('in-flight clientMutationId store', () => {
  it('reports `false` for an unknown id', () => {
    expect(hasInFlightClientMutationId('never-added')).toBe(false);
  });

  it('add → has → remove → has', () => {
    addInFlightClientMutationId('id-1');
    expect(hasInFlightClientMutationId('id-1')).toBe(true);
    removeInFlightClientMutationId('id-1');
    expect(hasInFlightClientMutationId('id-1')).toBe(false);
  });

  it('treats multiple ids independently', () => {
    addInFlightClientMutationId('id-1');
    addInFlightClientMutationId('id-2');
    expect(hasInFlightClientMutationId('id-1')).toBe(true);
    expect(hasInFlightClientMutationId('id-2')).toBe(true);
    removeInFlightClientMutationId('id-1');
    expect(hasInFlightClientMutationId('id-1')).toBe(false);
    expect(hasInFlightClientMutationId('id-2')).toBe(true);
  });

  it('remove on an absent id is a no-op (does not throw)', () => {
    expect(() => removeInFlightClientMutationId('missing')).not.toThrow();
    expect(hasInFlightClientMutationId('missing')).toBe(false);
  });

  it('add is idempotent — re-adding the same id keeps a single membership', () => {
    addInFlightClientMutationId('id-1');
    addInFlightClientMutationId('id-1');
    expect(hasInFlightClientMutationId('id-1')).toBe(true);
    removeInFlightClientMutationId('id-1');
    expect(hasInFlightClientMutationId('id-1')).toBe(false);
  });

  it('the store is module-scoped (singleton): a second import sees the same set', async () => {
    addInFlightClientMutationId('shared');
    const reimport = await import('./in-flight-store');
    expect(reimport.hasInFlightClientMutationId('shared')).toBe(true);
  });
});
