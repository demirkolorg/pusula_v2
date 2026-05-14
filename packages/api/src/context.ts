import { getDb, type Database } from '@pusula/db';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import type { EnqueueCompaction } from './lib/compaction';
import type { EnqueueNotificationPublish } from './lib/notification-outbox';
import type { ObjectStorage } from './lib/object-storage';
import type { EnqueueRealtimePublish } from './lib/realtime-publish';

/**
 * Best-effort realtime emit helpers — wired by the host app (`apps/api` boot
 * mounts the Socket.IO server and supplies these closures; tests / Next route
 * handlers omit them → emit is a no-op). Faz 5B mutation bodies route writes
 * through `realtime_events` outbox, so direct emit from procedures is reserved
 * for server-initiated events; until 5B lands these are mostly unused.
 *
 * Same wiring shape as `enqueueCompaction` (Faz 3C — DEM-44). Both Redis I/O
 * (`emitToBoard`/`emitToUser` cross-node fan-out via `@socket.io/redis-adapter`)
 * and BullMQ enqueues are host concerns — the API package stays framework-free.
 *
 * See `docs/architecture/03-backend.md` "Faz 5 — Socket.IO server" and
 * `docs/architecture/05-board-mekanigi.md` §5.3.
 */
export interface RealtimeEmit {
  /** Emit an envelope to every socket joined to `board:{boardId}`. */
  emitToBoard: (boardId: string, envelope: RealtimeEventEnvelope) => void | Promise<void>;
  /** Emit an envelope to every socket joined to `user:{userId}`. */
  emitToUser: (userId: string, envelope: RealtimeEventEnvelope) => void | Promise<void>;
}

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
   * DEM-44). The host app (`apps/api`) wires this to the BullMQ `pusula-compaction`
   * queue; omitted in tests / Next route handlers → compaction is a no-op there.
   */
  enqueueCompaction?: EnqueueCompaction;
  /**
   * Best-effort realtime emit helpers (Faz 5A — DEM-83). Wired by `apps/api`
   * after the Socket.IO server is mounted; absent in tests / Next route
   * handlers → emit is a no-op (mutation bodies should treat this field as
   * optional and check before calling). See `RealtimeEmit` above.
   */
  realtime?: RealtimeEmit;
  /**
   * Best-effort hook to enqueue a `pusula-realtime-publish` job after the
   * mutation tx commits (Faz 5B — DEM-84). The host app (`apps/api`) wires
   * this to the BullMQ producer; omitted in tests / Next route handlers →
   * enqueue is a no-op (the periodic sweeper in `apps/worker` drains any
   * stragglers anyway). See `lib/realtime-publish.ts`.
   */
  enqueueRealtimePublish?: EnqueueRealtimePublish;
  /**
   * Best-effort hook to enqueue a `pusula-notifications` job after the
   * mutation tx commits (Faz 6A — DEM-90). The host app (`apps/api`) wires
   * this to the BullMQ producer; omitted in tests / Next route handlers →
   * enqueue is a no-op (the periodic sweeper in `apps/worker` drains any
   * stragglers anyway). See `lib/notification-outbox.ts`.
   */
  enqueueNotificationPublish?: EnqueueNotificationPublish;
  /** Host-provided object storage adapter for presigned attachment URLs. */
  objectStorage?: ObjectStorage;
}

export interface Context {
  session: SessionInfo | null;
  db: Database;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
  /** See `CreateContextOptions.enqueueCompaction`. `undefined` ⇒ compaction no-op. */
  enqueueCompaction?: EnqueueCompaction;
  /** See `CreateContextOptions.realtime`. `undefined` ⇒ realtime emit no-op. */
  realtime?: RealtimeEmit;
  /** See `CreateContextOptions.enqueueRealtimePublish`. `undefined` ⇒ enqueue no-op. */
  enqueueRealtimePublish?: EnqueueRealtimePublish;
  /** See `CreateContextOptions.enqueueNotificationPublish`. `undefined` ⇒ enqueue no-op. */
  enqueueNotificationPublish?: EnqueueNotificationPublish;
  /** See `CreateContextOptions.objectStorage`. */
  objectStorage?: ObjectStorage;
  /**
   * Phase 4A (DEM-78) — collaborative mutations may carry a client-generated
   * `clientMutationId` (UUID v4 via `crypto.randomUUID()`) on the input. The
   * `enforceClientMutationId` middleware on `protectedProcedure` reads it from
   * the raw input and stashes it here so procedure bodies can fold it into
   * `activity_events.payload` (consumed by Phase 5 realtime echo filtering +
   * server-side short-window dedupe; Phase 4 is record-only). `undefined` when
   * the client omitted the field or the raw value is not a string. The
   * authoritative validation still happens via the procedure's Zod input —
   * this is a best-effort propagation that never blocks the request.
   */
  clientMutationId?: string;
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
    realtime: opts.realtime,
    enqueueRealtimePublish: opts.enqueueRealtimePublish,
    enqueueNotificationPublish: opts.enqueueNotificationPublish,
    objectStorage: opts.objectStorage,
    // The `enforceClientMutationId` middleware overwrites this for every
    // protected procedure call; explicit default keeps the shape stable for
    // call sites that read `ctx.clientMutationId` before the middleware runs
    // (and stays sound if `exactOptionalPropertyTypes` is ever enabled).
    clientMutationId: undefined,
  };
}

export type { CompactionScope, EnqueueCompaction } from './lib/compaction';
export type { EnqueueNotificationPublish } from './lib/notification-outbox';
export type { CoverImage, ObjectStorage } from './lib/object-storage';
export type {
  EnqueueRealtimePublish,
  InsertRealtimeEventInput,
  RealtimePayloadEnvelope,
} from './lib/realtime-publish';
