/**
 * Faz 13D — Print token (worker → web print sayfası → tRPC verify)
 * akışı için HMAC-imzalı kısa-ömürlü token (DEM-260).
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.8 — Puppeteer
 * worker `/reports/print/[renderId]?token=<jwt>` route'una gider; route
 * `print.verifyToken` çağırır. Token 5 dakika expire, sadece o renderId
 * için geçerli.
 *
 * Format: `<base64url(payload)>.<base64url(hmac-sha256)>` (compact,
 * JWT'ye benzer ama dış dep'siz — `jose`/`jsonwebtoken` getirmedik).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PrintTokenPayload {
  /** Render id (text+nanoid). */
  renderId: string;
  /** Issued-at, ms epoch. */
  iat: number;
  /** Expires-at, ms epoch. */
  exp: number;
}

/** Default expiry — 5 dakika (spec §16.8). */
export const PRINT_TOKEN_TTL_MS = 5 * 60 * 1000;

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

/**
 * Render id için imzalı token üret. Secret `WORKER_SHARED_SECRET`
 * env'inden gelir (en az 32 char — `apps/api/src/env.ts` Zod).
 */
export function issuePrintToken(args: {
  renderId: string;
  secret: string;
  now?: Date;
  ttlMs?: number;
}): string {
  const now = (args.now ?? new Date()).getTime();
  const payload: PrintTokenPayload = {
    renderId: args.renderId,
    iat: now,
    exp: now + (args.ttlMs ?? PRINT_TOKEN_TTL_MS),
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = createHmac('sha256', args.secret).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export type PrintTokenVerifyResult =
  | { ok: true; payload: PrintTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'render_id_mismatch' };

/**
 * Token'i doğrula. `expectedRenderId` ile binding kontrol — token başka
 * bir render için verilmişse reddedilir (cross-render leak engeli).
 */
export function verifyPrintToken(args: {
  token: string;
  secret: string;
  expectedRenderId: string;
  now?: Date;
}): PrintTokenVerifyResult {
  const parts = args.token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, sigB64] = parts;
  let payload: PrintTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as PrintTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const expectedSig = createHmac('sha256', args.secret).update(payloadB64).digest();
  let actualSig: Buffer;
  try {
    actualSig = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  // `timingSafeEqual` farklı uzunlukta buffer'larda atar — önce uzunluk eşitliği.
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return { ok: false, reason: 'bad_signature' };
  }

  if (payload.renderId !== args.expectedRenderId) {
    return { ok: false, reason: 'render_id_mismatch' };
  }

  const now = (args.now ?? new Date()).getTime();
  if (typeof payload.exp !== 'number' || now > payload.exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}
