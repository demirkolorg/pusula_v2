/**
 * Integration tests for the attachment router. These hit a real Postgres
 * (`DATABASE_URL`, brought up by `pnpm infra:up` + `pnpm db:migrate`). If no
 * database is reachable the suite is skipped rather than failing on a box
 * without infra.
 *
 * Coverage:
 *  - DEM-110 legacy cover-image download (`getDownloadUrl` viewer+ access).
 *  - Faz 11B (DEM-148) two-phase commit:
 *    - `initiate` permission + Zod gate + draft row + presigned PUT URL.
 *    - `commit` idempotency + activity + realtime + notification fan-out.
 *    - `list` viewer+ access + draft filter + isCover flag + uploader join.
 *    - `update` description-only (uploader/admin) + draft rejection.
 *    - `delete` uploader/admin + tx + cover SET NULL + cleanup enqueue.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES } from '@pusula/domain';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  attachments,
  boardMembers,
  boards,
  cards,
  notificationOutbox,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createCallerFactory } from '../trpc';
import { appRouter } from '../root';
import { createContext, type EnqueueAttachmentCleanup } from '../context';
import { initiateRateState } from './attachment';

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
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-at-owner');
const memberId = newId('u-at-member');
const member2Id = newId('u-at-member2');
const viewerId = newId('u-at-viewer');
const outsiderId = newId('u-at-outsider');
const watcherId = newId('u-at-watcher');
const assigneeId = newId('u-at-assignee');
const createdUserIds = [ownerId, memberId, member2Id, viewerId, outsiderId, watcherId, assigneeId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function fakeObjectStorage() {
  return {
    // Mirrors the real `objectStorage.createPresignedPutUrl` (apps/api): the
    // returned `headers` carry BOTH `content-type` and `content-length`, both
    // signed into the URL (Faz 11B — DEM-148 / security H1).
    createPresignedPutUrl: vi.fn(
      async (input: { key: string; contentType: string; contentLength: number }) => ({
        url: 'https://storage.test/put',
        headers: {
          'content-type': input.contentType,
          'content-length': String(input.contentLength),
        },
      }),
    ),
    createPresignedGetUrl: vi.fn(async () => 'https://storage.test/get'),
    publicUrl: vi.fn((key: string) => `https://storage.test/public/${key}`),
  };
}

interface CallerOpts {
  /**
   * Pass an explicit fake to assert on presign calls, or `null` to simulate an
   * unconfigured object storage (graceful-degradation tests). Omitting the key
   * falls back to a fresh fake.
   */
  objectStorage?: ReturnType<typeof fakeObjectStorage> | null;
  enqueueAttachmentCleanup?: EnqueueAttachmentCleanup;
}

function callerFor(userId: string, opts: CallerOpts = {}) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(
    createContext({
      session: session(userId),
      db: probe.db,
      objectStorage:
        opts.objectStorage === null ? undefined : (opts.objectStorage ?? fakeObjectStorage()),
      enqueueAttachmentCleanup: opts.enqueueAttachmentCleanup,
    }),
  );
}

