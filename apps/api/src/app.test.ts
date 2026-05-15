import { afterEach, describe, expect, it } from 'vitest';
import {
  app,
  markApiStartupFailed,
  markApiStartupReady,
  resetApiReadinessForTests,
} from './app';

describe('/health readiness', () => {
  afterEach(() => {
    resetApiReadinessForTests();
  });

  it('returns 503 until realtime startup is ready', async () => {
    const response = await app.request('/health');
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: 'starting',
      realtime: 'starting',
    });
  });

  it('returns 200 once Socket.IO and the realtime bridge are ready', async () => {
    markApiStartupReady();

    const response = await app.request('/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: 'ready',
      realtime: 'ready',
    });
  });

  it('returns 503 and reports startup failures', async () => {
    markApiStartupFailed('redis subscribe failed');

    const response = await app.request('/health');
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: 'failed',
      realtime: 'failed',
      error: 'redis subscribe failed',
    });
  });
});
