/**
 * Board API key yönetimi — Public API + Bot Erişimi (Task 7). `board.apiKeys.*`
 * altında nested: `board.apiKeys.{list,create,revoke}`. Üçü de `boardProcedure`
 * üstünde çalışır (input `boardId` taşır; board `viewer+` görünürlüğü middleware
 * tarafından zaten enforce edilir) — procedure gövdesi ince kontrolü ekler: key
 * envanteri hassas olduğu için **üçü de board admin** ister (`canManageBoard`).
 *
 * Yetki ([`docs/domain/10-bot-ve-api-key-kurallari.md`](docs/domain/10-bot-ve-api-key-kurallari.md)):
 *  - `list`   — board `admin`. Yalnız metadata (prefix/rol/lastUsed/expiry/botName);
 *    `token_hash` ve plain token ASLA dönmez.
 *  - `create` — board `admin`. Tek transaction'da bot user (`is_bot=true`) +
 *    workspace `guest` üyeliği + board üyeliği (key rolü) + `api_keys` satırı
 *    yazılır. Plain token YALNIZ bu yanıtta bir kerelik döner (DB'ye yalnız
 *    SHA-256 hash + prefix yazılır).
 *  - `revoke` — board `admin`. `revoked_at` set + bot'un `board_members` **ve**
 *    `workspace_members` satırları silinir (key↔bot 1:1 → bot'un başka üyeliği
 *    yoktur, koşulsuz silinebilir). Bot user satırı aktivite/yorum atıfları için
 *    KALIR. Idempotent: zaten iptal edilmişse `{ ..., changed: false }`.
 *
 * Activity event ÜRETİLMEZ (karar: yalnız audit — `docs/domain/10` "bota özel
 * yeni activity event tipi açılmaz"). Key üretimi/iptali forensic kritik olduğu
 * için `share.create`/`share.revoke` emsalindeki gibi `audit_log`'a yazılır
 * (`api_key.created` / `api_key.revoked`). Realtime/notification fan-out yok.
 *
 * Token disiplini: `packages/api/src/lib/api-key-token.ts` (`psk_` + 43 char
 * base64url). Plain token/hash audit'e ASLA yazılmaz — yalnız `token_prefix`,
 * rol, expiry ve `botUserId` audit delta'sına girer.
 */
import { randomUUID } from 'node:crypto';
import {
  and,
  apiKeys,
  boardMembers,
  count,
  desc,
  eq,
  isNull,
  users,
  workspaceMembers,
} from '@pusula/db';
import {
  canManageBoard,
  createBoardApiKeyInput,
  listBoardApiKeysInput,
  MAX_ACTIVE_API_KEYS_PER_BOARD,
  revokeBoardApiKeyInput,
} from '@pusula/domain';
import { TRPCError } from '@trpc/server';
import { generateApiKeyToken } from '../lib/api-key-token';
import { appendAudit } from '../lib/audit-log';
import { accessFromBoardRole, boardProcedure } from '../middleware/board';
import { router } from '../trpc';

/** Bot bir servis hesabıdır; e-postası login için değil, yalnız `users_email_uq`
 * bütünlüğü için sentetik + unique olmalı. Key'in kendi id'sine bağlanır. */
const botEmailFor = (apiKeyId: string) => `bot+${apiKeyId}@bots.pusula.internal`;

