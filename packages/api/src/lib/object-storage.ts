export interface ObjectStorage {
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  createPresignedGetUrl(input: { key: string }): Promise<string>;
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
