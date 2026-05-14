'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@pusula/ui';
import { useTRPC } from '@/trpc/client';

export type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type CardCoverImageProps = {
  coverImage: CoverImage;
  alt: string;
  className?: string;
  imageClassName?: string;
};

export function CardCoverImage({
  coverImage,
  alt,
  className,
  imageClassName,
}: CardCoverImageProps) {
  const trpc = useTRPC();
  const download = useQuery(
    trpc.attachment.getDownloadUrl.queryOptions(
      { attachmentId: coverImage.attachmentId },
      { staleTime: 60_000 },
    ),
  );

  if (!download.data?.url) return null;

  return (
    <div className={cn('overflow-hidden bg-muted', className)}>
      <img
        src={download.data.url}
        alt={alt}
        draggable={false}
        className={cn('h-full w-full object-cover', imageClassName)}
      />
    </div>
  );
}
