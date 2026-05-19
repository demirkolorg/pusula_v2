'use client';

import { useState } from 'react';
import { cn } from '@pusula/ui';
import { CssSpinner } from '@/components/css-spinner';

/**
 * Kart kapak görseli metadata'sı (`board.get` / `card.get` `cards[].coverImage`).
 * `card-item.tsx` / `card-detail-dialog.tsx` bu tipi kullanmaya devam eder.
 */
export type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type CardCoverImageProps = {
  /**
   * Kapak görseli için presigned GET URL — `board.get` / `card.get` yanıtında
   * server-side üretilir (DEM-227; TTL 1 saat). `null` ⇒ URL üretilemedi
   * (presign hatası / objectStorage yapılandırılmamış) → kapak gösterilmez.
   */
  coverImageUrl: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  /**
   * Görselin alana yerleşme biçimi:
   * - `cover` — alanı dolduracak şekilde kırpar (kart modal başlığı, sabit yükseklik).
   * - `natural` — görseli kendi en-boy oranıyla, kırpmadan tam gösterir (board kartı,
   *   Trello'nun tam-boy kapak davranışı).
   */
  fit?: 'cover' | 'natural';
};

/**
 * Bir kart kapağı görselini gösterir. İndirme URL'i artık ayrı bir tRPC query
 * ile değil, `board.get` / `card.get` yanıtındaki `coverImageUrl` alanı ile
 * prop olarak gelir (DEM-227 — kart başına `attachment.getDownloadUrl`
 * "waterfall" kaldırıldı). Görselin kendisi yüklenene kadar hafif bir CSS
 * spinner (`CssSpinner`) gösterilir — board render'ı bloklanmaz, görsel arka
 * planda yüklenince yumuşakça belirir. Burada bilinçle Lottie'li `AppSpinner`
 * kullanılmaz: board kart kapağı sıcak/yoğun bir yoldur ve `lottie-react`'i
 * board route ilk JS bundle'ına sokmamalı (DEM-229 #5). `coverImageUrl` `null`
 * ise kapak hiç render edilmez.
 */
export function CardCoverImage({
  coverImageUrl,
  alt,
  className,
  imageClassName,
  fit = 'cover',
}: CardCoverImageProps) {
  const [loaded, setLoaded] = useState(false);

  // Presigned URL üretilemediyse kapak şeridi hiç gösterilmez (mevcut davranış).
  if (!coverImageUrl) return null;

  const showSpinner = !loaded;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        // `natural` modda görsel yüklenene kadar yükseklik 0 olur; spinner görünür
        // kalsın diye yüklenene dek bir taban yükseklik ver.
        fit === 'natural' && showSpinner && 'min-h-[6rem]',
        className,
      )}
    >
      {showSpinner ? (
        <div className="absolute inset-0 grid place-items-center">
          <CssSpinner size="md" />
        </div>
      ) : null}
      <img
        src={coverImageUrl}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn(
          'w-full transition-opacity duration-200',
          fit === 'cover' ? 'h-full object-cover' : 'block h-auto',
          loaded ? 'opacity-100' : 'opacity-0',
          imageClassName,
        )}
      />
    </div>
  );
}
