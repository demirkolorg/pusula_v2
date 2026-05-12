import { getDb, type Database } from '@pusula/db';

/** The authenticated user, as resolved by the host app's auth layer (Better Auth). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface SessionInfo {
  user: SessionUser;
  /** Opaque session id/token, for logging/audit. */
  sessionId?: string;
}

export interface CreateContextOptions {
  /** Resolved session, or `null` for anonymous requests. */
  session: SessionInfo | null;
  /** Optional pre-built db handle (tests); defaults to the shared singleton. */
  db?: Database;
  /** Correlation id for logs/traces. */
  requestId?: string;
  /** Client-side IP/user-agent for audit, if available. */
  ip?: string | null;
  userAgent?: string | null;
}

export interface Context {
  session: SessionInfo | null;
  db: Database;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Builds the per-request tRPC context. Host apps (apps/api, Next route handlers) call this. */
export function createContext(opts: CreateContextOptions): Context {
  return {
    session: opts.session,
    db: opts.db ?? getDb(),
    requestId: opts.requestId,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  };
}
