import type { RouterOutputs } from '@pusula/api';
import { RemoteImage } from '@/components/remote-image';

/** `board.get` kart sözleşmesindeki kapak görseli alanı (non-null). */
type CoverImage = NonNullable<RouterOutputs['board']['get']['cards'][number]['coverImage']>;

/** Kapak şeridi yükseklik/şekil varyantları. */
const VARIANT_CLASS = {
  /** Board kart yüzü — ince şerit; kart `Pressable` zaten köşeleri yuvarlıyor. */
  card: 'h-24 w-full bg-muted',
  /** Kart detay — kendi başına duran, köşeleri yuvarlatılmış kapak kartı. */
  detail: 'h-44 w-full rounded-xl bg-muted',
} as const;

/**
 * Kart kapak görseli şeridi (Faz 7P + DEM-217 + DEM-227). `board.get` / `card.get`
 * kart sözleşmesi kapak için hem `{ attachmentId, fileName, mimeType, size }`
 * metadata'sını hem de **server-side üretilmiş** presigned GET URL'i
 * (`coverImageUrl`, TTL 1 saat) döndürür. Kapak başına ayrı
 * `attachment.getDownloadUrl` query'si (eski "waterfall") kaldırıldı — URL
 * board/kart yanıtıyla tek seferde gelir.
 *
 * Render `RemoteImage`'a delege edilir: görsel inene kadar Pusula spinner yer
 * tutar (ekranın render'ını bloklamaz), görsel inince yumuşakça belirir.
 * `coverImageUrl` `null` ise (presigned URL üretilemedi — ör. ek silinmiş veya
 * objectStorage yapılandırılmamış) şerit hiç gösterilmez.
 *
 * `variant='card'` board kart yüzünde (ince şerit), `variant='detail'` kart
 * detay ekranında (web kart modalı kapak paritesi) kullanılır.
 */
export function CardCoverImage({
  coverImage,
  coverImageUrl,
  variant = 'card',
}: {
  coverImage: CoverImage;
  /**
   * Kapak görseli için presigned GET URL — `board.get` / `card.get` yanıtında
   * server-side üretilir (DEM-227). `null` ⇒ kapak şeridi gösterilmez.
   */
  coverImageUrl: string | null;
  variant?: keyof typeof VARIANT_CLASS;
}) {
  // Presigned URL alınamazsa kapak şeridi hiç gösterilmez (mevcut davranış).
  if (!coverImageUrl) return null;

  return (
    <RemoteImage
      uri={coverImageUrl}
      accessibilityLabel={coverImage.fileName}
      resizeMode="cover"
      className={VARIANT_CLASS[variant]}
    />
  );
}
