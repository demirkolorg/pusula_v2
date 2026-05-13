/**
 * Socket.IO connection authentication — Faz 5A (DEM-83).
 *
 * Socket.IO's handshake exposes the same HTTP request that opens the WebSocket
 * upgrade, so the Better Auth session cookie (set by `/api/auth/*` on the
 * shared origin) flows in automatically. We resolve it with `auth.api.getSession`
 * — the same call `buildTrpcContext` makes — and stash `socket.data.userId`.
 * Failure (no session, expired session, throw) → reject with `Unauthorized`.
 *
 * The factory takes the session resolver as an injected callback rather than
 * importing Better Auth directly, so the socket tests can swap in an in-memory
 * stub without bootstrapping the whole auth stack.
 */
import type { Socket } from 'socket.io';

/**
 * Socket.IO surfaces middleware errors as `ExtendedError` — its public types
 * don't re-export the shape, so we mirror the relevant fields locally. The
 * runtime accepts any `Error` instance.
 */
type ExtendedError = Error & { data?: unknown };

/** Minimal slice of a Better Auth session the socket middleware needs. */
export interface ResolvedSocketSession {
  userId: string;
}

/** Pluggable session resolver — defaults to Better Auth in production wiring. */
export type SocketSessionResolver = (
  headers: Headers,
) => Promise<ResolvedSocketSession | null>;

/**
 * Convert Socket.IO's Node.js `IncomingHttpHeaders` (a record of
 * `string | string[] | undefined`) into a WHATWG `Headers` instance — Better
 * Auth's `getSession` expects the WHATWG shape (same conversion as
 * `buildTrpcContext`, but from the handshake instead of `c.req.raw.headers`).
 */
export function handshakeHeadersToFetch(
  handshakeHeaders: Record<string, string | string[] | undefined>,
): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(handshakeHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Socket.IO `io.use(...)` connection middleware factory. Calls
 * `resolveSession(handshakeHeaders)`; on a non-null session, sets
 * `socket.data.userId` and forwards; otherwise rejects with `Unauthorized`.
 * Resolver throws are swallowed → also rejected as `Unauthorized` so a transient
 * Better Auth glitch doesn't leak through.
 */
export function createSocketAuthMiddleware(
  resolveSession: SocketSessionResolver,
): (socket: Socket, next: (err?: ExtendedError) => void) => Promise<void> {
  return async (socket, next) => {
    try {
      const headers = handshakeHeadersToFetch(socket.handshake.headers);
      const session = await resolveSession(headers);
      if (!session) {
        next(new Error('Unauthorized'));
        return;
      }
      socket.data.userId = session.userId;
      next();
    } catch (err) {
      // Don't surface the resolver's internal error to the client — auth
      // failures must look uniform.
      console.warn(
        '[api:socket] auth middleware error:',
        err instanceof Error ? err.message : String(err),
      );
      next(new Error('Unauthorized'));
    }
  };
}
