import { TRPCError } from '@trpc/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { and, authKnownDevices, desc, eq, inArray, sessions } from '@pusula/db';
import { protectedProcedure, router } from '../trpc';

/**
 * Faz 10I (DEM-143) — Bilinen cihaz listesi + revoke. `apps/api/src/auth.ts`
 * Better Auth `databaseHooks.session.create.after` hook'u her başarılı login
 * sonrası `auth_known_devices`'a (user, UA hash, IP /24 veya /48 subnet)
 * üçlüsünü upsert ediyor. Bu router o satırları kullanıcı için listeler ve
 * tek satır revoke ile hem `auth_known_devices` satırını hem de o cihaza ait
 * tüm aktif Better Auth oturumlarını siler (Better Auth oturumlarını
 * Drizzle adapter üzerinden bizim `sessions` tablomuzdan okur — DB'den
 * silmek "imzalı çıkış" ile eşdeğer).
 *
 * Detay: `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 8 +
 * `docs/architecture/07-auth.md` (Yeni cihazda oturum maili — Faz 10I).
 */

const MAX_USER_AGENT_DISPLAY_LENGTH = 256;

function normalizeForHash(userAgent: string | null | undefined): string {
  const raw = (userAgent ?? '').trim();
  if (raw.length === 0) return 'unknown';
  return raw
    .replace(/(\d+)\.(\d+)\.[\d.]+/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 512);
}

function hashUa(userAgent: string | null | undefined): string {
  return createHash('sha256').update(normalizeForHash(userAgent)).digest('hex');
}

function subnetForRaw(ip: string | null | undefined): string {
  const value = (ip ?? '').trim();
  if (value.length === 0) return 'unknown';
  const ipv4Mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const candidate = ipv4Mapped ? (ipv4Mapped[1] as string) : value;
  const ipv4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  if (candidate.includes(':')) {
    const hextets = candidate.split(':');
    if (hextets.length >= 3 && hextets.slice(0, 3).every((h) => /^[0-9a-fA-F]{1,4}$/.test(h))) {
      return `${hextets.slice(0, 3).join(':').toLowerCase()}::/48`;
    }
  }
  return 'unknown';
}

export const devicesRouter = router({
  /**
   * List the caller's known devices, newest first. `isCurrent` is computed by
   * matching the request's UA hash + subnet against each row — true on the
   * row representing the device making the request.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        id: authKnownDevices.id,
        userAgent: authKnownDevices.userAgent,
        userAgentHash: authKnownDevices.userAgentHash,
        ipSubnet: authKnownDevices.ipSubnet,
        firstSeenAt: authKnownDevices.firstSeenAt,
        lastSeenAt: authKnownDevices.lastSeenAt,
      })
      .from(authKnownDevices)
      .where(eq(authKnownDevices.userId, userId))
      .orderBy(desc(authKnownDevices.lastSeenAt));

    const currentHash = hashUa(ctx.userAgent);
    const currentSubnet = subnetForRaw(ctx.ip);

    return rows.map((row) => ({
      id: row.id,
      userAgent:
        (row.userAgent ?? '').slice(0, MAX_USER_AGENT_DISPLAY_LENGTH) || row.userAgentHash.slice(0, 8),
      ipSubnet: row.ipSubnet,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      isCurrent: row.userAgentHash === currentHash && row.ipSubnet === currentSubnet,
    }));
  }),

  /**
   * Revoke a known device: delete the `auth_known_devices` row + delete every
   * Better Auth session whose `(userAgent hash, IP /24 subnet)` matches. The
   * deleted sessions can no longer be used — the next request on that cookie
   * fails the session lookup and the user is signed out.
   *
   * Returns the number of sessions revoked alongside the device row.
   */
  revoke: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [device] = await ctx.db
        .select({
          id: authKnownDevices.id,
          userId: authKnownDevices.userId,
          userAgentHash: authKnownDevices.userAgentHash,
          ipSubnet: authKnownDevices.ipSubnet,
        })
        .from(authKnownDevices)
        .where(
          and(eq(authKnownDevices.id, input.deviceId), eq(authKnownDevices.userId, userId)),
        )
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cihaz bulunamadı.' });
      }

      // Match Better Auth sessions for this user whose (UA hash, subnet) pair
      // equals the device row's. We can't query `sessions` by UA hash directly
      // (it stores raw `userAgent`), so we pull the user's sessions and filter
      // in-memory. A user has at most a handful of active sessions at a time;
      // this is fine.
      const userSessions = await ctx.db
        .select({
          id: sessions.id,
          userAgent: sessions.userAgent,
          ipAddress: sessions.ipAddress,
        })
        .from(sessions)
        .where(eq(sessions.userId, userId));

      const matchingSessionIds = userSessions
        .filter(
          (s) =>
            hashUa(s.userAgent) === device.userAgentHash &&
            subnetForRaw(s.ipAddress) === device.ipSubnet,
        )
        .map((s) => s.id);

      let revokedSessionCount = 0;
      if (matchingSessionIds.length > 0) {
        const deleted = await ctx.db
          .delete(sessions)
          .where(and(eq(sessions.userId, userId), inArray(sessions.id, matchingSessionIds)))
          .returning({ id: sessions.id });
        revokedSessionCount = deleted.length;
      }

      await ctx.db
        .delete(authKnownDevices)
        .where(
          and(eq(authKnownDevices.id, device.id), eq(authKnownDevices.userId, userId)),
        );

      return { revokedSessionCount };
    }),
});
