export interface ObjectStorage {
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  createPresignedGetUrl(input: { key: string }): Promise<string>;
  /**
   * Stable, unsigned public URL for an object stored under a public-read
   * prefix (DEM-160 — `avatars/*`). Unlike presigned GET URLs this never
   * expires, so it can be persisted (e.g. in `users.image`). Only valid for
   * keys the bucket policy actually exposes anonymously.
   */
  publicUrl(key: string): string;
}

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
