import { createHash, randomUUID } from 'node:crypto';
import { authKnownDevices, eq, getDb } from '@pusula/db';

/**
 * "Yeni cihazdan oturum açıldı" tespiti (Faz 10I / DEM-143).
 *
 * Better Auth `databaseHooks.session.create.after` her başarılı login'de
 * tetiklenir; biz oradan `recordSessionDevice(...)` çağırırız. Burası tamamen
 * **best-effort**: bir SELECT/INSERT'in fırlatması login akışını kırmamalı,
 * `false` döner ve `auth.ts` mail göndermez. Ayrıntı:
 * `docs/architecture/07-auth.md` (Yeni cihazda oturum maili — Faz 10I).
 *
 * Detection mekaniği:
 *   1. UA stringini stabil bir biçime indir (gürültü atılır: küçük versiyon
 *      farkları + cihaz türüne göre yumuşak normalizasyon).
 *   2. UA hash + IP subnet ile `(user_id, UA hash, IP subnet)` üçlüsü oluştur.
 *   3. `INSERT ... ON CONFLICT (user_id, UA hash, IP subnet) DO UPDATE SET
 *      last_seen_at = now()` ile idempotent çalış.
 *      - INSERT path (`first_seen_at` === `last_seen_at`) → yeni cihaz.
 *      - CONFLICT path → bilinen cihaz, sadece `last_seen_at` bump'lanır.
 *
 * Mahremiyet: ham IP saklanmaz, sadece subnet. UA değeri opsiyonel olarak
 * (`userAgent` kolonu) UI gösterimi için truncate'lenip yazılır.
 */

const MAX_STORED_USER_AGENT_LENGTH = 256;

/**
 * UA'yı stabil bir forma indir. Browser sürüm patch'leri (Chrome/120.0.6099.130
 * vs 120.0.6099.71) ufak değişimlerde fingerprint'in değişmemesi için `.MINOR`
 * sonrasını atıyoruz; major+minor kaldırılıyor. Boş veya çok kısa UA → `unknown`.
 * Üretim ortamında bu yeterli; daha akıllı ua-parser-js entegrasyonu Faz 11+.
 */
export function normalizeUserAgent(userAgent: string | null | undefined): string {
  const raw = (userAgent ?? '').trim();
  if (raw.length === 0) return 'unknown';

  // Drop everything past the second `.` in version-like tokens, e.g.
  // "Chrome/120.0.6099.130" → "Chrome/120.0". Keeps major/minor for diagnostic
  // value but stops counting patch-level updates as a new device.
  const collapsed = raw.replace(/(\d+)\.(\d+)\.[\d.]+/g, '$1.$2');

  // Strip whitespace runs and lowercase for hash stability.
  return collapsed.replace(/\s+/g, ' ').toLowerCase().slice(0, 512);
}

/** sha256 of the normalized UA — deterministic, stored as hex. */
export function hashUserAgent(userAgent: string | null | undefined): string {
  return createHash('sha256').update(normalizeUserAgent(userAgent)).digest('hex');
}

/**
 * IPv4 `/24` (e.g. `203.0.113.7` → `203.0.113.0/24`) or IPv6 `/48` prefix.
 * Returns `'unknown'` when the input is missing or unrecognisable. The aim is
 * coarse-but-stable: same office NAT and reasonable mobile-carrier hops stay
 * on one subnet within a short window. We do not call any geo-IP service from
 * the login path — that's Faz 11+.
 */
export function subnetFor(ip: string | null | undefined): string {
  const value = (ip ?? '').trim();
  if (value.length === 0) return 'unknown';

  // IPv4-mapped IPv6 (`::ffff:203.0.113.7`) → treat as IPv4.
  const ipv4MappedMatch = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const candidate = ipv4MappedMatch ? (ipv4MappedMatch[1] as string) : value;

  const ipv4Match = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.0/24`;
  }

  // IPv6: keep the first 3 hextets (= /48). Don't try to be smart about `::`
  // expansion — typical client IPs are written in full or with one `::` that
  // is rarely earlier than the /48 boundary. Anything we don't recognise
  // collapses to `unknown` so we err on the "send the security email" side.
  if (candidate.includes(':')) {
    const hextets = candidate.split(':');
    if (hextets.length >= 3 && hextets.slice(0, 3).every((h) => /^[0-9a-fA-F]{1,4}$/.test(h))) {
      return `${hextets.slice(0, 3).join(':').toLowerCase()}::/48`;
    }
  }

  return 'unknown';
}

type RecordResult = {
  /** True the first time we see this (user, UA hash, subnet) triplet. */
  isNewDevice: boolean;
  /** Normalised UA + subnet we actually wrote, for the email body. */
  userAgentNormalized: string;
  ipSubnet: string;
};

/**
 * Idempotent upsert: bilinen cihaz → `last_seen_at` bump + `isNewDevice: false`;
 * yeni cihaz → satır insert + `isNewDevice: true`. Postgres `INSERT ... ON
 * CONFLICT` ile tek round-trip, transaction'a gerek yok.
 *
 * Hata olursa `null` döner (caller mail göndermez) — auth.ts'teki çağrı asla
 * fırlatmamalı; user'ın login akışı bu helper'a bağımlı olmamalı.
 */
export async function recordSessionDevice(params: {
  userId: string;
  userAgent: string | null | undefined;
  ip: string | null | undefined;
}): Promise<RecordResult | null> {
  const { userId, userAgent, ip } = params;
  try {
    const userAgentHash = hashUserAgent(userAgent);
    const ipSubnet = subnetFor(ip);
    const normalizedUa = normalizeUserAgent(userAgent);
    const storedUa = (userAgent ?? '').slice(0, MAX_STORED_USER_AGENT_LENGTH) || null;

    const db = getDb();
    const inserted = await db
      .insert(authKnownDevices)
      .values({
        id: randomUUID(),
        userId,
        userAgentHash,
        ipSubnet,
        userAgent: storedUa,
      })
      .onConflictDoUpdate({
        target: [
          authKnownDevices.userId,
          authKnownDevices.userAgentHash,
          authKnownDevices.ipSubnet,
        ],
        set: { lastSeenAt: new Date() },
      })
      .returning({
        firstSeenAt: authKnownDevices.firstSeenAt,
        lastSeenAt: authKnownDevices.lastSeenAt,
      });

    const row = inserted[0];
    if (!row) return null;
    // INSERT path: firstSeenAt and lastSeenAt are set in the same statement
    // (DEFAULT now() vs SET last_seen_at = now()), so the millisecond delta is
    // ~0. The ON CONFLICT branch leaves firstSeenAt at its original value, so
    // the gap is large. We treat anything <2s as the insert path.
    const isNewDevice = row.lastSeenAt.getTime() - row.firstSeenAt.getTime() < 2_000;
    return { isNewDevice, userAgentNormalized: normalizedUa, ipSubnet };
  } catch (error) {
    console.error('[auth] recordSessionDevice failed (best-effort):', error);
    return null;
  }
}

/** Test-only helper: delete every known-device row for a user (clean slate). */
export async function __deleteUserKnownDevicesForTests(userId: string): Promise<void> {
  await getDb().delete(authKnownDevices).where(eq(authKnownDevices.userId, userId));
}
