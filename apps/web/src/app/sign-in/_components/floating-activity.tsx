'use client';

import type { LucideIcon } from 'lucide-react';
import { CalendarClock, MessageSquare, MoveRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` board mockup'ının çevresinde yüzen dekoratif mini aktivite
 * kartları — "ürün canlı" hissi veren küçük cam bildirim parçaları.
 *
 * Tamamen süstür: tüm blok `aria-hidden`, `pointer-events-none` — ekran
 * okuyuculara hiçbir şey duyurmaz, etkileşim almaz. İçerik (sahte aktivite
 * metinleri) `strings.auth.landing.floatingActivity`'ten gelir.
 *
 * Konum: board mockup'ı saran `relative` wrapper içinde `absolute` yerleşir
 * (page.tsx). Yalnız geniş ekranda (`lg`) görünür — mockup `hidden lg:block`
 * olduğu için bunlar da `hidden lg:block`.
 *
 * Animasyon: her parça `motion` ile y ekseninde yavaş, hafif bir salınım
 * yapar (her biri farklı süre/gecikme). `prefers-reduced-motion` açıksa
 * ({@link useReducedMotion}) parçalar statik durur — aurora/board-mockup ile
 * aynı desen.
 */

/** Avatar dairesi rengi — `--palet-*` token paletinden (purge-güvenli). */
type AvatarTone = 'mavi' | 'yesil' | 'turuncu' | 'mor';

const AVATAR_TONE_CLASS: Record<AvatarTone, string> = {
  mavi: 'bg-palet-mavi',
  yesil: 'bg-palet-yesil',
  turuncu: 'bg-palet-turuncu',
  mor: 'bg-palet-mor',
};

/** Tek yüzen parçanın tanımı — saf görsel, domain modeli değil. */
type FloatingPiece = {
  /** Sol başlangıç ya da avatar yerine kullanılacak ikon. */
  icon: LucideIcon;
  /** İkon arka plan dairesi tonu. */
  tone: AvatarTone;
  /** Kısa aktivite metni. */
  text: string;
  /** Zaman damgası metni. */
  time: string;
  /** Tailwind konumlandırma sınıfları (`absolute` ile birlikte). */
  position: string;
  /** Salınım animasyonu süresi (sn). */
  duration: number;
  /** Animasyon başlangıç gecikmesi (sn). */
  delay: number;
};

function buildPieces(): FloatingPiece[] {
  const copy = strings.auth.landing.floatingActivity;
  // Konumlar panoyu çerçeveler: sol-üst köşe · sağ kenar ortası · sol-alt.
  // Negatif offsetler panonun hafifçe dışına taşar — `pt`/`pb`'li, taşmayı
  // kesen (`overflow-hidden`) bölüm içinde güvenle durur (bkz. page.tsx).
  return [
    {
      icon: MoveRight,
      tone: 'mavi',
      text: copy.cardMoved,
      time: copy.timeMovedAgo,
      position: '-top-5 -left-8',
      duration: 7,
      delay: 0,
    },
    {
      icon: MessageSquare,
      tone: 'mor',
      text: copy.newComment,
      time: copy.timeCommentAgo,
      // Dikey ortalamada `-translate-y-1/2` KULLANILMAZ — motion'ın `y`
      // animasyonu transform'u ele geçirir, çakışır. Yüzde `top` ile konumlanır.
      position: 'top-1/3 -right-10',
      duration: 9,
      delay: 1.4,
    },
    {
      icon: CalendarClock,
      tone: 'turuncu',
      text: copy.dueSoon,
      time: copy.timeDueAgo,
      position: '-bottom-5 left-14',
      duration: 8,
      delay: 2.6,
    },
  ];
}

function FloatingActivityPiece({ piece }: { piece: FloatingPiece }) {
  const reduceMotion = useReducedMotion();
  const Icon = piece.icon;

  return (
    <motion.div
      className={`bg-card/80 border-border/60 shadow-popover absolute flex max-w-[13rem] items-center gap-2 rounded-lg border px-2.5 py-2 backdrop-blur-md ${piece.position}`}
      animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
      transition={
        reduceMotion
          ? undefined
          : {
              duration: piece.duration,
              ease: 'easeInOut',
              repeat: Infinity,
              delay: piece.delay,
            }
      }
    >
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full ${AVATAR_TONE_CLASS[piece.tone]}`}
      >
        <Icon className="size-3 text-primary-foreground" />
      </span>
      <span className="min-w-0">
        <span className="text-card-foreground block truncate text-[11px] leading-tight font-medium">
          {piece.text}
        </span>
        <span className="text-muted-foreground block text-[10px] leading-tight">
          {piece.time}
        </span>
      </span>
    </motion.div>
  );
}

export function FloatingActivity() {
  const pieces = buildPieces();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      {pieces.map((piece) => (
        <FloatingActivityPiece key={piece.text} piece={piece} />
      ))}
    </div>
  );
}
