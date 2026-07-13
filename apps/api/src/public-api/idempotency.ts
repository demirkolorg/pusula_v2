/**
 * Public API + Bot Erişimi (Task 3) — `Idempotency-Key` header yardımcısı.
 *
 * AI ajanları ağ hatasında agresif retry yapar; kopya kayıt riskini kapatmak
 * için tüm mutasyon uçları (`POST`/`PATCH`/`DELETE`) `Idempotency-Key` (UUID)
 * ister. Header, tRPC input'una `clientMutationId` olarak taşınır (mevcut
 * `clientMutationIdSchema` = `z.string().uuid()` + realtime echo-filtreleme
 * aynen kullanılır). Route bağlanışı Task 4'te; burada yalnız parse + doğrulama
 * helper'ı ve testi.
 */
import { z } from 'zod';

/** Canonical header adı. Hono `c.req.header()` case-insensitive okur. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

const idempotencyKeySchema = z.string().uuid();

export interface IdempotencyParseResult {
  readonly ok: boolean;
  /** Yalnız `ok` true iken dolu — doğrulanmış UUID. */
  readonly key?: string;
  /** Yalnız `ok` false iken dolu — 400 gövdesi için hata bilgisi. */
  readonly error?: { readonly code: 'BAD_REQUEST'; readonly message: string };
}

/**
 * `Idempotency-Key` header değerini okuyup UUID doğrular. Eksik/geçersizse
 * `ok: false` + 400 hata bilgisi döner (route bunu `{ error: { code, message } }`
 * gövdesine map'ler).
 */
export function parseIdempotencyKey(
  headerValue: string | null | undefined,
): IdempotencyParseResult {
  if (!headerValue) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Idempotency-Key başlığı zorunludur.' },
    };
  }
  const parsed = idempotencyKeySchema.safeParse(headerValue.trim());
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Idempotency-Key geçerli bir UUID olmalıdır.' },
    };
  }
  return { ok: true, key: parsed.data };
}
