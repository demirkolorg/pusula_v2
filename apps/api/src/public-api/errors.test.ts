import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { mapTrpcError } from './errors';

describe('mapTrpcError', () => {
  it('maps UNAUTHORIZED → 401 without Sentry reporting', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'UNAUTHORIZED', message: 'Oturum gerekli.' }));
    expect(mapped.status).toBe(401);
    expect(mapped.body.error.code).toBe('UNAUTHORIZED');
    expect(mapped.body.error.message).toBe('Oturum gerekli.');
    expect(mapped.report).toBe(false);
  });

  it('maps FORBIDDEN → 403', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'FORBIDDEN', message: 'Yetkiniz yok.' }));
    expect(mapped.status).toBe(403);
    expect(mapped.body.error.code).toBe('FORBIDDEN');
    expect(mapped.report).toBe(false);
  });

  it('maps NOT_FOUND → 404', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'NOT_FOUND', message: 'Bulunamadı.' }));
    expect(mapped.status).toBe(404);
    expect(mapped.body.error.code).toBe('NOT_FOUND');
  });

  it('maps BAD_REQUEST → 400 with no issues when there is no Zod cause', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'BAD_REQUEST', message: 'Geçersiz istek.' }));
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.code).toBe('BAD_REQUEST');
    expect(mapped.body.error.issues).toBeUndefined();
  });

  it('maps BAD_REQUEST with a ZodError cause → 400 with issues', () => {
    const result = z.object({ name: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    const zerr = result.success ? null : result.error;
    const mapped = mapTrpcError(
      new TRPCError({ code: 'BAD_REQUEST', message: 'Doğrulama hatası.', cause: zerr ?? undefined }),
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.code).toBe('BAD_REQUEST');
    expect(Array.isArray(mapped.body.error.issues)).toBe(true);
    expect((mapped.body.error.issues as unknown[]).length).toBeGreaterThan(0);
  });

  it('maps TOO_MANY_REQUESTS → 429', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Çok fazla istek.' }));
    expect(mapped.status).toBe(429);
    expect(mapped.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('maps CONFLICT → 409', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'CONFLICT', message: 'Çakışma.' }));
    expect(mapped.status).toBe(409);
    expect(mapped.body.error.code).toBe('CONFLICT');
  });

  it('maps INTERNAL_SERVER_ERROR → 500, generic message, Sentry report', () => {
    const mapped = mapTrpcError(
      new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'sensitive db detail' }),
    );
    expect(mapped.status).toBe(500);
    expect(mapped.report).toBe(true);
    // Internal message must not leak.
    expect(mapped.body.error.message).not.toContain('sensitive');
    expect(mapped.body.error.issues).toBeUndefined();
  });

  it('maps an unknown TRPC code → 500 + report', () => {
    const mapped = mapTrpcError(new TRPCError({ code: 'TIMEOUT', message: 'took too long' }));
    expect(mapped.status).toBe(500);
    expect(mapped.report).toBe(true);
    expect(mapped.body.error.message).not.toContain('took too long');
  });

  it('maps a non-TRPC Error → 500 + report without leaking the message', () => {
    const mapped = mapTrpcError(new Error('raw stack detail'));
    expect(mapped.status).toBe(500);
    expect(mapped.report).toBe(true);
    expect(mapped.body.error.message).not.toContain('raw stack');
  });
});
