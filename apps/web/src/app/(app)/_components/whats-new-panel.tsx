'use client';

import Link from 'next/link';
import { ArrowUpRightIcon, SparklesIcon, XIcon } from 'lucide-react';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pusula/ui';
import { ChangelogDayList } from '@/components/changelog-view';
import { CHANGELOG } from '@/lib/changelog-data';
import { strings } from '@/lib/strings';

type WhatsNewPanelProps = {
  /** Close the panel (the global header / rail toggle owns the open state). */
  onClose: () => void;
  /**
   * Bir link / aksiyon sonrası çağrılır. Mobil sheet modunda panelin kendini
   * kapatması için kullanılır; persistent (lg+) modda parent `undefined`
   * geçer ve panel açık kalır. Burada "Tam sayfada aç" linki tetikler.
   */
  onNavigate?: () => void;
};

/**
 * Global "Yenilikler" paneli (2026-06-01) — `/yenilikler` sayfasının kompakt
 * embed'i. `CHANGELOG` verisini tek kaynak olarak paylaşır; `ChangelogDayList`
 * + `ChangelogLegend` aynı atomları render eder.
 *
 * Diğer global panellerle (Gezgin / Hızlı Notlar / Planlayıcı / Görevlerim /
 * Aktivite Akışı) birebir aynı görsel kabuk:
 * - `lg+`: persistent sidebar (yuvarlak köşeli kart).
 * - `<lg`: overlay sheet (full-bleed).
 * - Sistem teması (`bg-background` + `text-foreground`) — pano arka planından
 *   bağımsız.
 *
 * Üst başlık + içerik (description + legend + scroll edilebilir gün listesi)
 * + alt aksiyon ("Tam sayfada aç" → `/yenilikler`).
 */
export function WhatsNewPanel({ onClose, onNavigate }: WhatsNewPanelProps) {
  const copy = strings.board.whatsNew;

  return (
    <aside
      aria-label={copy.panelTitle}
      className="bg-background text-foreground border-border flex h-full w-[28rem] shrink-0 flex-col overflow-hidden lg:rounded-xl lg:border"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
            <SparklesIcon aria-hidden className="text-primary size-4" />
            <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={copy.close}
                  onClick={onClose}
                >
                  <XIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{strings.common.panels.closeShortcut}</TooltipContent>
            </Tooltip>
          </header>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onClose}>
            {strings.common.panels.closeThis}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pt-4">
        {/* Gün gün scroll edilebilir gövde. `pusula-scrollbar` diğer panellerle
            aynı ince scrollbar stili. Legend kaldırıldı (2026-06-01 ince ayar)
            — kompakt `KindBadge` rozeti zaten her satırda görünür/anlaşılır. */}
        <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
          <ChangelogDayList days={CHANGELOG} />
        </div>
      </div>

      {/* Alt aksiyon — `/yenilikler` sayfasına tam liste için git. Sayfa
          SEO/deep-link/landing footer için ayakta; panel kompakt embed. */}
      <footer className="border-border bg-card/40 shrink-0 border-t px-4 py-3">
        <Link
          href="/yenilikler"
          onClick={() => onNavigate?.()}
          className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2"
        >
          {copy.openFullPage}
          <ArrowUpRightIcon className="size-3.5" aria-hidden />
        </Link>
      </footer>
    </aside>
  );
}
