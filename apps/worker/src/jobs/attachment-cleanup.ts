/**
 * Attachment cleanup job — Faz 11C (DEM-149).
 *
 * Consumer side of the `pusula-attachment-cleanup` queue's **delete trigger**
 * (the sister sweeper job lives in `attachment-cleanup-sweeper.ts`). Producer:
 * `attachment.delete` mutation (Faz 11B / DEM-148) tx COMMIT → `void
 * enqueueAttachmentCleanup({ attachmentId, storageKey })` from
 * `apps/api/src/attachment-cleanup-queue.ts`.
 *
 * What this job does:
 *  1. MinIO `DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey })`.
 *  2. Stamp success. Idempotent — `NoSuchKey` / 404 means another worker /
 *     a previous run already deleted the object → counts as success.
 *  3. Real failures (5xx, network, credentials) propagate to BullMQ for
 *     retry/backoff (`defaultJobOptions` in `queues.ts` — 3 attempts,
 *     exponential delay; the failed list keeps the row for 7 days).
 *
 * What this job does NOT do: write `activity_events` (the mutation already
 * wrote `attachment.removed` inside the tx) and does NOT delete the DB row
 * (the mutation tx already deleted it; this job only erases the physical
 * object). The orphan sweeper handles the *other* lifecycle: drafts that
 * never got committed.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Attachment cleanup queue
 * (Faz 11 — kart eki)".
 */
import { DeleteObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

/** BullMQ job name routed by `index.ts` (the worker also handles the sweeper job). */
export const ATTACHMENT_CLEANUP_JOB_NAME = 'attachment-cleanup';

/**
 * Retry/backoff policy for the `pusula-attachment-cleanup` queue (Faz 11C /
 * DEM-149). Single source of truth — `queues.ts` builds the BullMQ
 * `defaultJobOptions` from this, so the spec ("3 attempts, exponential
 * backoff, failed list kept 7 days for dead-letter inspection") is testable
 * without importing `queues.ts` (which would open a live Redis connection).
 *
 * `attempts: 3` — a transient MinIO 5xx / network blip is retried twice more
 * with exponential delay; after the 3rd failure the job lands on the failed
 * (dead-letter) list, retained for 7 days so an operator can inspect/redrive.
 */
export const ATTACHMENT_CLEANUP_RETRY_POLICY = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
} as const;

/** Payload pushed by the producer (`apps/api/src/attachment-cleanup-queue.ts`). */
export interface AttachmentCleanupJobData {
  attachmentId: string;
  storageKey: string;
}

/**
 * Minimum S3-shaped surface the processor needs. Lets tests inject a fake
 * client without pulling in the AWS SDK type (one less surface for module
 * mocking to wrangle).
 */
export interface AttachmentObjectStorage {
  deleteObject: (input: { bucket: string; key: string }) => Promise<void>;
}

/**
 * Build the worker-side S3 client. Mirrors `apps/api/src/object-storage.ts`
 * settings (force path-style for MinIO, dev credentials default). The two
 * apps share env defaults — `apps/worker` has its own copy of the S3_* env
 * vars (see `env.ts`) so the worker can boot without the API host.
 */
export function createAttachmentS3Client(config: S3ClientConfig): S3Client {
  return new S3Client({
    forcePathStyle: true,
    ...config,
  });
}

/**
 * Wraps an `S3Client` into the `AttachmentObjectStorage` surface the
 * processor expects. `NoSuchKey` and HTTP 404/`NotFound` responses are
 * swallowed (idempotent — the object is already gone, which is the only
 * outcome we cared about).
 */
export function s3DeleteObjectAdapter(client: S3Client): AttachmentObjectStorage {
  return {
    async deleteObject({ bucket, key }) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (err) {
        if (isObjectMissingError(err)) {
          // The object was already gone. Treat as success — a retry that
          // observed a partial previous run shouldn't trip on this.
          return;
        }
        throw err;
      }
    },
  };
}

/** True when the SDK error means "object does not exist on the bucket". */
export function isObjectMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (candidate.name === 'NoSuchKey' || candidate.name === 'NotFound') return true;
  if (candidate.Code === 'NoSuchKey' || candidate.Code === 'NotFound') return true;
  const status = candidate.$metadata?.httpStatusCode;
  return typeof status === 'number' && status === 404;
}

/**
 * Process one cleanup job. Returns `{ deleted: true }` on success (object
 * removed *or* already gone). Throws on real failures so BullMQ handles
 * retry/backoff + dead-letter.
 */
export async function processAttachmentCleanupJob(
  storage: AttachmentObjectStorage,
  bucket: string,
  data: AttachmentCleanupJobData,
): Promise<{ deleted: true }> {
  await storage.deleteObject({ bucket, key: data.storageKey });
  return { deleted: true };
}
