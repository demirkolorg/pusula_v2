/**
 * Push-tokens router — Faz 6B (DEM-91) + Faz 10B (DEM-136). Procedures the
 * mobile client (Faz 7) and the bildirim ayar ekranı (Faz 10E) drive:
 *
 *  - `tokens.register` — store the token (or reactivate it if a previous
 *    revoke is on file). Idempotent: re-registering the same token bumps
 *    `last_used_at` and clears `revoked_at` (a previous logout) without
 *    inserting a duplicate row. The `(token)` `UNIQUE` index makes this an
 *    `ON CONFLICT (token) DO UPDATE` (push tokens are globally unique — Expo
 *    never reissues the same string to a different device).
 *
 *  - `tokens.revoke` — mark a token revoked (`revoked_at = NOW()`). We
 *    deliberately do **not** `DELETE` the row: keeping it lets the audit
 *    trail tell "this token used to belong to user X" if a re-register
 *    comes in later. Scoped to the caller's own tokens — a stray revoke for
 *    someone else's token is a silent no-op (no `NOT_FOUND` so we don't leak
 *    whether a token exists for a different user).
 *
 *  - `tokens.list` — Faz 10B: the bildirim ayar ekranı "Cihazlar" section
 *    surfaces the caller's active devices. Revoked tokens are hidden so the
 *    UI does not have to filter them out client-side. The full token string
 *    is **never** returned (audit / privacy); only the metadata the user
 *    needs to identify the device.
 *
 *  - `tokens.revokeById` — Faz 10E: the bildirim ayar ekranı "Cihazlar" UI
 *    revokes a device by row `id`. The web client does not have the raw
 *    token string (see `list` above), so the token-keyed `revoke` is the
 *    wrong endpoint for it; mobile clients keep using `revoke({ token })`
 *    during their logout flow. Same idempotency + ownership rules: re-revoke
 *    is a no-op, a stray id for someone else's token is silently ignored.
 *
 * Token format (`ExponentPushToken[xxx]` / legacy `ExpoPushToken[xxx]`) is
 * re-validated server-side via the Zod schema in `@pusula/domain` — a
 * misconfigured or malicious client cannot park junk in the table the
 * worker (`apps/worker/src/jobs/notification-push.ts`) would later fail on.
 *
 * Faz 6 ships the *backend*; the mobile app that actually calls these lands
 * in Faz 7 (DEM-30). Until then the worker's push processor will see an
 * empty `push_tokens` set for every user → no-op + warn log.
 *
 * See `docs/architecture/03-backend.md` "Faz 6 — Notification & push
 * procedure'leri" and `docs/architecture/06-bildirim-altyapisi.md`
 * "Push kanalı (Expo, Faz 6B)".
 */
import { and, desc, eq, isNull, sql } from '@pusula/db';
import { pushTokens } from '@pusula/db';
import {
  registerPushTokenInput,
  revokePushTokenByIdInput,
  revokePushTokenInput,
} from '@pusula/domain';
import { protectedProcedure, router } from '../trpc';

