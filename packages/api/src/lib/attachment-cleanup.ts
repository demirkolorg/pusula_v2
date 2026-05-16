/**
 * Attachment cleanup producer surface — Faz 11C (DEM-149).
 *
 * Sister module to `realtime-publish.ts` (Faz 5B) and `notification-outbox.ts`
 * (Faz 6A): exposes the shared *contract* between the tRPC mutation layer
 * (`packages/api`) and the host BullMQ producer (`apps/api/src/attachment-
 * cleanup-queue.ts`). The mutation gövdesi calls `ctx.enqueueAttachmentCleanup`
 * *after* the `attachment.delete` tx commits — best-effort fire-and-forget;
 * the 60 min sweeper (`apps/worker/src/jobs/attachment-cleanup-sweeper.ts`)
 * is the safety net.
 *
 * Why a dedicated lib module (not inline on `context.ts`): mirrors the shape
 * of `realtime-publish.ts` / `notification-outbox.ts` so reviewers learning
 * the outbox/producer/consumer pattern only need to learn it once. Procedure
 * code imports `EnqueueAttachmentCleanup` from `@pusula/api` (re-exported
 * via `context.ts`), so this module stays free of Redis / BullMQ.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Attachment cleanup queue
 * (Faz 11 — kart eki)" and `docs/architecture/09-depolama-ve-arama.md` §9.1.
 */

/** Payload handed off to the host BullMQ producer. */
export interface AttachmentCleanupJobInput {
  /** `attachments.id` of the row whose object should be erased. */
  attachmentId: string;
  /** `attachments.storage_key` — the MinIO object key to delete. */
  storageKey: string;
}

/**
 * Host-supplied, best-effort enqueue hook. The host (`apps/api`) wires this
 * to a BullMQ `Queue.add` call; Redis errors are logged and swallowed so the
 * API request never fails because of a cleanup enqueue failure (the sweeper
 * eventually drains orphaned rows). Omitted in tests / Next route handlers
 * → enqueue is a no-op.
 */
export type EnqueueAttachmentCleanup = (input: AttachmentCleanupJobInput) => void | Promise<void>;

/** Minimal slice of the tRPC context this helper needs. */
interface CtxWithEnqueue {
  enqueueAttachmentCleanup?: EnqueueAttachmentCleanup;
}

/**
 * Best-effort enqueue helper — fires `ctx.enqueueAttachmentCleanup(input)`
 * iff the host wired it. Centralises the null-check so mutation gövdeleri
 * stay one-liners. Mirrors `maybeEnqueueNotificationPublish` (Faz 6A) shape.
 */
export function maybeEnqueueAttachmentCleanup(
  ctx: CtxWithEnqueue,
  input: AttachmentCleanupJobInput | undefined,
): void {
  if (!input) return;
  if (!ctx.enqueueAttachmentCleanup) return;
  void ctx.enqueueAttachmentCleanup(input);
}
