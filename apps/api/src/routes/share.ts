/**
 * Faz 9C (DEM-129) — kart paylaşım linki için Hono public endpoint'leri.
 * tRPC dışı; "HTTP kabuğu" işidir (`docs/architecture/03-backend.md`).
 *
 *   GET  /share/:token              → misafir kart snapshot'ı (200/404/410)
 *   POST /share/:token/comments     → misafir yorum yazımı (tek transaction:
 *                                     comments + activity_events + realtime
 *                                     outbox + notification_outbox)
 *
 * Yetki kontrolü session değil token tabanlı: token geçerli + kart aktif.
 * Token plain DB'de değil → SHA-256 hex hash karşılaştırması.
 *
 * Bkz. `docs/architecture/14-paylasim-linki-mimarisi.md` "Public endpoint
 * (Hono)" + `docs/domain/08-paylasim-linki-kurallari.md` "Misafir görme
 * yetkisi" / "Misafir yorum yapma".
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, sql } from '@pusula/db';
import {
  activityEvents,
  attachments,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  getDb,
  labels,
  shareLinks,
  users,
  workspaces,
} from '@pusula/db';
import {
  dispatchNotificationsForActivity,
  hashShareToken,
  insertRealtimeEvent,
  maybeEnqueueNotificationPublish,
  maybeEnqueueRealtimePublish,
} from '@pusula/api';
import { GUEST_AUTHOR_LABEL } from '@pusula/domain';
import { rateLimit } from '../middleware/rate-limit';
import { enqueueNotificationPublish } from '../notification-queue';
import { enqueueRealtimePublish } from '../realtime-publish-queue';

const MAX_BODY_BYTES = 10_240;

const guestCommentInput = z.object({
  body: z
    .string()
    .min(1, 'Yorum boş olamaz.')
    .max(MAX_BODY_BYTES, 'Yorum çok uzun.'),
});

type GoneReason = 'revoked' | 'expired' | 'cardArchived' | 'cardDeleted';

type LookupResult =
  | { ok: true; link: typeof shareLinks.$inferSelect; card: typeof cards.$inferSelect }
  | { ok: false; status: 404 }
  | { ok: false; status: 410; reason: GoneReason };

async function lookupShareLink(token: string): Promise<LookupResult> {
  // Token uzunluğu sabit (base64url 32 byte = 43 karakter). Brute-force token
  // enumeration entropy nedeniyle pratiksiz; geçersiz uzunluğu hash'lemeden
  // 404 dön.
  if (token.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, status: 404 };
  }
  const tokenHash = hashShareToken(token);
  const db = getDb();

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, tokenHash))
    .limit(1);
  if (!link) return { ok: false, status: 404 };

  if (link.revokedAt) return { ok: false, status: 410, reason: 'revoked' };
  if (link.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 410, reason: 'expired' };
  }

  const [card] = await db.select().from(cards).where(eq(cards.id, link.cardId)).limit(1);
  if (!card) return { ok: false, status: 410, reason: 'cardDeleted' };
  if (card.archivedAt) return { ok: false, status: 410, reason: 'cardArchived' };

  return { ok: true, link, card };
}

async function buildSnapshot(link: typeof shareLinks.$inferSelect, card: typeof cards.$inferSelect) {
  const db = getDb();

  const [board] = await db
    .select({ id: boards.id, workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, card.boardId))
    .limit(1);
  if (!board) throw new Error('Board missing');

  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, board.workspaceId))
    .limit(1);
  if (!workspace) throw new Error('Workspace missing');

  const sharedByRow = link.createdById
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, link.createdById))
        .limit(1)
    : [];
  const sharedBy = sharedByRow[0] ?? null;

  const labelRows = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(eq(cardLabels.cardId, card.id));

  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      role: cardMembers.role,
    })
    .from(cardMembers)
    .innerJoin(users, eq(users.id, cardMembers.userId))
    .where(eq(cardMembers.cardId, card.id));

  const checklistRows = await db
    .select({ id: checklists.id, title: checklists.title, position: checklists.position })
    .from(checklists)
    .where(eq(checklists.cardId, card.id))
    .orderBy(asc(checklists.position));
  const checklistIds = checklistRows.map((row) => row.id);
  const itemsByChecklist = new Map<
    string,
    Array<{ id: string; content: string; completed: boolean; position: string }>
  >();
  if (checklistIds.length > 0) {
    const itemRows = await db
      .select({
        id: checklistItems.id,
        checklistId: checklistItems.checklistId,
        content: checklistItems.content,
        completed: checklistItems.completed,
        position: checklistItems.position,
      })
      .from(checklistItems)
      .where(inArray(checklistItems.checklistId, checklistIds))
      .orderBy(asc(checklistItems.position));
    for (const item of itemRows) {
      const bucket = itemsByChecklist.get(item.checklistId) ?? [];
      bucket.push({
        id: item.id,
        content: item.content,
        completed: item.completed,
        position: item.position,
      });
      itemsByChecklist.set(item.checklistId, bucket);
    }
  }

  const commentRows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      authorId: comments.authorId,
      authorName: users.name,
      authorImage: users.image,
      shareLinkId: comments.shareLinkId,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.cardId, card.id), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));

  const attachmentRows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      size: attachments.size,
      storageKey: attachments.storageKey,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.cardId, card.id));

  return {
    workspace: { name: workspace.name },
    sharedBy: sharedBy ? { name: sharedBy.name } : null,
    expiresAt: link.expiresAt,
    card: {
      id: card.id,
      title: card.title,
      description: card.description,
      dueAt: card.dueAt,
      completed: card.completed,
      coverColor: card.coverColor,
      coverImageAttachmentId: card.coverImageAttachmentId,
    },
    labels: labelRows,
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      image: m.image,
      role: m.role,
    })),
    checklists: checklistRows.map((c) => ({
      id: c.id,
      title: c.title,
      items: itemsByChecklist.get(c.id) ?? [],
    })),
    comments: commentRows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      isGuest: c.authorId === null && c.shareLinkId !== null,
      authorName:
        c.authorId === null && c.shareLinkId !== null ? GUEST_AUTHOR_LABEL : c.authorName,
      authorImage: c.authorId === null ? null : c.authorImage,
    })),
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      storageKey: a.storageKey,
      createdAt: a.createdAt,
    })),
  };
}

export const shareRoute = new Hono();

// Response headers (her endpoint için): cache-control + referrer-policy.
shareRoute.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
  c.header('Referrer-Policy', 'no-referrer');
});

shareRoute.get(
  '/:token',
  rateLimit({ key: 'share-get', windowMs: 60_000, max: 60 }),
  async (c) => {
    const token = c.req.param('token');
    const result = await lookupShareLink(token);
    if (!result.ok) {
      if (result.status === 404) {
        return c.json({ error: 'Paylaşım linki bulunamadı.' }, 404);
      }
      return c.json({ error: 'gone', reason: result.reason }, 410);
    }

    // Best-effort access count + last_accessed_at. Lookup'ı bloklamaz.
    void getDb()
      .update(shareLinks)
      .set({ accessCount: sql`${shareLinks.accessCount} + 1`, lastAccessedAt: new Date() })
      .where(eq(shareLinks.id, result.link.id))
      .catch(() => undefined);

    const snapshot = await buildSnapshot(result.link, result.card);
    return c.json(snapshot, 200);
  },
);

shareRoute.post(
  '/:token/comments',
  rateLimit({
    key: 'share-post-comments',
    windowMs: 60_000,
    max: 6,
    message: 'Çok fazla yorum gönderdiniz. Lütfen 1 dakika bekleyin.',
  }),
  async (c) => {
    const token = c.req.param('token');

    // 10KB body sınırı — Content-Length pre-check (raw read 10KB+ engellenir).
    const contentLength = Number(c.req.header('content-length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      return c.json({ error: 'Yorum çok uzun (max 10KB).' }, 413);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = guestCommentInput.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Geçersiz yorum gövdesi.' }, 400);
    }

    const result = await lookupShareLink(token);
    if (!result.ok) {
      if (result.status === 404) {
        return c.json({ error: 'Paylaşım linki bulunamadı.' }, 404);
      }
      return c.json({ error: 'gone', reason: result.reason }, 410);
    }

    const db = getDb();
    const linkRow = result.link;
    const cardRow = result.card;

    const realtimeEventIds: string[] = [];
    let notificationActivityId: string | null = null;

    const inserted = await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(comments)
        .values({
          cardId: cardRow.id,
          authorId: null,
          shareLinkId: linkRow.id,
          body: parsed.data.body,
        })
        .returning({ id: comments.id, createdAt: comments.createdAt });
      if (!comment) throw new Error('Comment insert failed');

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          workspaceId: linkRow.workspaceId,
          boardId: cardRow.boardId,
          cardId: cardRow.id,
          actorId: null,
          shareLinkId: linkRow.id,
          type: 'comment.created',
          payload: {
            commentId: comment.id,
            cardId: cardRow.id,
            shareLinkId: linkRow.id,
            commentPreview: parsed.data.body.slice(0, 200),
          },
        })
        .returning({ id: activityEvents.id });
      if (!activity) throw new Error('Activity insert failed');

      // boards.version bump for realtime sequence.
      const [boardRow] = await tx
        .select({ version: boards.version })
        .from(boards)
        .where(eq(boards.id, cardRow.boardId))
        .limit(1);
      const nextVersion = (boardRow?.version ?? 0) + 1;
      await tx
        .update(boards)
        .set({ version: nextVersion })
        .where(eq(boards.id, cardRow.boardId));

      const realtimeEventId = await insertRealtimeEvent(tx, {
        type: 'comment.created',
        workspaceId: linkRow.workspaceId,
        boardId: cardRow.boardId,
        cardId: cardRow.id,
        actorId: null,
        seq: nextVersion,
        data: {
          commentId: comment.id,
          shareLinkId: linkRow.id,
          authorName: GUEST_AUTHOR_LABEL,
          bodyPreview: parsed.data.body.slice(0, 200),
          createdAt: comment.createdAt.toISOString(),
        },
      });
      realtimeEventIds.push(realtimeEventId);

      // Notification fan-out via Faz 6 helper. Misafir aktör (actorId=null) için
      // "actor self-skip" kuralı uygulanmaz; aktif kart üyeleri (assignee +
      // watcher) bildirim havuzu olur. Helper cooldown + channel fan-out'u
      // (in_app/email/push) otomatik yapar.
      const dispatched = await dispatchNotificationsForActivity(tx, {
        id: activity.id,
        type: 'comment.created',
        workspaceId: linkRow.workspaceId,
        boardId: cardRow.boardId,
        cardId: cardRow.id,
        actorId: null,
        payload: {
          commentId: comment.id,
          cardId: cardRow.id,
          shareLinkId: linkRow.id,
          commentPreview: parsed.data.body.slice(0, 200),
        },
      });
      if (dispatched.inserted > 0) notificationActivityId = activity.id;

      return comment;
    });

    // Best-effort: realtime publish + notification publish enqueue (worker
    // sweeper zaten yakalar — yine de gecikme azaltmak için tetikle). Çağrı
    // signature'ı `{ eventId }` obj.
    for (const eventId of realtimeEventIds) {
      maybeEnqueueRealtimePublish({ enqueueRealtimePublish }, eventId);
    }
    if (notificationActivityId) {
      maybeEnqueueNotificationPublish(
        { enqueueNotificationPublish },
        notificationActivityId,
      );
    }

    return c.json({ id: inserted.id, createdAt: inserted.createdAt }, 201);
  },
);
