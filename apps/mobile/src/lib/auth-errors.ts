import { strings } from './strings';

/**
 * Better Auth hata yüzeyini kullanıcıya gösterilecek tek bir metne çevirir.
 *
 * İki hata biçimini de karşılar: `authClient.*` çağrılarının döndürdüğü
 * `result.error` nesnesi (`{ message, code, status }`) ve `try/catch` ile
 * yakalanan `Error`. Better Auth mesajları anlaşılır döndüğü için öncelik
 * `message`; yoksa genel hata metni (`strings.common.unknownError`).
 *
 * Web `result.error.message ?? strings.common.unknownError` deseniyle
 * simetrik — burada merkezi ve test edilebilir.
 */
export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }
  return strings.common.unknownError;
}