export const boardApiKeysRouter = router({
  /**
   * Panonun API key envanteri (en yeni önce). Board `admin` only — key listesi
   * hassas (kimin hangi bota erişim verdiği). `token_hash`/plain token
   * DÖNDÜRÜLMEZ; yalnız `tokenPrefix` + metadata + bot adı. No transaction.
   */
  list: boardProcedure.input(listBoardApiKeysInput).query(async ({ ctx }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'API anahtarlarını görüntüleme yetkiniz yok.',
      });
    }

    return ctx.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        tokenPrefix: apiKeys.tokenPrefix,
        role: apiKeys.role,
        botUserId: apiKeys.botUserId,
        botName: users.name,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
        createdBy: apiKeys.createdBy,
      })
      .from(apiKeys)
      .leftJoin(users, eq(users.id, apiKeys.botUserId))
      .where(eq(apiKeys.boardId, ctx.board.id))
      .orderBy(desc(apiKeys.createdAt));
  }),

  /**
   * Yeni bir board API key'i (+ bağlı bot kullanıcısı) üret. Board `admin` only.
   * Tek transaction: bot user (`is_bot=true`, sentetik e-posta) → workspace
   * `guest` üyeliği (bu satır olmadan bot her istekte FORBIDDEN alır —
   * `resolveBoardAccess` önce workspace üyeliğini kontrol eder) → board üyeliği
   * (key rolü; `viewer` ise board rolü de `viewer`) → `api_keys` satırı. Plain
   * token YALNIZ bu yanıtta döner; DB'de yalnız SHA-256 hash + prefix. Forensic
   * audit (`api_key.created`, after: `{ tokenPrefix, role, expiresAt, botUserId }`).
   */
  create: boardProcedure.input(createBoardApiKeyInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'API anahtarı oluşturma yetkiniz yok.' });
    }

    // L4 — pano başına aktif (iptal edilmemiş) key sınırı. Her key bir bot
    // kullanıcı + üyelik satırı doğurduğundan sınırsız üretim üyelik tablolarını
    // şişirir. İptal edilen key sınırdan düşer → yeniden yer açılır.
    // `docs/domain/10-bot-ve-api-key-kurallari.md`.
    const [activeCount] = await ctx.db
      .select({ value: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.boardId, ctx.board.id), isNull(apiKeys.revokedAt)));
    if ((activeCount?.value ?? 0) >= MAX_ACTIVE_API_KEYS_PER_BOARD) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Bir pano en fazla ${MAX_ACTIVE_API_KEYS_PER_BOARD} aktif API anahtarına sahip olabilir. Yeni anahtar için önce bir anahtarı iptal edin.`,
      });
    }

    const apiKeyId = randomUUID();
    const botUserId = randomUUID();
    const { token, hash, prefix } = generateApiKeyToken();
    const expiresAt = input.expiresAt ?? null;

    const created = await ctx.db.transaction(async (tx) => {
      // (a) bot servis hesabı — login imkânsız (şifresiz, `is_bot`).
      await tx.insert(users).values({
        id: botUserId,
        name: input.name,
        email: botEmailFor(apiKeyId),
        emailVerified: false,
        isBot: true,
      });

      // (b) workspace `guest` üyeliği — kapıyı geçirir, diğer panolara erişim vermez.
      await tx.insert(workspaceMembers).values({
        workspaceId: ctx.board.workspaceId,
        userId: botUserId,
        role: 'guest',
      });

      // (c) board üyeliği — bot'un effective rolü = key rolü.
      await tx.insert(boardMembers).values({
        boardId: ctx.board.id,
        userId: botUserId,
        role: input.role,
      });

      // (d) key satırı — plain token DB'ye ASLA yazılmaz (yalnız hash + prefix).
      const [row] = await tx
        .insert(apiKeys)
        .values({
          id: apiKeyId,
          name: input.name,
          tokenHash: hash,
          tokenPrefix: prefix,
          botUserId,
          boardId: ctx.board.id,
          role: input.role,
          createdBy: ctx.session.user.id,
          expiresAt,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          tokenPrefix: apiKeys.tokenPrefix,
          role: apiKeys.role,
          botUserId: apiKeys.botUserId,
          expiresAt: apiKeys.expiresAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
          createdBy: apiKeys.createdBy,
        });
      if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await appendAudit(tx, {
        workspaceId: ctx.board.workspaceId,
        action: 'api_key.created',
        targetType: 'api_key',
        targetId: row.id,
        actorId: ctx.session.user.id,
        before: null,
        after: { tokenPrefix: prefix, role: input.role, expiresAt, botUserId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return row;
    });

    return {
      apiKey: { ...created, botName: input.name },
      // Plain token — yalnız burada, bir kerelik. Sonraki `list` yalnız prefix döner.
      token,
    };
  }),

  /**
   * Key'i iptal et. Board `admin` only. `revoked_at = now()` + bot'un
   * `board_members` ve `workspace_members` satırları silinir; bot user satırı
   * (aktivite/yorum atıfları) KALIR. Idempotent: zaten iptal edilmişse
   * `{ ..., changed: false }` (üyelikler ilk iptalde silinmiştir). Forensic
   * audit (`api_key.revoked`).
   */
  revoke: boardProcedure.input(revokeBoardApiKeyInput).mutation(async ({ ctx, input }) => {
    if (!canManageBoard(accessFromBoardRole(ctx.board.role))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'API anahtarı iptal etme yetkiniz yok.' });
    }

    const [key] = await ctx.db
      .select({
        id: apiKeys.id,
        boardId: apiKeys.boardId,
        botUserId: apiKeys.botUserId,
        tokenPrefix: apiKeys.tokenPrefix,
        role: apiKeys.role,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, input.apiKeyId))
      .limit(1);
    if (!key || key.boardId !== ctx.board.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'API anahtarı bulunamadı.' });
    }

    // Idempotent: zaten iptal edilmişse no-op. Üyelikler ilk iptalde silindi.
    if (key.revokedAt) {
      return { id: key.id, revokedAt: key.revokedAt, changed: false as const };
    }

    const now = new Date();
    const result = await ctx.db.transaction(async (tx) => {
      // `isNull` guard: iki eşzamanlı revoke'tan yalnız biri satırı günceller.
      const [updated] = await tx
        .update(apiKeys)
        .set({ revokedAt: now })
        .where(and(eq(apiKeys.id, key.id), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });
      if (!updated) return null; // race: başka istek aynı anda iptal etti.

      await tx
        .delete(boardMembers)
        .where(
          and(eq(boardMembers.boardId, ctx.board.id), eq(boardMembers.userId, key.botUserId)),
        );
      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.board.workspaceId),
            eq(workspaceMembers.userId, key.botUserId),
          ),
        );

      await appendAudit(tx, {
        workspaceId: ctx.board.workspaceId,
        action: 'api_key.revoked',
        targetType: 'api_key',
        targetId: key.id,
        actorId: ctx.session.user.id,
        before: {
          revokedAt: null,
          tokenPrefix: key.tokenPrefix,
          role: key.role,
          botUserId: key.botUserId,
        },
        after: {
          revokedAt: now,
          tokenPrefix: key.tokenPrefix,
          role: key.role,
          botUserId: key.botUserId,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return updated;
    });

    if (!result) {
      // Eşzamanlı revoke kazandı — onun durumunu idempotent yansıt.
      const [fresh] = await ctx.db
        .select({ revokedAt: apiKeys.revokedAt })
        .from(apiKeys)
        .where(eq(apiKeys.id, key.id))
        .limit(1);
      return { id: key.id, revokedAt: fresh?.revokedAt ?? now, changed: false as const };
    }

    return { id: result.id, revokedAt: now, changed: true as const };
  }),
});
