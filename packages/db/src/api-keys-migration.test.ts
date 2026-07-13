import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import * as dbMod from './index';
import { apiKeys } from './schema/api-keys';

/**
 * Public API + Bot Erişimi — Task 1 (DB şeması + migration) doğrulama testi.
 * Migration `0056_public_api_keys_and_bot_flag.sql` iki değişikliği ekler:
 *   1. `users.is_bot boolean NOT NULL DEFAULT false` — bot servis hesabı bayrağı
 *   2. Yeni `api_keys` tablosu — board-scoped bot key'i (`token_hash` SHA-256 +
 *      `token_prefix`; plain key hiçbir yerde saklanmaz — `share_links` deseni).
 *
 * Kanonik referans:
 * `docs/superpowers/plans/2026-07-13-public-api-ve-bot-erisimi.md` "Veri modeli".
 *
 * `attachments-migration.test.ts` / `reports-migration.test.ts` pattern'i:
 *   - Schema-shape + migration .sql metni assertion'ları (DB gerektirmez)
 *   - Canlı DB integration block (`describe.runIf(dbAvailable)`) — Postgres
 *     ulaşılamazsa atlanır ama discoverable kalır.
 */

const MIGRATION_FILE = '0056_public_api_keys_and_bot_flag.sql';

// --- Schema-shape assertions (no DB required) --------------------------------

describe('api_keys schema shape', () => {
  it('api_keys has the documented column set with text PK', () => {
    const columns = getTableColumns(apiKeys);

    expect(Object.keys(columns)).toEqual([
      'id',
      'name',
      'tokenHash',
      'tokenPrefix',
      'botUserId',
      'boardId',
      'role',
      'createdBy',
      'expiresAt',
      'lastUsedAt',
      'revokedAt',
      'createdAt',
    ]);

    expect(columns.id?.getSQLType()).toBe('text');
    expect(columns.name?.getSQLType()).toBe('text');
    expect(columns.tokenHash?.getSQLType()).toBe('text');
    expect(columns.tokenPrefix?.getSQLType()).toBe('text');
    expect(columns.botUserId?.getSQLType()).toBe('text');
    expect(columns.boardId?.getSQLType()).toBe('text');
    expect(columns.createdBy?.getSQLType()).toBe('text');
    expect(columns.role?.getSQLType()).toBe('board_role');
  });

  it('marks the required columns NOT NULL and the lifecycle columns nullable', () => {
    const columns = getTableColumns(apiKeys);

    expect(columns.name?.notNull).toBe(true);
    expect(columns.tokenHash?.notNull).toBe(true);
    expect(columns.tokenPrefix?.notNull).toBe(true);
    expect(columns.botUserId?.notNull).toBe(true);
    expect(columns.boardId?.notNull).toBe(true);
    expect(columns.role?.notNull).toBe(true);
    expect(columns.createdBy?.notNull).toBe(true);
    expect(columns.createdAt?.notNull).toBe(true);

    // null = süresiz / hiç kullanılmadı / iptal edilmedi.
    expect(columns.expiresAt?.notNull).toBe(false);
    expect(columns.lastUsedAt?.notNull).toBe(false);
    expect(columns.revokedAt?.notNull).toBe(false);
  });

  it('defaults role to the board `member` role', () => {
    const columns = getTableColumns(apiKeys);
    expect(columns.role?.default).toBe('member');
  });

  it('exposes the token_hash unique index + token_prefix / board indexes', () => {
    const config = getTableConfig(apiKeys);

    const uniqueIndexNames = config.indexes.filter((b) => b.config.unique).map((b) => b.config.name);
    expect(uniqueIndexNames).toContain('api_keys_token_hash_uq');

    const indexNames = config.indexes.map((b) => b.config.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'api_keys_token_hash_uq',
        'api_keys_token_prefix_idx',
        'api_keys_board_idx',
      ]),
    );
  });

  it('wires bot_user_id / board_id / created_by foreign keys with board cascade', () => {
    const config = getTableConfig(apiKeys);
    // Drizzle exposes FK local columns by their JS (camelCase) key; the DB
    // snake_case names + ON DELETE behavior are asserted on the migration SQL.
    const fkColumns = config.foreignKeys.map((fk) => fk.reference().columns[0]?.name).sort();
    expect(fkColumns).toEqual(['boardId', 'botUserId', 'createdBy']);

    const boardFk = config.foreignKeys.find(
      (fk) => fk.reference().columns[0]?.name === 'boardId',
    );
    expect(boardFk?.onDelete).toBe('cascade');
  });

  it('is exported from the package barrel', () => {
    expect(dbMod.apiKeys).toBe(apiKeys);
  });
});

