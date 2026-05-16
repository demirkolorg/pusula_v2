/**
 * Integration tests for the Faz 11C (DEM-149) orphan attachment sweeper.
 *
 * Same Postgres-probe pattern as the other worker integration suites — skip
 * if the dev DB isn't reachable. The S3 surface is a fake; the sweeper's
 * contract is "storage first, DB second" so we exercise both happy and
 * partial-failure paths.
 *
 * Time is wound back by inserting rows with an explicit `createdAt` ≥ 1 h in
 * the past (cheaper than mocking `NOW()`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  attachments,
  boards,
  cards,
  lists,
  users,
  workspaces,
} from '@pusula/db';
import { sweepOrphanAttachments } from './attachment-cleanup-sweeper';
import type { AttachmentObjectStorage } from './attachment-cleanup';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

function recordingStorage(failKeys: ReadonlySet<string> = new Set()): AttachmentObjectStorage & {
  calls: Array<{ bucket: string; key: string }>;
} {
  const calls: Array<{ bucket: string; key: string }> = [];
  return {
    calls,
    async deleteObject(input) {
      calls.push(input);
      if (failKeys.has(input.key)) {
        throw Object.assign(new Error('simulated 5xx'), {
          name: 'ServiceUnavailable',
          $metadata: { httpStatusCode: 503 },
        });
      }
    },
  };
}

describe.runIf(dbAvailable)('sweepOrphanAttachments (integration)', () => {
  const db = () => probe!.db;
  const bucket = 'pusula-test';

  const userId = newId('u-acs');
  const workspaceId = newId('ws-acs');
  const boardId = newId('b-acs');
  const listId = newId('l-acs');
  const cardId = newId('c-acs');
  const cleanupAttachmentIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values({ id: userId, name: userId, email: `${userId}@example.test` });
    await db()
      .insert(workspaces)
      .values({ id: workspaceId, name: 'AC WS', slug: workspaceId, ownerId: userId });
    await db().insert(boards).values({ id: boardId, workspaceId, title: 'AC Board' });
    await db().insert(lists).values({ id: listId, boardId, title: 'L', position: 'a0' });
    await db().insert(cards).values({ id: cardId, boardId, listId, title: 'C', position: 'a0' });
  });

  afterAll(async () => {
    if (!probe) return;
    await db()
      .delete(attachments)
      .where(dbMod.inArray(attachments.id, cleanupAttachmentIds.length > 0 ? cleanupAttachmentIds : ['__none__']));
    await db().delete(cards).where(dbMod.eq(cards.id, cardId));
    await db().delete(lists).where(dbMod.eq(lists.id, listId));
    await db().delete(boards).where(dbMod.eq(boards.id, boardId));
    await db().delete(workspaces).where(dbMod.eq(workspaces.id, workspaceId));
    await db().delete(users).where(dbMod.eq(users.id, userId));
    await probe.pool.end();
  });

  beforeEach(async () => {
    // Clear any leftover attachments from a previous test in this file.
    if (cleanupAttachmentIds.length > 0) {
      await db().delete(attachments).where(dbMod.inArray(attachments.id, cleanupAttachmentIds));
      cleanupAttachmentIds.length = 0;
    }
  });

  /** Insert a draft attachment whose `created_at` is `ageMs` in the past. */
  async function seedDraft(opts: { ageMs: number; storageKey: string; committedAt?: Date }) {
    const id = newId('att');
    cleanupAttachmentIds.push(id);
    const createdAt = new Date(Date.now() - opts.ageMs);
    await db().insert(attachments).values({
      id,
      cardId,
      boardId,
      uploaderId: userId,
      storageKey: opts.storageKey,
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      committedAt: opts.committedAt ?? null,
      createdAt,
      updatedAt: createdAt,
    });
    return id;
  }

  it('deletes drafts older than 1 hour: storage first, then DB row', async () => {
    const storageKey = `drafts/${newId('k')}.pdf`;
    const id = await seedDraft({ ageMs: 61 * 60 * 1_000, storageKey });
    const storage = recordingStorage();

    const result = await sweepOrphanAttachments(db(), storage, bucket);

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(storage.calls).toContainEqual({ bucket, key: storageKey });
    const surviving = await db()
      .select({ id: attachments.id })
      .from(attachments)
      .where(dbMod.eq(attachments.id, id));
    expect(surviving).toHaveLength(0);
  });

  it('leaves committed (non-draft) rows alone — only drafts get swept', async () => {
    const storageKey = `committed/${newId('k')}.pdf`;
    const id = await seedDraft({
      ageMs: 61 * 60 * 1_000,
      storageKey,
      committedAt: new Date(Date.now() - 30 * 60 * 1_000),
    });
    const storage = recordingStorage();

    await sweepOrphanAttachments(db(), storage, bucket);

    expect(storage.calls.find((c) => c.key === storageKey)).toBeUndefined();
    const surviving = await db()
      .select({ id: attachments.id })
      .from(attachments)
      .where(dbMod.eq(attachments.id, id));
    expect(surviving).toHaveLength(1);
  });

  it('keeps drafts that are still inside the 1-hour grace window', async () => {
    const storageKey = `fresh/${newId('k')}.pdf`;
    const id = await seedDraft({ ageMs: 30 * 60 * 1_000, storageKey });
    const storage = recordingStorage();

    await sweepOrphanAttachments(db(), storage, bucket);

    expect(storage.calls.find((c) => c.key === storageKey)).toBeUndefined();
    const surviving = await db()
      .select({ id: attachments.id })
      .from(attachments)
      .where(dbMod.eq(attachments.id, id));
    expect(surviving).toHaveLength(1);
  });

  it('preserves the DB row when storage delete fails (next tick redrives it)', async () => {
    const goodKey = `drafts/${newId('k')}.pdf`;
    const badKey = `drafts/${newId('k')}.pdf`;
    const goodId = await seedDraft({ ageMs: 61 * 60 * 1_000, storageKey: goodKey });
    const badId = await seedDraft({ ageMs: 61 * 60 * 1_000, storageKey: badKey });
    const storage = recordingStorage(new Set([badKey]));

    const result = await sweepOrphanAttachments(db(), storage, bucket);

    expect(result.storageFailed).toBeGreaterThanOrEqual(1);
    // Good row gone, bad row still present.
    const remaining = await db()
      .select({ id: attachments.id })
      .from(attachments)
      .where(dbMod.inArray(attachments.id, [goodId, badId]));
    const remainingIds = remaining.map((r) => r.id);
    expect(remainingIds).toContain(badId);
    expect(remainingIds).not.toContain(goodId);
  });

  it('idempotent: a second run on the same fixtures is a no-op (rows already gone)', async () => {
    const storageKey = `drafts/${newId('k')}.pdf`;
    await seedDraft({ ageMs: 61 * 60 * 1_000, storageKey });
    const storage = recordingStorage();

    const first = await sweepOrphanAttachments(db(), storage, bucket);
    expect(first.dbDeleted).toBeGreaterThanOrEqual(1);

    const second = await sweepOrphanAttachments(db(), storage, bucket);
    // No more drafts → 0 scanned for *this* row's key (the wider DB may have
    // unrelated drafts, but our specific seeded key is gone).
    expect(storage.calls.filter((c) => c.key === storageKey)).toHaveLength(1);
    expect(second.dbDeleted).toBe(0);
  });

  describe('mock-time eligibility transition (1h 1min boundary)', () => {
    // The sweeper's eligibility predicate is `created_at < NOW() - 1h`, and
    // `NOW()` is *Postgres'* clock — `vi.useFakeTimers()` only shifts the JS
    // clock, so it can't move the SQL boundary. The portable way to exercise
    // the boundary is to wind the row's `created_at` itself: a draft re-stamped
    // to "1h 1min ago" relative to live DB time crosses the threshold. This is
    // the same `ageMs` lever the other cases use, here as an explicit
    // before/after transition.
    it('a fresh draft survives the sweep, then is swept once aged past 1h 1min', async () => {
      const storageKey = `mocktime/${newId('k')}.pdf`;
      // Phase 1 — draft created "now" (age 0): inside the 1-hour grace window.
      const id = await seedDraft({ ageMs: 0, storageKey });

      const storage = recordingStorage();
      const before = await sweepOrphanAttachments(db(), storage, bucket);
      expect(before.dbDeleted).toBe(0);
      expect(storage.calls.find((c) => c.key === storageKey)).toBeUndefined();
      const stillThere = await db()
        .select({ id: attachments.id })
        .from(attachments)
        .where(dbMod.eq(attachments.id, id));
      expect(stillThere).toHaveLength(1);

      // Phase 2 — "advance time" by aging the row: re-stamp `created_at` to
      // 1h 1min before live DB `NOW()`. The row now crosses the threshold.
      await db()
        .update(attachments)
        .set({ createdAt: new Date(Date.now() - 61 * 60 * 1_000) })
        .where(dbMod.eq(attachments.id, id));

      const after = await sweepOrphanAttachments(db(), storage, bucket);
      expect(after.dbDeleted).toBeGreaterThanOrEqual(1);
      // Storage object deleted first, then the DB row.
      expect(storage.calls).toContainEqual({ bucket, key: storageKey });
      const swept = await db()
        .select({ id: attachments.id })
        .from(attachments)
        .where(dbMod.eq(attachments.id, id));
      expect(swept).toHaveLength(0);
    });

    it('exactly at the 1h grace boundary the row stays; one extra minute sweeps it', async () => {
      // Just *inside* the window (59 min) — not eligible.
      const freshKey = `boundary/${newId('k')}.pdf`;
      const freshId = await seedDraft({ ageMs: 59 * 60 * 1_000, storageKey: freshKey });
      // Just *past* the window (61 min) — eligible.
      const staleKey = `boundary/${newId('k')}.pdf`;
      const staleId = await seedDraft({ ageMs: 61 * 60 * 1_000, storageKey: staleKey });

      const storage = recordingStorage();
      await sweepOrphanAttachments(db(), storage, bucket);

      expect(storage.calls.find((c) => c.key === freshKey)).toBeUndefined();
      expect(storage.calls).toContainEqual({ bucket, key: staleKey });
      const remaining = await db()
        .select({ id: attachments.id })
        .from(attachments)
        .where(dbMod.inArray(attachments.id, [freshId, staleId]));
      const ids = remaining.map((r) => r.id);
      expect(ids).toContain(freshId);
      expect(ids).not.toContain(staleId);
    });
  });
});