export const pushRouter = router({
  tokens: router({
    /**
     * Register (or reactivate) a push token for the caller's account.
     *
     * Returns `{ registered: true, tokenId: string }`. The mobile client
     * only needs to know the call succeeded; `tokenId` is exposed for
     * tests + future telemetry. Whether the row was freshly inserted vs.
     * reactivated is not surfaced — `RETURNING` can't observe the prior
     * `revoked_at` inside a single `ON CONFLICT DO UPDATE`, and the
     * caller's mobile client doesn't branch on the distinction.
     *
     * `ON CONFLICT (token)` covers both the same-user re-register
     * (`last_used_at` refresh) and the cross-user reassign (Expo gave the
     * token to a new user) — in both cases `user_id` is updated to the
     * caller, `revoked_at` cleared, and `last_used_at` stamped.
     */
    register: protectedProcedure.input(registerPushTokenInput).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const [row] = await ctx.db
        .insert(pushTokens)
        .values({
          userId,
          token: input.token,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          lastUsedAt: now,
        })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: {
            userId,
            platform: input.platform,
            deviceName: input.deviceName ?? null,
            lastUsedAt: now,
            // Bring the row back if it had been revoked (logout or
            // DeviceNotRegistered). `null` is the active state.
            revokedAt: null,
          },
        })
        .returning({ id: pushTokens.id, revokedAt: pushTokens.revokedAt });
      if (!row) {
        // `RETURNING` always emits a row for INSERT ... ON CONFLICT DO UPDATE
        // in Postgres; the empty case is a logic bug, not user input.
        throw new Error('push_tokens insert returned no row');
      }
      // We deliberately surface `tokenId` only — see the doc-comment above.
      // Tests verify the read-back state (`revoked_at = null`, ownership
      // transfer on cross-user reassign) directly against the table.
      return { registered: true as const, tokenId: row.id };
    }),

    /**
     * Revoke a token for the caller's account. Idempotent: already-revoked
     * tokens stay revoked (we don't bump `revoked_at`); tokens that aren't
     * the caller's are silently ignored (no info leak).
     *
     * Returns `{ revoked: boolean }` — `true` when this call flipped a
     * row, `false` when there was nothing to do (already revoked /
     * unknown token / belongs to someone else). The mobile client doesn't
     * branch on the difference; the boolean is only there for tests +
     * future telemetry.
     */
    revoke: protectedProcedure.input(revokePushTokenInput).mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const updated = await ctx.db
        .update(pushTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(pushTokens.token, input.token),
            eq(pushTokens.userId, userId),
            // Only flip rows that are still active — re-revoking is a
            // no-op so a buggy client can't keep bumping `revoked_at`.
            sql`${pushTokens.revokedAt} IS NULL`,
          ),
        )
        .returning({ id: pushTokens.id });
      return { revoked: updated.length > 0 };
    }),

    /**
     * Active push tokens registered to the caller (Faz 10B — DEM-136). The
     * bildirim ayar ekranı "Cihazlar" section lists them so the user can
     * see which devices receive push and revoke individual tokens (logout
     * on a stale device). Revoked rows are excluded — the audit row stays
     * in DB but the UI only sees live devices.
     *
     * Sort order matches what a human expects: most-recently-used first,
     * falling back to `created_at` for tokens that never got a `last_used`
     * stamp (a freshly registered device before the first push arrives).
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.db
        .select({
          id: pushTokens.id,
          platform: pushTokens.platform,
          deviceName: pushTokens.deviceName,
          lastUsedAt: pushTokens.lastUsedAt,
          createdAt: pushTokens.createdAt,
        })
        .from(pushTokens)
        .where(and(eq(pushTokens.userId, userId), isNull(pushTokens.revokedAt)))
        // `COALESCE(last_used_at, created_at)` keeps just-registered tokens
        // (never used → `last_used_at IS NULL`) from sinking to the bottom.
        .orderBy(desc(sql`COALESCE(${pushTokens.lastUsedAt}, ${pushTokens.createdAt})`));
      return rows;
    }),

    /**
     * Revoke a push token by its row `id` (Faz 10E — DEM-139). The bildirim
     * ayar ekranı's "Cihazlar" section needs this because `tokens.list` —
     * by design — never returns the raw token string, only the row id +
     * metadata. Same idempotency + ownership semantics as `revoke({ token })`:
     * we only flip rows that are still active and owned by the caller, so a
     * stray id for someone else's row is a silent no-op (no info leak about
     * whether the id maps to a token at all).
     *
     * Returns `{ revoked: boolean }` — `true` when this call flipped a
     * row, `false` for already-revoked / unknown / cross-user rows.
     */
    revokeById: protectedProcedure
      .input(revokePushTokenByIdInput)
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;
        const now = new Date();
        const updated = await ctx.db
          .update(pushTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(pushTokens.id, input.id),
              eq(pushTokens.userId, userId),
              // Mirror `revoke({ token })`: re-revoking is a no-op so a buggy
              // client can't keep bumping `revoked_at`.
              sql`${pushTokens.revokedAt} IS NULL`,
            ),
          )
          .returning({ id: pushTokens.id });
        return { revoked: updated.length > 0 };
      }),
  }),
});