// --- Static migration-file assertions (no DB required) -----------------------

describe('0056 api_keys migration file', () => {
  const migrationPath = resolve(import.meta.dirname, '..', 'drizzle', MIGRATION_FILE);

  it('exists in the drizzle migrations folder', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('adds the users.is_bot boolean column defaulting to false', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toContain(
      'ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL',
    );
  });

  it('creates the api_keys table with a text primary key', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(/CREATE TABLE "api_keys" \([\s\S]*?"id" text PRIMARY KEY NOT NULL/);
  });

  it('cascade-deletes api_keys when the board is removed', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(
      /api_keys_board_id_boards_id_fk[\s\S]*?REFERENCES "public"\."boards"\("id"\) ON DELETE cascade/,
    );
  });

  it('references users from bot_user_id and created_by', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toMatch(
      /api_keys_bot_user_id_users_id_fk[\s\S]*?REFERENCES "public"\."users"\("id"\)/,
    );
    expect(sqlText).toMatch(
      /api_keys_created_by_users_id_fk[\s\S]*?REFERENCES "public"\."users"\("id"\)/,
    );
  });

  it('enforces a UNIQUE token_hash and indexes token_prefix + board_id', () => {
    const sqlText = readFileSync(migrationPath, 'utf8');
    expect(sqlText).toContain(
      'CREATE UNIQUE INDEX "api_keys_token_hash_uq" ON "api_keys" USING btree ("token_hash")',
    );
    expect(sqlText).toContain(
      'CREATE INDEX "api_keys_token_prefix_idx" ON "api_keys" USING btree ("token_prefix")',
    );
    expect(sqlText).toContain(
      'CREATE INDEX "api_keys_board_idx" ON "api_keys" USING btree ("board_id")',
    );
  });
});

// --- Live-DB integration assertions ------------------------------------------

