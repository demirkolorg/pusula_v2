export interface ObjectStorage {
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  /**
   * Presigned GET URL for a private object. `expiresIn` (seconds) overrides the
   * default TTL — used by `board.get` / `card.get` cover-image URLs (DEM-227),
   * which must outlive the board query's client cache window (`staleTime` 5 min)
   * so a persisted projection doesn't carry an already-expired URL.
   */
  createPresignedGetUrl(input: { key: string; expiresIn?: number }): Promise<string>;
  /**
   * Stable, unsigned public URL for an object stored under a public-read
   * prefix (DEM-160 — `avatars/*`). Unlike presigned GET URLs this never
   * expires, so it can be persisted (e.g. in `users.image`). Only valid for
   * keys the bucket policy actually exposes anonymously.
   */
  publicUrl(key: string): string;
}

/**
 * Cover-image presigned GET URL TTL (seconds) — DEM-227. `board.get` / `card.get`
 * mint these server-side; the TTL must comfortably outlive the board query's
 * client `staleTime` (5 min) so a cached projection never carries an expired
 * URL. 1 hour is the chosen margin.
 */
export const COVER_IMAGE_URL_TTL_SECONDS = 60 * 60;

export type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export const toCoverImage = (attachment: {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}): CoverImage => ({
  attachmentId: attachment.id,
  fileName: attachment.fileName,
  mimeType: attachment.mimeType,
  size: attachment.size,
});
