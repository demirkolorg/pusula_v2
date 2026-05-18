import { Image, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';

/** `board.get` kart sözleşmesindeki kapak görseli alanı (non-null). */
type CoverImage = NonNullable<RouterOutputs['board']['get']['cards'][number]['coverImage']>;

/**
 * Board kart yüzü kapak görseli şeridi (Faz 7P — web §8.1.14 `CardCoverImage`
 * karşılığı). `board.get` kart sözleşmesi kapak için yalnız `{ attachmentId,
 * fileName, mimeType, size }` döndürür — hazır URL yok; presigned GET URL
 * `attachment.getDownloadUrl` ile **kart başına** tembel çekilir (web ile aynı
 * tembel-fetch deseni; `board.get`'e kapak URL'i eklemek backend sözleşme
 * değişikliği — kapsam dışı). TanStack Query `attachmentId`'ye göre cache
 * yaptığından aynı kapak birden çok yerde görünürse tek istek üretir; farklı
 * kapaklar ayrı istektir. `staleTime` 60 sn presigned URL'i (TTL 10 dk) tazeler.
 *
 * URL gelene kadar `bg-muted` bir blok yer tutar (kart yüzünde sıçrama
 * azalır); presigned URL alınamazsa şerit hiç gösterilmez.
 */
export function CardCoverImage({ coverImage }: { coverImage: CoverImage }) {
  const trpc = useTRPC();
  const download = useQuery(
    trpc.attachment.getDownloadUrl.queryOptions(
      { attachmentId: coverImage.attachmentId },
      { staleTime: 60_000 },
    ),
  );

  if (download.isPending) return <View className="h-24 w-full bg-muted" />;
  if (!download.data?.url) return null;

  return (
    <Image
      source={{ uri: download.data.url }}
      accessibilityLabel={coverImage.fileName}
      resizeMode="cover"
      className="h-24 w-full bg-muted"
    />
  );
}
