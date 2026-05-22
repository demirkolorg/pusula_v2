'use client';

import { CalendarDays, CheckSquare } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@/lib/strings';

/**
 * `/sign-in` "ürün önizlemesi" bölümünde render edilen dekoratif mini kanban
 * önizlemesi. Ürünü "anlatmak" için Trello/Linear giriş ekranlarındaki gibi
 * statik bir pano taklididir — gerçek board bileşeni DEĞİL, gerçek veri
 * taşımaz.
 *
 * Erişilebilirlik: tüm blok `aria-hidden` — saf süs olduğu için ekran
 * okuyuculara hiçbir başlık/rol/metin duyurmaz; etkileşim de almaz
 * (`pointer-events-none`, link/buton yok). Bu yüzden buradaki `<h*>`/`<ul>`
 * yerine kasıtlı olarak `<div>` kullanılır — semantik gürültü yapmamak için.
 *
 * Görsel dil `docs/architecture/13-ui-tasarim-dili.md`'nin board/kolon/kart
 * anatomisinin hafif bir taklididir (kolon `w-56 rounded-lg`, kart
 * `rounded-md shadow-card`, `p-2.5` / `gap-2`). Pano düz (eğimsiz) durur —
 * yüzen aktivite kartları onu çerçeveler. Renkler tamamen token türevidir
 * (`bg-card`, `bg-muted/*`, `bg-palet-*`) — inline renk yok.
 *
 * Animasyon: açılışta kolonlar `motion` ile sırayla yumuşak yükselir;
 * `prefers-reduced-motion` açıksa ({@link useReducedMotion}) blok anında ve
 * statik görünür — aurora/glass-card ile aynı desen.
 */

/** Kart üstündeki renkli etiket bandı — `--palet-*` token paletinden. */
type LabelTone = 'mavi' | 'yesil' | 'turuncu' | 'mor' | 'sky' | 'pembe' | 'lime';

/** Tek kartın dekoratif içerik tanımı (saf görsel — domain modeli değil). */
type MockCard = {
  title: string;
  labels: LabelTone[];
  /** Kartta küçük avatar dairesi sayısı (0 = avatar yok). */
  avatars?: number;
  /** Takvim (son tarih) meta ikonu görünsün mü? */
  due?: boolean;
  /** Checklist meta ikonu + "x/y" metni — verilirse render edilir. */
  checklist?: string;
};

type MockColumn = {
  title: string;
  cards: MockCard[];
};

// `bg-palet-{ad}` sınıfları Tailwind tarama için tam string olmalı — bu yüzden
// dinamik `bg-palet-${tone}` yerine açık eşleme kullanılır.
const LABEL_TONE_CLASS: Record<LabelTone, string> = {
  mavi: 'bg-palet-mavi',
  yesil: 'bg-palet-yesil',
  turuncu: 'bg-palet-turuncu',
  mor: 'bg-palet-mor',
  sky: 'bg-palet-sky',
  pembe: 'bg-palet-pembe',
  lime: 'bg-palet-lime',
};

/** Dekoratif içerik — kolon adları + kart başlıkları `strings`'ten gelir. */
function buildColumns(): MockColumn[] {
  const copy = strings.auth.landing.boardMockup.columns;
  return [
    {
      title: copy.todo.title,
      cards: [
        { title: copy.todo.cards.first, labels: ['mavi'], avatars: 2, due: true },
        { title: copy.todo.cards.second, labels: ['turuncu', 'sky'], avatars: 1 },
      ],
    },
    {
      title: copy.inProgress.title,
      cards: [
        {
          title: copy.inProgress.cards.first,
          labels: ['mor', 'pembe'],
          avatars: 3,
          checklist: '2/5',
        },
        { title: copy.inProgress.cards.second, labels: ['sky'], avatars: 1, due: true },
        { title: copy.inProgress.cards.third, labels: ['turuncu'] },
      ],
    },
    {
      title: copy.done.title,
      cards: [
        { title: copy.done.cards.first, labels: ['yesil'], avatars: 2, checklist: '4/4' },
        { title: copy.done.cards.second, labels: ['yesil', 'lime'], avatars: 1 },
      ],
    },
  ];
}

/** Üst üste binen küçük avatar daireleri — saf süs (gerçek kullanıcı değil). */
function MockAvatars({ count }: { count: number }) {
  return (
    <div className="flex -space-x-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="bg-muted ring-card size-4 rounded-full ring-2"
        />
      ))}
    </div>
  );
}

/** Tek dekoratif kart — `13-ui-tasarim-dili.md` kart anatomisinin taklidi. */
function MockCardItem({ card }: { card: MockCard }) {
  const hasMeta = card.due || card.checklist || (card.avatars ?? 0) > 0;

  return (
    <div className="bg-card shadow-card rounded-md p-2.5">
      {/* Etiket bandı — kapak görseli yokken kartın "rengini" verir. */}
      <div className="mb-2 flex flex-wrap gap-1">
        {card.labels.map((tone, i) => (
          <span
            key={i}
            className={`h-1.5 w-9 rounded-sm ${LABEL_TONE_CLASS[tone]}`}
          />
        ))}
      </div>

      {/* Başlık. */}
      <p className="text-card-foreground text-xs leading-snug font-medium">
        {card.title}
      </p>

      {/* Meta satırı — küçük ikonlar + avatarlar. */}
      {hasMeta ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[10px]">
          {card.due ? (
            <span className="inline-flex items-center gap-0.5">
              <CalendarDays className="size-3" />
            </span>
          ) : null}
          {card.checklist ? (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare className="size-3" />
              {card.checklist}
            </span>
          ) : null}
          {(card.avatars ?? 0) > 0 ? (
            <span className="ml-auto">
              <MockAvatars count={card.avatars ?? 0} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BoardMockup() {
  const reduceMotion = useReducedMotion();
  const columns = buildColumns();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }
        }
        className="flex gap-4"
      >
        {columns.map((column, columnIndex) => (
          <motion.div
            key={column.title}
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 110,
                    damping: 18,
                    delay: 0.12 + columnIndex * 0.1,
                  }
            }
            className="bg-muted/40 border-border/50 w-56 shrink-0 rounded-lg border p-2.5"
          >
            {/* Kolon başlığı + kart sayısı. */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-foreground text-sm font-semibold">
                {column.title}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {column.cards.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {column.cards.map((card) => (
                <MockCardItem key={card.title} card={card} />
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
