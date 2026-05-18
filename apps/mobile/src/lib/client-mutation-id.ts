/**
 * Collaborative mutation idempotency anahtarı.
 *
 * Pusula'da işbirlikçi mutation'lar (`invite` / `accept` / `decline`) opsiyonel
 * bir `clientMutationId` taşır — backend bunu idempotency için kullanır
 * (CLAUDE.md §2.5). Her mutation çağrısında yeni bir UUID üretilir.
 *
 * `expo-crypto` `randomUUID()` Hermes'te güvenilir biçimde kullanılabilir;
 * platform `crypto.randomUUID()` her zaman mevcut olmadığından doğrudan
 * `expo-crypto` tercih edilir.
 */
import { randomUUID } from 'expo-crypto';

/** Yeni bir `clientMutationId` (RFC 4122 v4 UUID) üretir. */
export function newClientMutationId(): string {
  return randomUUID();
}
