'use client';

import { useCallback, useState } from 'react';
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
   * - `cover` — alanı dolduracak şekilde kırpar (sabit yükseklik gerektirir).
   * - `contain` — kapsayıcıya sığacak şekilde, en-boy oranı korunarak ortalı
   *   gösterir; küçük görsellerde arka plan görünür (kart modal başlığı,
   *   Trello'nun banner davranışı).
   * - `natural` — görseli kendi en-boy oranıyla, kırpmadan tam gösterir (board kartı,
   *   Trello'nun tam-boy kapak davranışı).
   */
  fit?: 'cover' | 'contain' | 'natural';
  /**
   * Görsel yüklendiğinde 1×1 canvas örneklemesiyle bulunan baskın RGB rengi
   * `rgb(r,g,b)` formatında geri çağrı ile iletilir (modal banner arkaplanı için).
   * CORS engeli (canvas tainted) veya `decoding` hatasında çağrılmaz — caller
   * sessizce mevcut arka planında kalır. Sadece `contain` modda anlamlı.
   */
  onDominantColor?: (rgb: string) => void;
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
  onDominantColor,
}: CardCoverImageProps) {
  const [loaded, setLoaded] = useState(false);

  // Baskın rengi ayrı bir `Image` ile sample et — ana `<img>`'ye `crossOrigin`
  // koymadığımız için MinIO bucket CORS başlığı yoksa bile kullanıcı kapağı
  // görür. Probe başarısız olursa (CORS reddi → onerror, ya da canvas tainted
  // → SecurityError) caller mevcut arka planında sessizce kalır.
  //
  // Sample stratejisi: görselin 4 köşesinden pixel oku, alpha < 200 olanları
  // (yarı şeffaf / şeffaf PNG kenarları) yok say. Geriye kalan opak köşelerin
  // ortalaması banner arkaplanı olur. Bu yaklaşım:
  // - Transparent logo PNG'lerde köşeler şeffaf → callback hiç çağrılmaz, modal
  //   `bg-muted` fallback'inde kalır (görsel/arka plan karışması önlenir).
  // - Fotoğraflarda köşeler doludur → makul bir kenar rengi verir.
  // Görsel önce makul bir boyuta (≤128px) ölçeklenir; tüm pixel'leri okumaktan
  // değil, sadece 4 köşeden okuduğumuz için maliyet zaten düşük ama kararlı bir
  // sample için resize yine de yapılır.
  const handleLoad = useCallback(() => {
    setLoaded(true);
    if (!onDominantColor || !coverImageUrl || typeof window === 'undefined') return;
    const probe = new window.Image();
    probe.crossOrigin = 'anonymous';
    probe.decoding = 'async';
    probe.onload = () => {
      try {
        const w = probe.naturalWidth;
        const h = probe.naturalHeight;
        if (!w || !h) return;
        const max = 128;
        const scale = Math.min(1, max / Math.max(w, h));
        const cw = Math.max(2, Math.round(w * scale));
        const ch = Math.max(2, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(probe, 0, 0, cw, ch);
        const corners: Array<readonly [number, number]> = [
          [0, 0],
          [cw - 1, 0],
          [0, ch - 1],
          [cw - 1, ch - 1],
        ];
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [x, y] of corners) {
          const px = ctx.getImageData(x, y, 1, 1).data;
          if (px.length < 4) continue;
          const pa = px[3]!;
          if (pa < 200) continue;
          r += px[0]!;
          g += px[1]!;
          b += px[2]!;
          n += 1;
        }
        if (n === 0) return; // tüm köşeler şeffaf → fallback bg-muted kalır
        onDominantColor(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch {
        // tainted canvas / SecurityError — sessizce düş
      }
    };
    probe.onerror = () => {
      // CORS reject veya ağ hatası — sessizce düş
    };
    probe.src = coverImageUrl;
  }, [coverImageUrl, onDominantColor]);

  // Presigned URL üretilemediyse kapak şeridi hiç gösterilmez (mevcut davranış).
  if (!coverImageUrl) return null;

  const showSpinner = !loaded;

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        // `contain` modda arka plan rengini caller (modal banner) dominant
        // renkle kontrol eder; diğer modlarda eskiden olduğu gibi bg-muted.
        fit !== 'contain' && 'bg-muted',
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
        onLoad={handleLoad}
        onError={() => setLoaded(true)}
        className={cn(
          'transition-opacity duration-200',
          fit === 'cover' && 'h-full w-full object-cover',
          fit === 'contain' && 'mx-auto block h-full max-h-full w-auto max-w-full object-contain',
          fit === 'natural' && 'block h-auto w-full',
          loaded ? 'opacity-100' : 'opacity-0',
          imageClassName,
        )}
      />
    </div>
  );
}
