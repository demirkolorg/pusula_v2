import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from '@pusula/api';
import { env } from './env';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const objectStorage: ObjectStorage = {
  async createPresignedPutUrl(input) {
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    return {
      url: await getSignedUrl(s3, command, { expiresIn: 10 * 60 }),
      headers: { 'content-type': input.contentType },
    };
  },

  async createPresignedGetUrl(input) {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
    });
    return getSignedUrl(s3, command, { expiresIn: 10 * 60 });
  },
};
