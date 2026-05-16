import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from './index';

/**
 * Faz 11A (DEM-147) — migration `0027_dem147_faz11A_attachments_general.sql`
 * doğrulama testi. `attachments` tablosu DEM-110 kart-kapak-resmi yolundan
 * genel kart eki yoluna genişler: iki yeni kolon (`description`, `committed_at`),
 * iki partial index, ve DEM-110 satırları için `committed_at = created_at`
 * geriye-dönük backfill.
 *
 * Bağlantı pattern'i `search-indexer.test.ts` ile aynı: import-time probe →
 * canlı PostgreSQL yoksa `describe.runIf` ile integration bloğu atlanır
 * (yine de discoverable). Migration'ın `.sql` metnini doğrulayan statik blok
 * her zaman koşar (DB gerektirmez).
 */

// --- Static migration-file assertions (no DB required) ------------------------

const MIGRATION_FILE = '0027_dem147_faz11A_attachments_general.sql';

describe('0027 attachments migration file', () => {
  const migrationPath = resolve(import.meta.dirname, '..', 'drizzle', MIGRATION_FILE);

  it('exists in the drizzle migrations folder', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('adds the description + committed_at columns and backfills legacy rows', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');

    expect(sqlText).toContain('ALTER TABLE "attachments" ADD COLUMN "description" text');
    expect(sqlText).toContain(
      'ALTER TABLE "attachments" ADD COLUMN "committed_at" timestamp with time zone',
    );
    // Backfill: DEM-110 single-shot rows were already "committed" semantically.
    expect(sqlText).toContain(
      'UPDATE "attachments" SET "committed_at" = "created_at" WHERE "committed_at" IS NULL',
    );
  });

  it('creates the two partial indexes with the documented WHERE predicates', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');

    expect(sqlText).toContain('CREATE INDEX "attachments_card_committed_idx"');
    expect(sqlText).toContain('CREATE INDEX "attachments_orphan_sweep_idx"');
    // Card-list query index → only committed rows.
    expect(sqlText).toMatch(
      /attachments_card_committed_idx[\s\S]*WHERE\s+"attachments"\."committed_at"\s+IS NOT NULL/,
    );
    // Orphan-sweep index → only draft rows.
    expect(sqlText).toMatch(
      /attachments_orphan_sweep_idx[\s\S]*WHERE\s+"attachments"\."committed_at"\s+IS NULL/,
    );
  });
});

// --- Live-DB integration assertions -------------------------------------------

