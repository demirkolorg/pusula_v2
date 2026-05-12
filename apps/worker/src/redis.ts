import { Redis } from 'ioredis';
import { env } from './env';

/**
 * Shared Redis connection for BullMQ. `maxRetriesPerRequest: null` is required
 * by BullMQ blocking commands; `enableReadyCheck: false` keeps reconnects snappy.
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  console.error('[worker] redis error:', err.message);
});
