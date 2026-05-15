/**
 * Share router — Faz 9B (DEM-128). Üye yüzeyi: kart için paylaşım linki
 * oluştur / iptal et / listele. `cardProcedure` üstünde çalışır, ham `cardId`
 * input middleware tarafından çözüldüğü için board görünürlüğü zaten enforce
 * edilmiş olur; ince yetki kontrolleri (`canEditBoardContent` /
 * `canManageBoard`) procedure gövdesinde `@pusula/domain/permissions` ile
 * yapılır.
 *
 * Yetki haritası ([`docs/domain/08-paylasim-linki-kurallari.md`](`docs/domain/08-paylasim-linki-kurallari.md`)
 * "Kim oluşturabilir / iptal edebilir"):
 *  - `create` — board `member+` (`canEditBoardContent`). Viewer **reddedilir**.
 *  - `revoke` — board `admin` **veya** linkin oluşturanı.
 *  - `list`   — board `viewer+` (cardProcedure'ın garanti ettiği şey;
 *    `tokenPrefix` döndürülür, plaintext token YOK).
 *
 * Activity yazılmaz (gürültü azaltma kararı — `docs/domain/08`
 * "Yan etki & invariant'lar"); audit `share_links` kolonlarında (createdAt,
 * createdById, revokedAt, revokedById, accessCount, lastAccessedAt). Realtime
 * + notification fan-out bu router'da YOK; misafir yorum akışındaki realtime
 * + notification 9C (`apps/api/src/routes/share.ts`) Hono public endpoint'inde
 * mevcut Faz 5/6 outbox simetri ile yazılır.
 *
 * Token disiplini: plaintext token yalnız `share.create` response'unda bir
 * kerelik döner; DB'de `token_hash` (SHA-256) saklanır. Daha fazla bilgi:
 * `packages/api/src/lib/share-token.ts` + `docs/architecture/14`.
 */
import { TRPCError } from '@trpc/server';
import { desc, eq } from '@pusula/db';
import { boards, shareLinks } from '@pusula/db';
import {
  canEditBoardContent,
  canManageBoard,
  computeExpiresAt,
  shareLinkCreateInput,
  shareLinkListInput,
  shareLinkRevokeInput,
} from '@pusula/domain';
import { accessFromBoardRole } from '../middleware/board';
import { cardProcedure } from '../middleware/card';
import { generateShareToken } from '../lib/share-token';
import { router } from '../trpc';

/** Web tarafındaki `/share/[token]` SSR sayfası için base URL. Production'da
 * `PUBLIC_APP_URL` env değişkeninden okunur (örn. `https://pusula.app`); env
 * eksikse `http://localhost:3000` lokal default. */
const SHARE_APP_URL = (process.env.PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const shareRouter = router({
  /**
   * Kart için yeni paylaşım linki oluştur. Board `member+` (viewer reddedilir).
   * Token plain bir kerelik response'ta döner; DB'ye yalnız hash + prefix yazılır.
   * Arşivli board / arşivli kart için reddedilir.
   */
  create: cardProcedure.input(shareLinkCreateInput).mutation(async ({ ctx, input }) => {
    if (!canEditBoardContent(accessFromBoardRole(ctx.card.boardRole))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Paylaşım linki oluşturma yetkiniz yok.',
      });
    }
    if (ctx.card.boardArchivedAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "Arşivli board'da paylaşım linki oluşturulamaz.",
      });
    }
    if (ctx.card.archivedAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Arşivli kart için paylaşım linki oluşturulamaz.',
      });
    }

    const { token, tokenHash, tokenPrefix } = generateShareToken();
    const expiresAt = computeExpiresAt(input.expiresInDays);

    // Faz 6 disiplini: re-read board.archived_at + INSERT aynı transaction'da
    // (cardProcedure'in attached state'i ile gerçek DB durumu arasında race
    // olabilir; mutation aniden arşivlenmiş bir board'a yazmamalı).
    const created = await ctx.db.transaction(async (tx) => {
      const [boardRow] = await tx
        .select({ archivedAt: boards.archivedAt })
        .from(boards)
        .where(eq(boards.id, ctx.card.boardId))
        .limit(1);
      if (!boardRow) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Board bulunamadı.' });
      }
      if (boardRow.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "Arşivli board'da paylaşım linki oluşturulamaz.",
        });
      }

      const [row] = await tx
        .insert(shareLinks)
        .values({
          workspaceId: ctx.card.workspaceId,
          cardId: ctx.card.id,
          tokenHash,
          tokenPrefix,
          createdById: ctx.session.user.id,
          expiresAt,
        })
        .returning({ id: shareLinks.id, expiresAt: shareLinks.expiresAt });
      if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return row;
    });

    return {
      id: created.id,
      token,
      url: `${SHARE_APP_URL}/share/${token}`,
      expiresAt: created.expiresAt,
    };
  }),

  /**
   * Linki iptal et (`revoked_at = now()`). Board `admin` veya linkin oluşturanı.
   * Idempotent: zaten iptal edilmişse `{ ..., changed: false }` döner.
   */
  revoke: cardProcedure.input(shareLinkRevokeInput).mutation(async ({ ctx, input }) => {
    const [link] = await ctx.db
      .select({
        id: shareLinks.id,
        cardId: shareLinks.cardId,
        createdById: shareLinks.createdById,
        revokedAt: shareLinks.revokedAt,
      })
      .from(shareLinks)
      .where(eq(shareLinks.id, input.shareLinkId))
      .limit(1);
    if (!link || link.cardId !== ctx.card.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Paylaşım linki bulunamadı.' });
    }

    const isAdmin = canManageBoard(accessFromBoardRole(ctx.card.boardRole));
    const isCreator = link.createdById === ctx.session.user.id;
    if (!isAdmin && !isCreator) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Bu paylaşım linkini iptal etme yetkiniz yok.',
      });
    }

    if (link.revokedAt) {
      return { id: link.id, revokedAt: link.revokedAt, changed: false as const };
    }

    const now = new Date();
    const [updated] = await ctx.db
      .update(shareLinks)
      .set({ revokedAt: now, revokedById: ctx.session.user.id })
      .where(eq(shareLinks.id, link.id))
      .returning({ id: shareLinks.id });
    if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    return { id: updated.id, revokedAt: now, changed: true as const };
  }),

  /**
   * Kartın paylaşım linklerini listele (en yeni önce). Board `viewer+`
   * (cardProcedure tarafından zaten enforce edildi). Plaintext token DÖNDÜRÜLMEZ
   * — yalnız `tokenPrefix` + audit metadatası.
   */
  list: cardProcedure.input(shareLinkListInput).query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: shareLinks.id,
        tokenPrefix: shareLinks.tokenPrefix,
        createdById: shareLinks.createdById,
        createdAt: shareLinks.createdAt,
        expiresAt: shareLinks.expiresAt,
        revokedAt: shareLinks.revokedAt,
        revokedById: shareLinks.revokedById,
        accessCount: shareLinks.accessCount,
        lastAccessedAt: shareLinks.lastAccessedAt,
      })
      .from(shareLinks)
      .where(eq(shareLinks.cardId, ctx.card.id))
      .orderBy(desc(shareLinks.createdAt));
  }),
});
