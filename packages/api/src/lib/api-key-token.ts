/**
 * Public API + Bot Erişimi (2026-07-13) — bot API key'i için cryptographically
 * random token üretimi ve hash'leme yardımcıları.
 *
 * Emsal: `share-token.ts` (Faz 9B). Aynı disiplin, iki fark:
 *  - Token `psk_` (Pusula Secret Key) önekiyle taşınır — log/UI'da tür anında
 *    ayırt edilir, gövde yine 32 byte (256 bit) entropy → 43 karakter base64url.
 *  - `prefix`, `psk_` + gövdenin ilk 8 karakteri = 12 karakter (UI maskeli
 *    görüntü + `api_keys.token_prefix` lookup index'i).
 *
 * Disiplin:
 *  - Plaintext token DB'de **hiçbir zaman** saklanmaz; yalnız
 *    `board.apiKeys.create` response'unda bir kerelik döner (Task 7).
 *  - DB'ye yazılan: `token_hash` (SHA-256 hex, 64 karakter) + `token_prefix`.
 *  - Auth middleware (Task 3) lookup'ı: gelen token hash'lenir → `timingSafeEqual`
 *    ile sabit-uzunluk eşitliği üzerinden doğrulanır.
 *
 * `node:crypto` gerektirdiği için bu helper `@pusula/domain`'e **konmaz** —
 * domain barrel'ı web/mobil client bundle'ına girer (2026-07-13 revizyon notu).
 *
 * Bkz. `docs/architecture/21-public-api-ve-bot-erisimi.md`,
 * `docs/domain/10-bot-ve-api-key-kurallari.md`.
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PREFIX_TOKEN = 'psk_';
/** `psk_` (4) + gövdenin ilk 8 karakteri = 12. */
const TOKEN_PREFIX_LENGTH = 12;

export interface GeneratedApiKeyToken {
  /** Plaintext token (`psk_` + 43 karakter base64url). YALNIZ response'ta döner. */
  readonly token: string;
  /** SHA-256 hex hash (64 karakter). `api_keys.token_hash`'e yazılır. */
  readonly hash: string;
  /** `psk_` + ilk 8 karakter = 12. `api_keys.token_prefix`'e yazılır. */
  readonly prefix: string;
}

/** Yeni bir bot API key token'ı üret. */
export function generateApiKeyToken(): GeneratedApiKeyToken {
  const token = TOKEN_PREFIX_TOKEN + randomBytes(TOKEN_BYTES).toString('base64url');
  return {
    token,
    hash: hashApiKeyToken(token),
    prefix: apiKeyTokenPrefix(token),
  };
}

/** Verilen plaintext token'ı SHA-256 hex ile hash'le (auth middleware lookup'ı için). */
export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token'ın maskeli önekini döndür (`psk_` + ilk 8 karakter = 12). */
export function apiKeyTokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}