// Probe the DB at collection time so `describe.runIf` can react to it. The
// probe also confirms the migration ran (is_bot column + api_keys table exist).
let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
  await probe.db.execute(dbMod.sql`select is_bot from users limit 0`);
  await probe.db.execute(dbMod.sql`select token_hash from api_keys limit 0`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

describe.runIf(dbAvailable)('0056 api_keys migration (integration)', () => {
  const db = () => probe!.db;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(dbMod.workspaces).where(dbMod.eq(dbMod.workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(dbMod.users).where(dbMod.eq(dbMod.users.id, id));
    }
    await probe?.pool.end();
  });

  /** Seed a workspace → board chain plus a bot user so an api_keys row is FK-valid. */
  async function seedBoardAndBot() {
    const ownerId = newId('u-apikey');
    const botId = newId('u-bot');
    createdUserIds.push(ownerId, botId);
    await db()
      .insert(dbMod.users)
      .values([
        { id: ownerId, name: ownerId, email: `${ownerId}@example.test` },
        { id: botId, name: 'Otomasyon Botu', email: `${botId}@bots.pusula.internal`, isBot: true },
      ]);

    const [ws] = await db()
      .insert(dbMod.workspaces)
      .values({ name: 'API Key Co', slug: newId('apikey-co'), ownerId })
      .returning({ id: dbMod.workspaces.id });
    createdWorkspaceIds.push(ws!.id);
    await db()
      .insert(dbMod.workspaceMembers)
      .values({ workspaceId: ws!.id, userId: ownerId, role: 'owner' });

    const [board] = await db()
      .insert(dbMod.boards)
      .values({ workspaceId: ws!.id, title: 'Bot Panosu' })
      .returning({ id: dbMod.boards.id });

    return { boardId: board!.id, ownerId, botId };
  }

  it('defaults users.is_bot to false and accepts an explicit true', async () => {
    const humanId = newId('u-human');
    const botId = newId('u-bot');
    createdUserIds.push(humanId, botId);
    await db()
      .insert(dbMod.users)
      .values([
        { id: humanId, name: humanId, email: `${humanId}@example.test` },
        { id: botId, name: 'Bot', email: `${botId}@bots.pusula.internal`, isBot: true },
      ]);

    const rows = await db()
      .select({ id: dbMod.users.id, isBot: dbMod.users.isBot })
      .from(dbMod.users)
      .where(dbMod.inArray(dbMod.users.id, [humanId, botId]));
    const byId = new Map(rows.map((r) => [r.id, r.isBot]));
    expect(byId.get(humanId)).toBe(false);
    expect(byId.get(botId)).toBe(true);
  });

  it('persists an api_keys row with prefix + hash and null lifecycle columns', async () => {
    const { boardId, ownerId, botId } = await seedBoardAndBot();

    const [key] = await db()
      .insert(apiKeys)
      .values({
        name: 'Otomasyon Botu',
        tokenHash: newId('hash'),
        tokenPrefix: 'psk_abcd1234',
        botUserId: botId,
        boardId,
        role: 'member',
        createdBy: ownerId,
      })
      .returning({
        id: apiKeys.id,
        role: apiKeys.role,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      });

    expect(key?.id).toBeTruthy();
    expect(key?.role).toBe('member');
    expect(key?.expiresAt).toBeNull();
    expect(key?.lastUsedAt).toBeNull();
    expect(key?.revokedAt).toBeNull();
    expect(key?.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate token_hash via the unique index', async () => {
    const { boardId, ownerId, botId } = await seedBoardAndBot();
    const tokenHash = newId('hash-dup');

    await db()
      .insert(apiKeys)
      .values({
        name: 'Bot A',
        tokenHash,
        tokenPrefix: 'psk_aaaa1111',
        botUserId: botId,
        boardId,
        createdBy: ownerId,
      });

    let caught: unknown;
    try {
      await db()
        .insert(apiKeys)
        .values({
          name: 'Bot B',
          tokenHash,
          tokenPrefix: 'psk_bbbb2222',
          botUserId: botId,
          boardId,
          createdBy: ownerId,
        });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const pgErr = (caught as { cause?: { code?: string } }).cause;
    expect(pgErr?.code).toBe('23505'); // unique_violation
  });

  it('cascade-deletes api_keys rows when the board is removed', async () => {
    const { boardId, ownerId, botId } = await seedBoardAndBot();

    const [key] = await db()
      .insert(apiKeys)
      .values({
        name: 'Cascade Bot',
        tokenHash: newId('hash-cascade'),
        tokenPrefix: 'psk_cccc3333',
        botUserId: botId,
        boardId,
        createdBy: ownerId,
      })
      .returning({ id: apiKeys.id });

    await db().delete(dbMod.boards).where(dbMod.eq(dbMod.boards.id, boardId));

    const survivors = await db()
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(dbMod.eq(apiKeys.id, key!.id));
    expect(survivors).toHaveLength(0);
  });

  it('defaults role to member when omitted', async () => {
    const { boardId, ownerId, botId } = await seedBoardAndBot();
    const [key] = await db()
      .insert(apiKeys)
      .values({
        name: 'Default Role Bot',
        tokenHash: newId('hash-role'),
        tokenPrefix: 'psk_dddd4444',
        botUserId: botId,
        boardId,
        createdBy: ownerId,
      })
      .returning({ role: apiKeys.role });
    expect(key?.role).toBe('member');
  });
});
