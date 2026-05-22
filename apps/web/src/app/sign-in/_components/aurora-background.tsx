'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Animasyonlu "aurora" gradient mesh arka plan — `/sign-in` ekranının
 * hero katmanı. Tamamen dekoratiftir (`aria-hidden`), ekran okuyuculara hiçbir
 * şey duyurmaz ve etkileşim almaz.
 *
 * Katmanlar (alttan üste): düz zemin → üç yumuşak (blur'lu) radial-gradient
 * "blob" → ince nokta dokusu → cam kartın arkasına gelen hafif radial glow →
 * üst vignette. Bloblar yavaşça (26-32 sn) öteleme + ölçek döngüsüyle hareket
 * eder; net animasyon yerine ışık akışı hissi verir.
 *
 * Renkler tamamen token türevidir (`var(--primary)`, `--aurora-grid`,
 * `--aurora-glow` + `color-mix`) — light/dark modda otomatik uyum sağlar,
 * inline hex/oklch literal yoktur.
 *
 * Erişilebilirlik: `prefers-reduced-motion` açıksa
 * ({@link useReducedMotion} `true`) bloblar hareketsiz, statik bir kompozisyon
 * olarak render edilir — yine de görsel olarak hoş kalır.
 *
 * Konumlama: kök katman `fixed inset-0` — sayfa dikey kaydırmalı bir landing
 * olduğu için aurora viewport'a sabitlenir ve içerik üstünden kayarken sabit
 * bir zemin olarak kalır (`absolute` olsaydı yalnız ilk ekranı kaplardı).
 */
export function AuroraBackground() {
  const reduceMotion = useReducedMotion();

  // color-mix türevleri: token'dan üretilmiş, light/dark'a göre `--primary`
  // değiştikçe kendiliğinden kayan üç ton.
  const blobOne = 'color-mix(in oklch, var(--primary) 70%, transparent)';
  const blobTwo =
    'color-mix(in oklch, color-mix(in oklch, var(--primary) 75%, var(--aurora-accent-1)) 60%, transparent)';
  const blobThree =
    'color-mix(in oklch, color-mix(in oklch, var(--primary) 70%, var(--aurora-accent-2)) 55%, transparent)';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base — tema ile uyumlu düz zemin; bloblar bunun üstünde yüzer. */}
      <div className="bg-background absolute inset-0" />

      {/* Blob 1 — sol üst, ana marka tonu. */}
      <motion.div
        className="absolute size-[42rem] rounded-full opacity-70 blur-3xl"
        style={{
          top: '-12rem',
          left: '-10rem',
          background: `radial-gradient(circle at center, ${blobOne} 0%, transparent 70%)`,
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 80, -40, 0], y: [0, 60, 120, 0], scale: [1, 1.15, 0.95, 1] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 26, ease: 'easeInOut', repeat: Infinity }
        }
      />

      {/* Blob 2 — sağ üst, mor kayması. */}
      <motion.div
        className="absolute size-[38rem] rounded-full opacity-70 blur-3xl"
        style={{
          top: '-8rem',
          right: '-12rem',
          background: `radial-gradient(circle at center, ${blobTwo} 0%, transparent 70%)`,
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, -70, 30, 0], y: [0, 90, 40, 0], scale: [1, 0.9, 1.2, 1] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 32, ease: 'easeInOut', repeat: Infinity }
        }
      />

      {/* Blob 3 — alt orta, mavi-camgöbeği kayması. */}
      <motion.div
        className="absolute size-[40rem] rounded-full opacity-70 blur-3xl"
        style={{
          bottom: '-16rem',
          left: '30%',
          background: `radial-gradient(circle at center, ${blobThree} 0%, transparent 70%)`,
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 60, -80, 0], y: [0, -50, 30, 0], scale: [1, 1.18, 0.92, 1] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 28, ease: 'easeInOut', repeat: Infinity }
        }
      />

      {/* İnce nokta dokusu — `--aurora-grid` token renkli repeating radial
          pattern. Çok düşük opaklıkta tutulur (metin okunabilirliğini bozmaz),
          bloblara yumuşak bir "ızgara" derinliği katar. */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(var(--aurora-grid) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Cam kartın arkasına gelen yumuşak parıltı — `--aurora-glow` token
          (primary türevi). Sağ-orta bölgeye konumlanır (kart geniş ekranda
          orada). Düşük yoğunluk + geniş yayılım ile metin/form kontrastını
          bozmaz; light + dark modda token üzerinden uyum sağlar. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(28rem 28rem at 78% 46%, var(--aurora-glow) 0%, transparent 72%)',
        }}
      />

      {/* Üst vignette — içeriğin (cam kart / metin) okunabilirliğini artırmak
          için kenarları hafifçe zemine doğru söndürür. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 35%, color-mix(in oklch, var(--background) 70%, transparent) 100%)',
        }}
      />
    </div>
  );
}
