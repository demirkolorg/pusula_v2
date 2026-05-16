/**
 * Kullanıcıya dönük Türkçe hata mesajı üretir. Ham `error.message` doğrudan
 * gösterimi teknik/İngilizce metin sızdırır — örn. `INTERNAL_SERVER_ERROR`
 * (tRPC varsayılan mesajı) veya `Failed to fetch` (ağ hatası). Bu helper tRPC
 * hata kodunu tanıyıp güvenli Türkçe metne çevirir; tanınmayan / ağ hatası
 * durumunda jenerik mesaja düşer (DEM-174).
 */
import { TRPCClientError } from '@trpc/client';
import { strings } from './strings';

export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const data = error.data as { code?: unknown } | null | undefined;
    const code = typeof data?.code === 'string' ? data.code : undefined;
    switch (code) {
      case 'UNAUTHORIZED':
        return 'Oturumun sona ermiş görünüyor. Lütfen yeniden giriş yap.';
      case 'FORBIDDEN':
        return 'Bu işlem için yetkin yok.';
      case 'NOT_FOUND':
        return 'Aradığın içerik bulunamadı ya da kaldırılmış.';
      case 'TOO_MANY_REQUESTS':
        return 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar dene.';
      // `BAD_REQUEST` / `CONFLICT`: sunucu prosedürleri bu kodlarda bilinçli
      // olarak Türkçe, kullanıcıya dönük mesaj fırlatır — olduğu gibi kullan.
      case 'BAD_REQUEST':
      case 'CONFLICT':
        return error.message.trim() || strings.common.unknownError;
      // `INTERNAL_SERVER_ERROR` ve diğerleri: mesaj teknik / kod adı olabilir.
      default:
        return strings.common.unknownError;
    }
  }
  // tRPC dışı hata (örn. `TypeError: Failed to fetch`) — asla ham gösterme.
  return strings.common.unknownError;
}
