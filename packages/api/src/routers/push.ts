/**
 * Push-tokens router — Faz 6B (DEM-91). Two procedures the mobile client
 * (Faz 7) drives once Expo Notifications hands it a device token:
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
import { and, eq, sql } from '@pusula/db';
import { pushTokens } from '@pusula/db';
import { registerPushTokenInput, revokePushTokenInput } from '@pusula/domain';
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
  }),
});
