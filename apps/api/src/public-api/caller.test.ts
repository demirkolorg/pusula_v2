import { describe, expect, it } from 'vitest';
import type { Context as HonoContext } from 'hono';
import {
  botSessionId,
  buildPublicApiSession,
  createPublicApiCaller,
  withClientMutationId,
} from './caller';

const botUser = {
  id: 'bot-1',
  email: 'bot+key1@bots.pusula.internal',
  name: 'Deploy Bot',
  image: null as string | null,
};

/** Minimal Hono context stub — createPublicApiCaller only reads requestId + a
 *  couple of headers to build the best-effort host dependency set. */
function fakeHonoContext(): HonoContext {
  return {
    get: (_key: string) => undefined,
    req: { header: (_name: string) => undefined },
  } as unknown as HonoContext;
}

describe('botSessionId', () => {
  it('prefixes the api key id with "api-key:"', () => {
    expect(botSessionId('key-123')).toBe('api-key:key-123');
  });
});

describe('buildPublicApiSession', () => {
  it('maps the bot user into a SessionInfo with an api-key session id', () => {
    const session = buildPublicApiSession(botUser, 'key-123');
    expect(session).toEqual({
      user: { id: 'bot-1', email: 'bot+key1@bots.pusula.internal', name: 'Deploy Bot', image: null },
      sessionId: 'api-key:key-123',
    });
  });

  it('defaults a missing image to null', () => {
    const session = buildPublicApiSession(
      { id: 'b', email: 'e', name: 'n' },
      'k',
    );
    expect(session.user.image).toBeNull();
  });
});

describe('withClientMutationId', () => {
  it('merges the idempotency-derived clientMutationId into the input', () => {
    const merged = withClientMutationId({ title: 'Hi' }, 'uuid-value');
    expect(merged).toEqual({ title: 'Hi', clientMutationId: 'uuid-value' });
  });

  it('overrides any pre-existing clientMutationId', () => {
    const merged = withClientMutationId({ clientMutationId: 'old' }, 'new');
    expect(merged.clientMutationId).toBe('new');
  });
});

describe('createPublicApiCaller', () => {
  it('returns a tRPC caller exposing the app routers', () => {
    const caller = createPublicApiCaller({ botUser, apiKeyId: 'key-1', c: fakeHonoContext() });
    expect(typeof caller.board.get).toBe('function');
    expect(typeof caller.card.create).toBe('function');
    expect(typeof caller.list.create).toBe('function');
  });
});
