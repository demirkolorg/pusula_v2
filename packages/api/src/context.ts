import { getDb, type Database } from '@pusula/db';
import type { EnqueueCompaction } from './lib/compaction';

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
  /**
   * Best-effort hook to enqueue a background position-compaction job (Faz 3C —
   * DEM-44). The host app (`apps/api`) wires this to the BullMQ `pusula:compaction`
   * queue; omitted in tests / Next route handlers → compaction is a no-op there.
   */
  enqueueCompaction?: EnqueueCompaction;
}

export interface Context {
  session: SessionInfo | null;
  db: Database;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
  /** See `CreateContextOptions.enqueueCompaction`. `undefined` ⇒ compaction no-op. */
  enqueueCompaction?: EnqueueCompaction;
}

/** Builds the per-request tRPC context. Host apps (apps/api, Next route handlers) call this. */
export function createContext(opts: CreateContextOptions): Context {
  return {
    session: opts.session,
    db: opts.db ?? getDb(),
    requestId: opts.requestId,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    enqueueCompaction: opts.enqueueCompaction,
  };
}

export type { CompactionScope, EnqueueCompaction } from './lib/compaction';