// Probe the database at collection time so `describe.runIf` can react to it.
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  // Confirm the table itself exists before running migration-shape assertions.
  await probe.db.execute(dbMod.sql`select committed_at, description from attachments limit 0`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('0027 attachments migration (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAttachmentIds: string[] = [];

  afterAll(async () => {
    for (const id of createdAttachmentIds) {
      await db().delete(dbMod.attachments).where(dbMod.eq(dbMod.attachments.id, id));
    }
    for (const id of createdWorkspaceIds) {
      await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(dbMod.users).where(dbMod.eq(dbMod.users.id, id));
    }
    await probe?.pool.end();
  });

  /** Seed a workspace → board → list → card chain so an attachment row is FK-valid. */
  async function seedCard() {
    const ownerId = newId('u-att');
    createdUserIds.push(ownerId);
    await db()
      .insert(dbMod.users)
      .values({ id: ownerId, name: ownerId, email: `${ownerId}@example.test` });

    const [ws] = await db()
      .insert(dbMod.workspaces)
      .values({ name: 'Attachment Co', slug: newId('att-co'), ownerId })
      .returning({ id: dbMod.workspaces.id });
    createdWorkspaceIds.push(ws!.id);
    await db()
      .insert(dbMod.workspaceMembers)
      .values({ workspaceId: ws!.id, userId: ownerId, role: 'owner' });

    const [board] = await db()
      .insert(dbMod.boards)
      .values({ workspaceId: ws!.id, title: 'Ek Panosu' })
      .returning({ id: dbMod.boards.id });
    await db()
      .insert(dbMod.boardMembers)
      .values({ boardId: board!.id, userId: ownerId, role: 'admin' });

    const [list] = await db()
      .insert(dbMod.lists)
      .values({ boardId: board!.id, title: 'Liste', position: 'a0' })
      .returning({ id: dbMod.lists.id });
    const [card] = await db()
      .insert(dbMod.cards)
      .values({ boardId: board!.id, listId: list!.id, title: 'Kart', position: 'a0' })
      .returning({ id: dbMod.cards.id });

    return { boardId: board!.id, cardId: card!.id, uploaderId: ownerId };
  }

  it('exposes the description + committed_at columns on the attachments table', async () => {
    const rows = await db().execute(dbMod.sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'attachments'
        AND column_name IN ('description', 'committed_at')
      ORDER BY column_name
    `);

    const byName = new Map(
      rows.rows.map((r) => [r.column_name as string, r as Record<string, unknown>]),
    );
    expect([...byName.keys()].sort()).toEqual(['committed_at', 'description']);

    expect(byName.get('description')?.data_type).toBe('text');
    expect(byName.get('description')?.is_nullable).toBe('YES');

    expect(byName.get('committed_at')?.data_type).toBe('timestamp with time zone');
    expect(byName.get('committed_at')?.is_nullable).toBe('YES');
  });

  it('created both partial indexes with their committed_at WHERE predicates', async () => {
    const rows = await db().execute(dbMod.sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'attachments'
        AND indexname IN ('attachments_card_committed_idx', 'attachments_orphan_sweep_idx')
      ORDER BY indexname
    `);

    const byName = new Map(rows.rows.map((r) => [r.indexname as string, r.indexdef as string]));
    expect([...byName.keys()].sort()).toEqual([
      'attachments_card_committed_idx',
      'attachments_orphan_sweep_idx',
    ]);

    // Card-list index → partial on committed rows only.
    const committedIdx = byName.get('attachments_card_committed_idx')!;
    expect(committedIdx).toMatch(/committed_at IS NOT NULL/);
    expect(committedIdx).toMatch(/card_id/);

    // Orphan-sweep index → partial on draft rows only.
    const orphanIdx = byName.get('attachments_orphan_sweep_idx')!;
    expect(orphanIdx).toMatch(/committed_at IS NULL/);
  });

  it('backfilled every pre-existing (legacy) attachment row to a non-null committed_at', async () => {
    // Migration backfill invariant: only fresh `attachment.initiate` drafts may
    // carry `committed_at IS NULL`, and the orphan sweeper clears those within
    // an hour. No *legacy* row (created before the migration ran) should remain
    // a draft — proxy that as "no draft row older than 1 day survives".
    const stale = await db().execute(dbMod.sql`
      SELECT count(*)::int AS n
      FROM attachments
      WHERE committed_at IS NULL
        AND created_at < NOW() - INTERVAL '1 day'
    `);
    expect(stale.rows[0]?.n).toBe(0);
  });

  it('reproduces the backfill: a draft row UPDATEs to committed_at = created_at', async () => {
    const { boardId, cardId, uploaderId } = await seedCard();

    // Insert a draft row (committed_at IS NULL) the way `attachment.initiate` does.
    const [draft] = await db()
      .insert(dbMod.attachments)
      .values({
        cardId,
        boardId,
        uploaderId,
        storageKey: `boards/${boardId}/cards/${cardId}/${newId('obj')}-rapor.pdf`,
        fileName: 'rapor.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      })
      .returning({ id: dbMod.attachments.id, createdAt: dbMod.attachments.createdAt });
    createdAttachmentIds.push(draft!.id);

    const before = await db()
      .select({ committedAt: dbMod.attachments.committedAt })
      .from(dbMod.attachments)
      .where(dbMod.eq(dbMod.attachments.id, draft!.id));
    expect(before[0]?.committedAt).toBeNull();

    // Apply the migration's backfill statement to this row.
    await db().execute(dbMod.sql`
      UPDATE attachments
      SET committed_at = created_at
      WHERE id = ${draft!.id} AND committed_at IS NULL
    `);

    const after = await db()
      .select({
        committedAt: dbMod.attachments.committedAt,
        createdAt: dbMod.attachments.createdAt,
      })
      .from(dbMod.attachments)
      .where(dbMod.eq(dbMod.attachments.id, draft!.id));
    expect(after[0]?.committedAt).not.toBeNull();
    expect(after[0]?.committedAt?.getTime()).toBe(after[0]?.createdAt.getTime());
  });

  it('stores an optional description and accepts NULL when omitted', async () => {
    const { boardId, cardId, uploaderId } = await seedCard();

    const [withDesc] = await db()
      .insert(dbMod.attachments)
      .values({
        cardId,
        boardId,
        uploaderId,
        storageKey: `boards/${boardId}/cards/${cardId}/${newId('obj')}-a.png`,
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 512,
        description: 'kapak adayı',
        committedAt: new Date(),
      })
      .returning({ id: dbMod.attachments.id });
    createdAttachmentIds.push(withDesc!.id);

    const [noDesc] = await db()
      .insert(dbMod.attachments)
      .values({
        cardId,
        boardId,
        uploaderId,
        storageKey: `boards/${boardId}/cards/${cardId}/${newId('obj')}-b.png`,
        fileName: 'b.png',
        mimeType: 'image/png',
        size: 512,
        committedAt: new Date(),
      })
      .returning({ id: dbMod.attachments.id });
    createdAttachmentIds.push(noDesc!.id);

    const rows = await db()
      .select({ id: dbMod.attachments.id, description: dbMod.attachments.description })
      .from(dbMod.attachments)
      .where(dbMod.inArray(dbMod.attachments.id, [withDesc!.id, noDesc!.id]));
    const byId = new Map(rows.map((r) => [r.id, r.description]));
    expect(byId.get(withDesc!.id)).toBe('kapak adayı');
    expect(byId.get(noDesc!.id)).toBeNull();
  });
});