describe.runIf(dbAvailable)('attachment router (integration)', () => {
  const db = () => probe!.db;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'Attachment Co',
      slug: newSlug('attachment-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: member2Id, role: 'member' },
        { workspaceId, userId: viewerId, role: 'guest' },
        { workspaceId, userId: watcherId, role: 'member' },
        { workspaceId, userId: assigneeId, role: 'member' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'Attachment Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    // Viewer needs an explicit board_members row (workspace guest).
    await db().insert(boardMembers).values({ boardId, userId: viewerId, role: 'viewer' });

    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Cards',
      clientMutationId: crypto.randomUUID(),
    });
    listId = list.id;
    const card = await callerFor(ownerId).card.create({
      listId,
      title: 'Attachment card',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;

    // Card watcher + assignee — needed for `attachment.commit` fan-out tests.
    await callerFor(ownerId).card.members.add({
      cardId,
      userId: watcherId,
      role: 'watcher',
      clientMutationId: crypto.randomUUID(),
    });
    await callerFor(ownerId).card.members.add({
      cardId,
      userId: assigneeId,
      role: 'assignee',
      clientMutationId: crypto.randomUUID(),
    });
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    for (const id of createdUserIds) {
      await db().delete(users).where(dbMod.eq(users.id, id));
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.initiate — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────

  describe('initiate (Faz 11B)', () => {
    it('board admin (workspace owner) can initiate; returns presigned PUT + draft row', async () => {
      const storage = fakeObjectStorage();
      const result = await callerFor(ownerId, { objectStorage: storage }).attachment.initiate({
        cardId,
        fileName: 'admin-rapor.pdf',
        mimeType: 'application/pdf',
        size: 2_000,
        clientMutationId: crypto.randomUUID(),
      });
      expect(result.attachmentId).toEqual(expect.any(String));
      expect(result.upload.url).toBe('https://storage.test/put');
      const [row] = await db()
        .select()
        .from(attachments)
        .where(dbMod.eq(attachments.id, result.attachmentId));
      expect(row).toMatchObject({ uploaderId: ownerId, committedAt: null });
    });

    it('member can initiate; returns presigned PUT + draft row (committed_at IS NULL)', async () => {
      const storage = fakeObjectStorage();
      const result = await callerFor(memberId, { objectStorage: storage }).attachment.initiate({
        cardId,
        fileName: 'Rapor 1.pdf',
        mimeType: 'application/pdf',
        size: 5_000,
        clientMutationId: crypto.randomUUID(),
      });

      expect(result.attachmentId).toEqual(expect.any(String));
      expect(result.upload).toEqual({
        url: 'https://storage.test/put',
        headers: { 'content-type': 'application/pdf', 'content-length': '5000' },
      });
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

      const [row] = await db()
        .select()
        .from(attachments)
        .where(dbMod.eq(attachments.id, result.attachmentId));
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        cardId,
        boardId,
        uploaderId: memberId,
        fileName: 'Rapor 1.pdf',
        mimeType: 'application/pdf',
        size: 5_000,
        description: null,
        committedAt: null,
      });
      expect(row?.storageKey).toMatch(
        new RegExp(`^boards/${boardId}/cards/${cardId}/[0-9a-f-]+-Rapor-1\\.pdf$`),
      );
      expect(storage.createPresignedPutUrl).toHaveBeenCalledWith({
        key: row?.storageKey,
        contentType: 'application/pdf',
        contentLength: 5_000,
      });
    });

    it('storage key is unguessable: UUID4 prefix + sanitised fileName, unique per call', async () => {
      // Faz 11E: storage_key formatı `boards/{boardId}/cards/{cardId}/{uuid}-{safe}`.
      // UUID4 prefix saldırı yüzeyini kapatır — iki çağrı aynı dosya adıyla bile
      // farklı (tahmin edilemez) key üretir. fileName sanitize edilir:
      // allowlist dışı karakterler (`/`, boşluk, `$`) `-` olur — `/` segment
      // ayracı olarak sızamaz, dolayısıyla `{cardId}` dizininden taşma yok.
      const uuid4 =
        '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
      const prefix = `boards/${boardId}/cards/${cardId}/`;
      const first = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'Tehlikeli  Ad/sub/$.pdf',
        mimeType: 'application/pdf',
        size: 100,
        clientMutationId: crypto.randomUUID(),
      });
      const second = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'Tehlikeli  Ad/sub/$.pdf',
        mimeType: 'application/pdf',
        size: 100,
        clientMutationId: crypto.randomUUID(),
      });
      const rows = await db()
        .select({ id: attachments.id, storageKey: attachments.storageKey })
        .from(attachments)
        .where(
          dbMod.or(
            dbMod.eq(attachments.id, first.attachmentId),
            dbMod.eq(attachments.id, second.attachmentId),
          ),
        );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        // Key card-scoped prefix ile başlar, ardından UUID4 + tek `-` + safe ad.
        expect(row.storageKey.startsWith(prefix)).toBe(true);
        const tail = row.storageKey.slice(prefix.length);
        expect(tail).toMatch(new RegExp(`^${uuid4}-Tehlikeli-Ad-sub-.pdf$`));
        // Sanitize edilmiş kuyrukta `/` segment ayracı YOK — kart dizininden
        // taşma engellendi (tahmin edilemezlik + izolasyon).
        expect(tail).not.toContain('/');
      }
      // İki ardışık çağrı farklı (rastgele) key üretir — tahmin edilemez.
      expect(rows[0]!.storageKey).not.toBe(rows[1]!.storageKey);
    });

    it('fileName of only non-ASCII chars falls back to a safe "attachment" key segment', async () => {
      // `safeStorageFileName` boş kalırsa `attachment` fallback'i kullanır —
      // sanitize sonrası hiçbir izinli karakter kalmayan ad (salt emoji / CJK,
      // uzantısız) key'i kırmamalı. fileName satırda ham haliyle korunur.
      const rawName = '日本語あ😀漢字';
      const result = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: rawName,
        mimeType: 'image/png',
        size: 256,
        clientMutationId: crypto.randomUUID(),
      });
      const [row] = await db()
        .select({ storageKey: attachments.storageKey, fileName: attachments.fileName })
        .from(attachments)
        .where(dbMod.eq(attachments.id, result.attachmentId));
      expect(row?.storageKey).toMatch(
        new RegExp(`^boards/${boardId}/cards/${cardId}/[0-9a-f-]+-attachment$`),
      );
      // Original (display) name preserved verbatim on the row.
      expect(row?.fileName).toBe(rawName);
    });

    it('description is trimmed; whitespace-only becomes NULL', async () => {
      const result = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        size: 100,
        description: '   ',
        clientMutationId: crypto.randomUUID(),
      });
      const [row] = await db()
        .select({ description: attachments.description })
        .from(attachments)
        .where(dbMod.eq(attachments.id, result.attachmentId));
      expect(row?.description).toBeNull();

      const result2 = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'b.pdf',
        mimeType: 'application/pdf',
        size: 100,
        description: '  proje teklif notlari  ',
        clientMutationId: crypto.randomUUID(),
      });
      const [row2] = await db()
        .select({ description: attachments.description })
        .from(attachments)
        .where(dbMod.eq(attachments.id, result2.attachmentId));
      expect(row2?.description).toBe('proje teklif notlari');
    });

    it('viewer cannot initiate (FORBIDDEN)', async () => {
      await expect(
        callerFor(viewerId).attachment.initiate({
          cardId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('non-member cannot initiate (NOT_FOUND from cardProcedure board-access gate)', async () => {
      await expect(
        callerFor(outsiderId).attachment.initiate({
          cardId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
    });

    it('archived board rejects initiate (BAD_REQUEST)', async () => {
      const tempBoard = await callerFor(ownerId).board.create({
        workspaceId,
        title: 'Archived',
        clientMutationId: crypto.randomUUID(),
      });
      const tempList = await callerFor(ownerId).list.create({
        boardId: tempBoard.id,
        title: 'L',
        clientMutationId: crypto.randomUUID(),
      });
      const tempCard = await callerFor(ownerId).card.create({
        listId: tempList.id,
        title: 'C',
        clientMutationId: crypto.randomUUID(),
      });
      // Archive the board directly (router archive sends through normal mutation
      // but we want the simplest archive path for this test).
      await db()
        .update(boards)
        .set({ archivedAt: new Date() })
        .where(dbMod.eq(boards.id, tempBoard.id));

      await expect(
        callerFor(ownerId).attachment.initiate({
          cardId: tempCard.id,
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      await db().delete(boards).where(dbMod.eq(boards.id, tempBoard.id));
    });

    it('disallowed MIME (image/svg+xml) rejected by Zod (BAD_REQUEST)', async () => {
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'x.svg',
          // @ts-expect-error intentional runtime check
          mimeType: 'image/svg+xml',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('all 8 allowlisted MIME types accepted; presigned PUT minted for each', async () => {
      // Faz 11E kabul kriteri: allowlist 8 tip OK. Router seviyesinde her
      // tipin draft satır + presigned URL ürettiğini doğrular (domain Zod
      // testinden ayrı — burada uçtan uca initiate yolunun çalıştığını teyit).
      for (const mimeType of ATTACHMENT_MIME_TYPES) {
        const storage = fakeObjectStorage();
        const result = await callerFor(memberId, { objectStorage: storage }).attachment.initiate({
          cardId,
          fileName: `allow-${mimeType.replace(/[^a-z]/gi, '')}.bin`,
          mimeType,
          size: 1_024,
          clientMutationId: crypto.randomUUID(),
        });
        expect(result.attachmentId).toEqual(expect.any(String));
        expect(storage.createPresignedPutUrl).toHaveBeenCalledOnce();
        const [row] = await db()
          .select({ mimeType: attachments.mimeType, committedAt: attachments.committedAt })
          .from(attachments)
          .where(dbMod.eq(attachments.id, result.attachmentId));
        expect(row).toMatchObject({ mimeType, committedAt: null });
      }
    });

    it('disallowed MIME (application/zip) rejected by Zod (BAD_REQUEST)', async () => {
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'archive.zip',
          // @ts-expect-error intentional runtime check — zip not in allowlist
          mimeType: 'application/zip',
          size: 1_024,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('size exactly at ATTACHMENT_MAX_BYTES (50 MiB) accepted', async () => {
      const result = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'exact-limit.pdf',
        mimeType: 'application/pdf',
        size: ATTACHMENT_MAX_BYTES,
        clientMutationId: crypto.randomUUID(),
      });
      expect(result.attachmentId).toEqual(expect.any(String));
      const [row] = await db()
        .select({ size: attachments.size })
        .from(attachments)
        .where(dbMod.eq(attachments.id, result.attachmentId));
      expect(row?.size).toBe(ATTACHMENT_MAX_BYTES);
    });

    it('oversize (ATTACHMENT_MAX_BYTES + 1) rejected', async () => {
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          size: ATTACHMENT_MAX_BYTES + 1,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('zero-size rejected', async () => {
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          size: 0,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('description > 500 chars rejected', async () => {
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          size: 100,
          description: 'a'.repeat(501),
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('does NOT write activity / realtime / notification (draft)', async () => {
      const before = await db()
        .select({ id: activityEvents.id })
        .from(activityEvents)
        .where(
          dbMod.and(
            dbMod.eq(activityEvents.cardId, cardId),
            dbMod.eq(activityEvents.type, 'attachment.added'),
          ),
        );
      await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'no-activity.pdf',
        mimeType: 'application/pdf',
        size: 100,
        clientMutationId: crypto.randomUUID(),
      });
      const after = await db()
        .select({ id: activityEvents.id })
        .from(activityEvents)
        .where(
          dbMod.and(
            dbMod.eq(activityEvents.cardId, cardId),
            dbMod.eq(activityEvents.type, 'attachment.added'),
          ),
        );
      expect(after.length).toBe(before.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.commit — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────

  describe('commit (Faz 11B)', () => {
    it('happy path: stamps committed_at, writes activity + realtime + bumps boards.version, fan-out for watcher/assignee, actor self-skip', async () => {
      const versionBefore =
        (
          await db()
            .select({ version: boards.version })
            .from(boards)
            .where(dbMod.eq(boards.id, boardId))
        )[0]?.version ?? 0;

      const initiated = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'rapor.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        description: 'q4 hedefler',
        clientMutationId: crypto.randomUUID(),
      });

      const cmid = crypto.randomUUID();
      const committed = await callerFor(memberId).attachment.commit({
        attachmentId: initiated.attachmentId,
        clientMutationId: cmid,
      });

      expect(committed).toMatchObject({
        id: initiated.attachmentId,
        fileName: 'rapor.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        kind: 'pdf',
        description: 'q4 hedefler',
        uploader: { id: memberId },
        isCover: false,
      });
      expect(committed.committedAt).toBeInstanceOf(Date);

      // Row committed_at IS NOT NULL.
      const [row] = await db()
        .select({ committedAt: attachments.committedAt })
        .from(attachments)
        .where(dbMod.eq(attachments.id, initiated.attachmentId));
      expect(row?.committedAt).toBeInstanceOf(Date);

      // boards.version bumped.
      const versionAfter =
        (
          await db()
            .select({ version: boards.version })
            .from(boards)
            .where(dbMod.eq(boards.id, boardId))
        )[0]?.version ?? 0;
      expect(versionAfter).toBeGreaterThan(versionBefore);

      // activity_events written.
      const acts = await db()
        .select()
        .from(activityEvents)
        .where(
          dbMod.and(
            dbMod.eq(activityEvents.cardId, cardId),
            dbMod.eq(activityEvents.type, 'attachment.added'),
          ),
        );
      const myAct = acts.find(
        (a) =>
          (a.payload as Record<string, unknown>).attachmentId === initiated.attachmentId,
      );
      expect(myAct).toBeDefined();
      expect(myAct?.payload).toMatchObject({
        attachmentId: initiated.attachmentId,
        fileName: 'rapor.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        hasDescription: true,
        clientMutationId: cmid,
      });

      // realtime_events row written with seq + clientMutationId.
      const rt = await db()
        .select()
        .from(realtimeEvents)
        .where(
          dbMod.and(
            dbMod.eq(realtimeEvents.cardId, cardId),
            dbMod.eq(realtimeEvents.type, 'attachment.added'),
          ),
        );
      const myRt = rt.find((r) => {
        const payload = r.payload as { data?: { attachmentId?: string } };
        return payload.data?.attachmentId === initiated.attachmentId;
      });
      expect(myRt).toBeDefined();
      expect(myRt?.clientMutationId).toBe(cmid);

      // notification_outbox fan-out for watcher + assignee; actor (memberId) skipped.
      const outbox = await db()
        .select()
        .from(notificationOutbox)
        .where(dbMod.eq(notificationOutbox.eventId, myAct!.id));
      const recipients = new Set(outbox.map((r) => r.recipientId));
      expect(recipients.has(watcherId)).toBe(true);
      expect(recipients.has(assigneeId)).toBe(true);
      expect(recipients.has(memberId)).toBe(false);
      // Channels include in_app + push for `attachment.added` (push opt-in default).
      const watcherChannels = outbox
        .filter((r) => r.recipientId === watcherId)
        .map((r) => r.channel)
        .sort();
      expect(watcherChannels).toEqual(['in_app', 'push']);
    });

    it('idempotent: a second commit on the same attachmentId is a no-op (single activity row)', async () => {
      const initiated = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'idempotent.pdf',
        mimeType: 'application/pdf',
        size: 999,
        clientMutationId: crypto.randomUUID(),
      });

      const first = await callerFor(memberId).attachment.commit({
        attachmentId: initiated.attachmentId,
        clientMutationId: crypto.randomUUID(),
      });

      // Snapshot side-effect counts after the FIRST commit — the second commit
      // must not move any of them (no duplicate activity / realtime / outbox).
      const countActivities = async () => {
        const acts = await db()
          .select({ payload: activityEvents.payload })
          .from(activityEvents)
          .where(
            dbMod.and(
              dbMod.eq(activityEvents.cardId, cardId),
              dbMod.eq(activityEvents.type, 'attachment.added'),
            ),
          );
        return acts.filter(
          (a) => (a.payload as Record<string, unknown>).attachmentId === initiated.attachmentId,
        ).length;
      };
      const countRealtime = async () => {
        const rt = await db()
          .select({ payload: realtimeEvents.payload })
          .from(realtimeEvents)
          .where(
            dbMod.and(
              dbMod.eq(realtimeEvents.cardId, cardId),
              dbMod.eq(realtimeEvents.type, 'attachment.added'),
            ),
          );
        return rt.filter((r) => {
          const payload = r.payload as { data?: { attachmentId?: string } };
          return payload.data?.attachmentId === initiated.attachmentId;
        }).length;
      };
      // `event_id` is the activity row id — outbox tied to this attachment's
      // first (and only) activity event.
      const myActivityId = (
        await db()
          .select({ id: activityEvents.id, payload: activityEvents.payload })
          .from(activityEvents)
          .where(
            dbMod.and(
              dbMod.eq(activityEvents.cardId, cardId),
              dbMod.eq(activityEvents.type, 'attachment.added'),
            ),
          )
      ).find(
        (a) => (a.payload as Record<string, unknown>).attachmentId === initiated.attachmentId,
      )?.id;
      const countOutbox = async () =>
        myActivityId === undefined
          ? 0
          : (
              await db()
                .select({ id: notificationOutbox.id })
                .from(notificationOutbox)
                .where(dbMod.eq(notificationOutbox.eventId, myActivityId))
            ).length;

      const actsAfterFirst = await countActivities();
      const rtAfterFirst = await countRealtime();
      const outboxAfterFirst = await countOutbox();
      // First commit emits exactly one activity + one realtime envelope.
      expect(actsAfterFirst).toBe(1);
      expect(rtAfterFirst).toBe(1);

      const second = await callerFor(memberId).attachment.commit({
        attachmentId: initiated.attachmentId,
        clientMutationId: crypto.randomUUID(),
      });
      expect(second.id).toBe(first.id);
      expect(second.committedAt?.getTime()).toBe(first.committedAt?.getTime());

      // Second commit is a true no-op — every side-effect count is unchanged.
      // (Outbox count is asserted as *stable*, not a fixed number: the 60 s
      // cooldown in `insertNotificationOutbox` may suppress rows depending on
      // earlier suites — idempotency is "no NEW rows", whatever the baseline.)
      expect(await countActivities()).toBe(actsAfterFirst);
      expect(await countRealtime()).toBe(rtAfterFirst);
      expect(await countOutbox()).toBe(outboxAfterFirst);
    });

    it('non-uploader cannot commit (FORBIDDEN)', async () => {
      const initiated = await callerFor(memberId).attachment.initiate({
        cardId,
        fileName: 'priv.pdf',
        mimeType: 'application/pdf',
        size: 100,
        clientMutationId: crypto.randomUUID(),
      });
      await expect(
        callerFor(member2Id).attachment.commit({
          attachmentId: initiated.attachmentId,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('unknown attachmentId → NOT_FOUND', async () => {
      await expect(
        callerFor(memberId).attachment.commit({
          attachmentId: 'att_nonexistent',
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.list — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────

  describe('list (Faz 11B)', () => {
    it('viewer can list (board access); drafts excluded; DESC by committedAt; isCover flag; uploader join', async () => {
      // Seed: 2 committed (one set as cover), 1 draft.
      const [a1] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/list-a.png`,
          fileName: 'list-a.png',
          mimeType: 'image/png',
          size: 100,
          committedAt: new Date(Date.now() - 60_000),
        })
        .returning();
      const [a2] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/list-b.pdf`,
          fileName: 'list-b.pdf',
          mimeType: 'application/pdf',
          size: 200,
          committedAt: new Date(),
        })
        .returning();
      const [a3draft] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/list-draft.png`,
          fileName: 'list-draft.png',
          mimeType: 'image/png',
          size: 50,
          committedAt: null,
        })
        .returning();
      // Set a1 as cover.
      await db()
        .update(cards)
        .set({ coverImageAttachmentId: a1!.id })
        .where(dbMod.eq(cards.id, cardId));

      const items = await callerFor(viewerId).attachment.list({ cardId });
      const myItems = items.filter((i) => i.id === a1!.id || i.id === a2!.id || i.id === a3draft!.id);
      // Draft excluded.
      expect(myItems.find((i) => i.id === a3draft!.id)).toBeUndefined();
      // Two committed in DESC committedAt order.
      const ids = myItems.map((i) => i.id);
      const idxA2 = ids.indexOf(a2!.id);
      const idxA1 = ids.indexOf(a1!.id);
      expect(idxA2).toBeGreaterThanOrEqual(0);
      expect(idxA1).toBeGreaterThan(idxA2);
      // isCover flag.
      const item1 = myItems.find((i) => i.id === a1!.id)!;
      const item2 = myItems.find((i) => i.id === a2!.id)!;
      expect(item1.isCover).toBe(true);
      expect(item2.isCover).toBe(false);
      // kind derived from mime.
      expect(item1.kind).toBe('image');
      expect(item2.kind).toBe('pdf');
      // uploader join carries name + image (no email).
      expect(item1.uploader).toMatchObject({ id: memberId });
      expect(item1.uploader).not.toHaveProperty('email');

      // Cleanup cover ref for downstream tests.
      await db()
        .update(cards)
        .set({ coverImageAttachmentId: null })
        .where(dbMod.eq(cards.id, cardId));
    });

    it('outsider cannot list', async () => {
      await expect(
        callerFor(outsiderId).attachment.list({ cardId }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
    });

    // ── thumbnailUrl (list image preview, MVP full-image presigned) ──────
    it('returns a presigned thumbnailUrl for image rows and null for non-image rows', async () => {
      const [img] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/thumb-image.png`,
          fileName: 'thumb-image.png',
          mimeType: 'image/png',
          size: 123,
          committedAt: new Date(),
        })
        .returning();
      const [doc] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/thumb-doc.pdf`,
          fileName: 'thumb-doc.pdf',
          mimeType: 'application/pdf',
          size: 456,
          committedAt: new Date(),
        })
        .returning();

      const storage = fakeObjectStorage();
      const items = await callerFor(viewerId, { objectStorage: storage }).attachment.list({ cardId });
      const imgItem = items.find((i) => i.id === img!.id)!;
      const docItem = items.find((i) => i.id === doc!.id)!;

      // Image row carries a presigned GET URL (TTL 1 saat).
      expect(imgItem.thumbnailUrl).toBe('https://storage.test/get');
      expect(storage.createPresignedGetUrl).toHaveBeenCalledWith({
        key: `boards/${boardId}/cards/${cardId}/thumb-image.png`,
        expiresIn: 3600,
      });
      // Non-image row never gets a presigned URL.
      expect(docItem.thumbnailUrl).toBeNull();
      expect(storage.createPresignedGetUrl).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: `boards/${boardId}/cards/${cardId}/thumb-doc.pdf` }),
      );

      // Cleanup.
      await db()
        .delete(attachments)
        .where(dbMod.inArray(attachments.id, [img!.id, doc!.id]));
    });

    it('thumbnailUrl is null for all rows when objectStorage is not configured (graceful)', async () => {
      const [img] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/thumb-nostorage.png`,
          fileName: 'thumb-nostorage.png',
          mimeType: 'image/png',
          size: 789,
          committedAt: new Date(),
        })
        .returning();

      const items = await callerFor(viewerId, {
        objectStorage: null,
      }).attachment.list({ cardId });
      const imgItem = items.find((i) => i.id === img!.id)!;
      expect(imgItem.thumbnailUrl).toBeNull();

      // Cleanup.
      await db().delete(attachments).where(dbMod.eq(attachments.id, img!.id));
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.update — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────

  describe('update (Faz 11B)', () => {
    async function seedCommitted(uploader = memberId, description: string | null = null) {
      const [row] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: uploader,
          storageKey: `boards/${boardId}/cards/${cardId}/${crypto.randomUUID()}-u.pdf`,
          fileName: 'u.pdf',
          mimeType: 'application/pdf',
          size: 100,
          description,
          committedAt: new Date(),
        })
        .returning();
      return row!;
    }

    it('uploader can edit description; activity NOT written', async () => {
      const row = await seedCommitted();
      const before = await db()
        .select({ id: activityEvents.id })
        .from(activityEvents)
        .where(dbMod.eq(activityEvents.cardId, cardId));
      const res = await callerFor(memberId).attachment.update({
        attachmentId: row.id,
        description: 'yeni aciklama',
        clientMutationId: crypto.randomUUID(),
      });
      expect(res.description).toBe('yeni aciklama');
      const after = await db()
        .select({ id: activityEvents.id })
        .from(activityEvents)
        .where(dbMod.eq(activityEvents.cardId, cardId));
      expect(after.length).toBe(before.length);
    });

    it('board admin (non-uploader) can edit description', async () => {
      const row = await seedCommitted(memberId);
      const res = await callerFor(ownerId).attachment.update({
        attachmentId: row.id,
        description: 'admin guncelledi',
        clientMutationId: crypto.randomUUID(),
      });
      expect(res.description).toBe('admin guncelledi');
    });

    it('whitespace description normalises to null', async () => {
      const row = await seedCommitted(memberId, 'eski');
      const res = await callerFor(memberId).attachment.update({
        attachmentId: row.id,
        description: '   ',
        clientMutationId: crypto.randomUUID(),
      });
      expect(res.description).toBeNull();
    });

    it('non-uploader regular member cannot edit (FORBIDDEN)', async () => {
      const row = await seedCommitted(memberId);
      await expect(
        callerFor(member2Id).attachment.update({
          attachmentId: row.id,
          description: 'denedim',
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('viewer cannot edit (FORBIDDEN)', async () => {
      const row = await seedCommitted(memberId);
      await expect(
        callerFor(viewerId).attachment.update({
          attachmentId: row.id,
          description: 'denedim',
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('draft attachment update rejected (BAD_REQUEST)', async () => {
      const [draft] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/${crypto.randomUUID()}-d.pdf`,
          fileName: 'd.pdf',
          mimeType: 'application/pdf',
          size: 50,
          committedAt: null,
        })
        .returning();
      await expect(
        callerFor(memberId).attachment.update({
          attachmentId: draft!.id,
          description: 'taslakta yazamam',
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.delete — Faz 11B (DEM-148)
  // ─────────────────────────────────────────────────────────────────────

  describe('delete (Faz 11B)', () => {
    async function seedCommittedForDelete(uploader = memberId) {
      const [row] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: uploader,
          storageKey: `boards/${boardId}/cards/${cardId}/${crypto.randomUUID()}-del.pdf`,
          fileName: 'del.pdf',
          mimeType: 'application/pdf',
          size: 100,
          committedAt: new Date(),
        })
        .returning();
      return row!;
    }

    it('uploader can delete; tx writes activity + realtime + bumps version; enqueueAttachmentCleanup called post-tx', async () => {
      const row = await seedCommittedForDelete(memberId);
      const enqueue = vi.fn();
      const vBefore =
        (
          await db()
            .select({ version: boards.version })
            .from(boards)
            .where(dbMod.eq(boards.id, boardId))
        )[0]?.version ?? 0;

      const res = await callerFor(memberId, { enqueueAttachmentCleanup: enqueue }).attachment.delete({
        attachmentId: row.id,
        clientMutationId: crypto.randomUUID(),
      });
      expect(res).toEqual({ id: row.id, ok: true });

      // Row gone.
      const gone = await db()
        .select()
        .from(attachments)
        .where(dbMod.eq(attachments.id, row.id));
      expect(gone).toHaveLength(0);

      // Activity + realtime + version bumped.
      const acts = await db()
        .select()
        .from(activityEvents)
        .where(
          dbMod.and(
            dbMod.eq(activityEvents.cardId, cardId),
            dbMod.eq(activityEvents.type, 'attachment.removed'),
          ),
        );
      // Exactly one `attachment.removed` activity for this attachment.
      const myActs = acts.filter(
        (a) => (a.payload as Record<string, unknown>).attachmentId === row.id,
      );
      expect(myActs).toHaveLength(1);
      expect(myActs[0]?.payload).toMatchObject({ attachmentId: row.id, fileName: 'del.pdf' });
      const rt = await db()
        .select()
        .from(realtimeEvents)
        .where(
          dbMod.and(
            dbMod.eq(realtimeEvents.cardId, cardId),
            dbMod.eq(realtimeEvents.type, 'attachment.removed'),
          ),
        );
      // Exactly one realtime envelope for this attachment.
      const myRt = rt.filter((r) => {
        const payload = r.payload as { data?: { attachmentId?: string } };
        return payload.data?.attachmentId === row.id;
      });
      expect(myRt).toHaveLength(1);
      // DEM-153 — `attachment.removed` artık `attachment_removed` bildirim
      // tipine route edilir; kart watcher'larına in-app outbox satırı yazılır
      // (actor self-skip). Üretilen tüm satırlar bu tipte olmalı.
      const removedOutbox = await db()
        .select({ id: notificationOutbox.id, type: notificationOutbox.type })
        .from(notificationOutbox)
        .where(dbMod.eq(notificationOutbox.eventId, myActs[0]!.id));
      expect(removedOutbox.every((r) => r.type === 'attachment_removed')).toBe(true);
      const vAfter =
        (
          await db()
            .select({ version: boards.version })
            .from(boards)
            .where(dbMod.eq(boards.id, boardId))
        )[0]?.version ?? 0;
      expect(vAfter).toBeGreaterThan(vBefore);

      // Cleanup hook fired with storageKey + attachmentId.
      expect(enqueue).toHaveBeenCalledWith({
        attachmentId: row.id,
        storageKey: row.storageKey,
      });
    });

    it('board admin can delete a row uploaded by someone else', async () => {
      const row = await seedCommittedForDelete(memberId);
      await callerFor(ownerId).attachment.delete({
        attachmentId: row.id,
        clientMutationId: crypto.randomUUID(),
      });
      const gone = await db().select().from(attachments).where(dbMod.eq(attachments.id, row.id));
      expect(gone).toHaveLength(0);
    });

    it('non-uploader member cannot delete (FORBIDDEN)', async () => {
      const row = await seedCommittedForDelete(memberId);
      await expect(
        callerFor(member2Id).attachment.delete({
          attachmentId: row.id,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('viewer cannot delete (FORBIDDEN)', async () => {
      const row = await seedCommittedForDelete(memberId);
      await expect(
        callerFor(viewerId).attachment.delete({
          attachmentId: row.id,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cover_image_attachment_id is set to NULL when the cover attachment is deleted', async () => {
      const row = await seedCommittedForDelete(memberId);
      await db()
        .update(cards)
        .set({ coverImageAttachmentId: row.id })
        .where(dbMod.eq(cards.id, cardId));

      await callerFor(memberId).attachment.delete({
        attachmentId: row.id,
        clientMutationId: crypto.randomUUID(),
      });

      const [card] = await db()
        .select({ coverImageAttachmentId: cards.coverImageAttachmentId })
        .from(cards)
        .where(dbMod.eq(cards.id, cardId));
      expect(card?.coverImageAttachmentId).toBeNull();
    });

    it('unknown attachmentId → NOT_FOUND', async () => {
      await expect(
        callerFor(memberId).attachment.delete({
          attachmentId: 'att_nonexistent',
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // DEM-110 legacy: getDownloadUrl — kept after createUpload removal.
  // ─────────────────────────────────────────────────────────────────────

  describe('getDownloadUrl (DEM-110 legacy)', () => {
    it('board viewers can read attachment URLs; outsiders cannot', async () => {
      // Seed a committed attachment directly (no `createUpload` any more).
      const [row] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/${crypto.randomUUID()}-cover.webp`,
          fileName: 'cover.webp',
          mimeType: 'image/webp',
          size: 4096,
          committedAt: new Date(),
        })
        .returning();

      const storage = fakeObjectStorage();
      await expect(
        callerFor(viewerId, { objectStorage: storage }).attachment.getDownloadUrl({
          attachmentId: row!.id,
        }),
      ).resolves.toEqual({ url: 'https://storage.test/get' });

      await expect(
        callerFor(outsiderId).attachment.getDownloadUrl({ attachmentId: row!.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('draft attachment (committed_at IS NULL) getDownloadUrl → NOT_FOUND (security M4)', async () => {
      // A presigned GET must never be issued for an uncommitted draft row —
      // the object may not exist yet and the row is invisible to `list`.
      const [draft] = await db()
        .insert(attachments)
        .values({
          cardId,
          boardId,
          uploaderId: memberId,
          storageKey: `boards/${boardId}/cards/${cardId}/${crypto.randomUUID()}-draft-dl.png`,
          fileName: 'draft-dl.png',
          mimeType: 'image/png',
          size: 100,
          committedAt: null,
        })
        .returning();
      await expect(
        callerFor(memberId).attachment.getDownloadUrl({ attachmentId: draft!.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // attachment.initiate rate limit — Faz 11B (DEM-148 / security H2)
  // ─────────────────────────────────────────────────────────────────────
  // Kept LAST: `initiateRateState` is module-level. The test clears it in
  // `beforeEach` so earlier suites' initiate calls don't bleed into the cap.

  describe('initiate rate limit (security H2)', () => {
    beforeEach(() => {
      initiateRateState.clear();
    });

    it('21st initiate within the window for the same user → TOO_MANY_REQUESTS', async () => {
      // First 20 calls succeed (the per-user cap is 20 / 60 s).
      for (let i = 0; i < 20; i += 1) {
        await callerFor(memberId).attachment.initiate({
          cardId,
          fileName: `rl-${i}.pdf`,
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        });
      }
      await expect(
        callerFor(memberId).attachment.initiate({
          cardId,
          fileName: 'rl-overflow.pdf',
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('rate limit is per-user: a second user is unaffected by the first user hitting the cap', async () => {
      for (let i = 0; i < 20; i += 1) {
        await callerFor(memberId).attachment.initiate({
          cardId,
          fileName: `rl2-${i}.pdf`,
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        });
      }
      // member2Id has its own bucket — still under the cap.
      await expect(
        callerFor(member2Id).attachment.initiate({
          cardId,
          fileName: 'rl2-other.pdf',
          mimeType: 'application/pdf',
          size: 100,
          clientMutationId: crypto.randomUUID(),
        }),
      ).resolves.toMatchObject({ attachmentId: expect.any(String) });
    });
  });
});
