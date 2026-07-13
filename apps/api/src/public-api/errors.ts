/**
 * Public API + Bot Erişimi (Task 3) — `TRPCError` → HTTP durum kodu + gövde
 * eşlemesi.
 *
 * REST handler'ları tRPC server-side caller çağırır; procedure'ler hata
 * durumunda `TRPCError` fırlatır. Bu fırlatılan hata public API gövdesine
 * dönüştürülür:
 *
 *   { error: { code, message, issues? } }
 *
 * Kurallar (plan "Güvenlik kontrol listesi" + `app.ts` `onError` deseni):
 *  - Beklenen akış (permission/validation reddi) Sentry'ye **gönderilmez**;
 *    yalnız 500'ler (`INTERNAL_SERVER_ERROR` / TRPC-dışı hata / bilinmeyen kod)
 *    raporlanır (`report: true`).
 *  - 5xx gövdeleri iç detay (stack, SQL, orijinal mesaj) **sızdırmaz** — sabit
 *    Türkçe mesaj döner.
 *  - `BAD_REQUEST` + `ZodError` cause → `issues` alanı (temiz `{ path, message }`
 *    listesi; ham Zod ağacı sızdırılmaz).
 */
import { TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { ZodError } from 'zod';

/** Public API hata gövdesi. */
export interface PublicApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Yalnız Zod doğrulama hatalarında dolu. */
    issues?: Array<{ path: string; message: string }>;
  };
}

export interface MappedPublicApiError {
  /** HTTP durum kodu. */
  status: number;
  /** JSON gövde. */
  body: PublicApiErrorBody;
  /** true ⇒ Sentry'ye raporlanmalı (yalnız 500'ler). */
  report: boolean;
}

/**
 * Beklenen (4xx) TRPC kodları → HTTP durum kodu. Listede olmayan her kod 500
 * kabul edilir (beklenmeyen sunucu hatası → Sentry).
 */
const CODE_TO_STATUS: Partial<Record<TRPC_ERROR_CODE_KEY, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  TOO_MANY_REQUESTS: 429,
  CONFLICT: 409,
};

/** Sabit, detay sızdırmayan 500 yanıtı. */
function internalError(): MappedPublicApiError {
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Sunucu hatası.' } },
    report: true,
  };
}

/** ZodError'ı temiz `{ path, message }` listesine indir. */
function zodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/** Bir caller hatasını public API HTTP durum kodu + gövdesine dönüştür. */
export function mapTrpcError(err: unknown): MappedPublicApiError {
  if (!(err instanceof TRPCError)) {
    // TRPC-dışı beklenmeyen hata → 500 + Sentry.
    return internalError();
  }

  const status = CODE_TO_STATUS[err.code];
  if (status === undefined) {
    // Bilinmeyen / 5xx TRPC kodu (INTERNAL_SERVER_ERROR dahil) → 500 + Sentry.
    return internalError();
  }

  const body: PublicApiErrorBody = {
    error: { code: err.code, message: err.message },
  };
  if (err.code === 'BAD_REQUEST' && err.cause instanceof ZodError) {
    body.error.issues = zodIssues(err.cause);
  }
  return { status, body, report: false };
}
