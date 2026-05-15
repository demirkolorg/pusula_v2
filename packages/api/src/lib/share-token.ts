/**
 * Faz 9B (DEM-128) — kart paylaşım linki için cryptographically random token
 * üretimi ve hash'leme yardımcıları.
 *
 * Disiplin:
 *  - Plaintext token DB'de **hiçbir zaman** saklanmaz; yalnız `share.create`
 *    response'unda bir kerelik döner.
 *  - DB'ye yazılan: `token_hash` (SHA-256 hex, 64 karakter) + `token_prefix`
 *    (plaintext'in ilk 8 karakteri — UI maskeli görüntü için).
 *  - Public endpoint (Faz 9C) lookup'ı: gelen token hash'lenir →
 *    `WHERE token_hash = $1` ile sabit-uzunluk eşitliği üzerinden bulunur.
 *  - 32 byte (256 bit) entropy → 43 karakter base64url string. Brute-force
 *    maliyeti pratik olarak imkânsız; per-token 404 sayacı tutulmaz.
 *
 * Bkz. `docs/architecture/14-paylasim-linki-mimarisi.md` "Token üretimi &
 * doğrulama" ve `docs/domain/08-paylasim-linki-kurallari.md` "Link davranışı".
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PREFIX_LENGTH = 8;

export interface GeneratedShareToken {
  /** Plaintext token (base64url, 43 karakter). YALNIZ response'ta döner. */
  readonly token: string;
  /** SHA-256 hex hash (64 karakter). `share_links.token_hash`'e yazılır. */
  readonly tokenHash: string;
  /** İlk 8 karakter. `share_links.token_prefix`'e yazılır (UI maskeli görüntü). */
  readonly tokenPrefix: string;
}

/** Yeni bir paylaşım linki token'ı üret. */
export function generateShareToken(): GeneratedShareToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return {
    token,
    tokenHash: hashShareToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
  };
}

/** Verilen plaintext token'ı SHA-256 hex ile hash'le (public endpoint lookup'ı için). */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
