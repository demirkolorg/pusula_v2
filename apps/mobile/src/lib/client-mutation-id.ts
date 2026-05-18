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

/**
 * İyimser (optimistic) kart/liste için geçici istemci-tarafı id üretir
 * (Faz 7H). `card.create` / `list.create` sunucudan dönene kadar cache'te
 * bu id kullanılır; dönüşte gerçek id ile değiştirilir. Sunucu id'leriyle
 * çakışmaması için ayırt edici `tmp-` öneki taşır.
 */
export function newTempId(): string {
  return `tmp-${randomUUID()}`;
}

/**
 * Bir id'nin {@link newTempId} ile üretilmiş geçici (henüz sunucuya yazılmamış)
 * bir id olup olmadığını söyler. Optimistic kart/liste sunucudan dönene kadar
 * etkileşime (kart detayı açma, taşıma, ⋮ menü) kapatılır — geçici id ile
 * yapılan istek backend'de bulunamaz.
 */
export function isPendingId(id: string): boolean {
  return id.startsWith('tmp-');
}
