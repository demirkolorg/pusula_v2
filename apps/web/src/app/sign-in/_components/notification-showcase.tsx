'use client';

import type { LucideIcon } from 'lucide-react';
import { AtSign, Bell, CalendarClock, MessageSquare, UserPlus } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` landing sayfasının "bildirim sistemi" vitrini bölümü. Kendi
 * `<section>` kabuğunu ve dikey boşluğunu taşır.
 *
 * Pusula'nın outbox tabanlı bildirim altyapısını (anlık in-app bildirim,
 * mobil push, e-posta özeti, aktivite geçmişi) GÖRSEL olarak anlatır. Başlık
 * ({@link strings.auth.landing.notificationShowcase.heading}) ve açıklaması
 * gerçek içeriktir — erişilebilir bir `<h2>` + `<p>` taşır.
 *
 * Görseller (bildirim merkezi paneli + mobil push kabarcığı) tamamen
 * dekoratiftir: her ikisi de `aria-hidden` + `pointer-events-none` — ekran
 * okuyucu yalnız başlık/açıklamayı duyar, sahte bildirim metinleri gürültü
 * yapmaz. Görsel dil `docs/architecture/13-ui-tasarim-dili.md` panel/kart
 * anatomisinin taklididir (`bg-card rounded-lg shadow-card border`); renkler
 * tamamen token türevidir.
 *
 * Animasyon: blok viewport'a yaklaşınca `motion` ile yumuşak belirir; push
 * kabarcığı çok hafif salınır. `prefers-reduced-motion` açıksa
 * ({@link useReducedMotion}) her şey statik görünür — diğer bölümlerle aynı
 * desen.
 *
 * Yerleşim: mobilde başlık+açıklama üstte, görsel altta dikey istif; `lg` ve
 * üzeri iki kolon (metin solda, görsel sağda).
 */

/** Bildirim satırı tipleri — her biri bir lucide ikona eşlenir. */
type NotificationType = 'mention' | 'comment' | 'assigned' | 'due';

/** Bildirim tipi → ikon eşlemesi (saf görsel, domain modeli değil). */
const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  mention: AtSign,
  comment: MessageSquare,
  assigned: UserPlus,
  due: CalendarClock,
};

/** Bildirim tipi → ikon arka plan tonu — `--palet-*` token paletinden.
 *  Tailwind tarama için tam string olmalı; dinamik birleştirme yapılmaz. */
const TYPE_TONE_CLASS: Record<NotificationType, string> = {
  mention: 'bg-palet-mor/15 text-palet-mor',
  comment: 'bg-palet-mavi/15 text-palet-mavi',
  assigned: 'bg-palet-yesil/15 text-palet-yesil',
  due: 'bg-palet-turuncu/15 text-palet-turuncu',
};

/** Tek dekoratif bildirim satırı — panel/kart anatomisinin taklidi. */
function NotificationRow({
  item,
}: {
  item: {
    type: string;
    text: string;
    time: string;
    unread: boolean;
  };
}) {
  // `strings`'ten gelen `type` geniş `string`; bilinen bir tipe daralt,
  // tanınmayan değer için yorum ikonuna düş (savunmacı fallback).
  const type: NotificationType = (
    ['mention', 'comment', 'assigned', 'due'] as const
  ).includes(item.type as NotificationType)
    ? (item.type as NotificationType)
    : 'comment';
  const Icon = TYPE_ICON[type];

  return (
    <div className="flex items-start gap-2.5 px-3.5 py-3">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${TYPE_TONE_CLASS[type]}`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-card-foreground block text-xs leading-snug font-medium">
          {item.text}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-[10px] leading-tight">
          {item.time}
        </span>
      </span>
      {item.unread ? (
        <span className="bg-primary mt-1 size-2 shrink-0 rounded-full" />
      ) : null}
    </div>
  );
}

/** Bildirim merkezi paneli mockup'ı — statik, dekoratif (aria-hidden). */
function NotificationPanel() {
  const copy = strings.auth.landing.notificationShowcase.panel;

  return (
    <div className="bg-card shadow-card border-border w-full max-w-sm overflow-hidden rounded-lg border">
      {/* Panel başlığı — okunmamış sayacı rozeti. */}
      <div className="border-border/70 flex items-center justify-between border-b px-3.5 py-3">
        <span className="text-card-foreground flex items-center gap-1.5 text-xs font-semibold">
          <Bell className="size-3.5" />
          {copy.title}
        </span>
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
          {copy.unreadBadge}
        </span>
      </div>

      {/* Bildirim satırları — aralarında ince ayraç. */}
      <div className="divide-border/60 divide-y">
        {copy.items.map((item) => (
          <NotificationRow key={item.text} item={item} />
        ))}
      </div>
    </div>
  );
}

/** Mobil push bildirimi kabarcığı — panelin üstünde hafif yüzer (dekoratif). */
function PushBubble() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.notificationShowcase.push;

  return (
    <motion.div
      className="bg-card/90 border-border shadow-popover absolute -top-6 -right-3 flex w-60 items-start gap-2.5 rounded-xl border px-3 py-2.5 backdrop-blur-md sm:-right-6"
      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
      transition={
        reduceMotion
          ? undefined
          : { duration: 6, ease: 'easeInOut', repeat: Infinity }
      }
    >
      <span className="bg-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
        <Bell className="size-3.5 text-primary-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-card-foreground truncate text-[11px] font-semibold">
            {copy.appName}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px]">
            {copy.time}
          </span>
        </span>
        <span className="text-card-foreground mt-0.5 block text-xs leading-tight font-medium">
          {copy.title}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
          {copy.body}
        </span>
      </span>
    </motion.div>
  );
}

export function NotificationShowcase() {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth.landing.notificationShowcase;

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
      className="relative z-10 px-6 py-14 sm:px-10 lg:py-20"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
        {/* Metin bloğu — gerçek içerik. Mobilde üstte, geniş ekranda solda. */}
        <div className="max-w-md text-center lg:flex-1 lg:text-left">
          <span className="text-primary text-sm font-medium tracking-wide">
            {copy.eyebrow}
          </span>
          <h2 className="text-foreground mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.heading}
          </h2>
          <p className="text-muted-foreground mt-3 text-base/relaxed">
            {copy.description}
          </p>
        </div>

        {/* Görsel blok — bildirim merkezi paneli + üstte yüzen push kabarcığı.
            Tamamen dekoratif: aria-hidden + pointer-events-none. */}
        <div
          aria-hidden="true"
          className="pointer-events-none relative w-full max-w-sm shrink-0 select-none pt-6 lg:pt-0"
        >
          <NotificationPanel />
          <PushBubble />
        </div>
      </div>
    </motion.section>
  );
}
