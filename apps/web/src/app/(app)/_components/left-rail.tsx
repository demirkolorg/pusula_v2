'use client';

import {
  ActivityIcon,
  CalendarIcon,
  CompassIcon,
  InboxIcon,
  ListChecksIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import type { LeftPanelId } from './left-panel-context';

type LeftRailProps = {
  /** Aktif sol panel id'si; `null` ise hiçbir panel açık değil. */
  activePanel: LeftPanelId | null;
  /**
   * Bir panel butonuna tıklandığında çağrılır. Aktif panele tıklamak onu
   * kapatır; başka panele tıklamak ona geçer (tek panel ilkesi — mutually
   * exclusive).
   */
  onTogglePanel: (id: LeftPanelId) => void;
  /**
   * `true` ise board ekranındayız — rail kart yerine board chrome
   * (`bg-board-shell`) üzerinde dursun (yuvarlak kart efekti yok,
   * panel/main ile aynı kabuk rengi).
   */
  fullBleed: boolean;
};

type PanelDef = {
  id: LeftPanelId;
  icon: typeof CompassIcon;
  label: string;
};

const PANEL_BUTTONS: readonly PanelDef[] = [
  { id: 'navigator', icon: CompassIcon, label: strings.board.navigator.toggle },
  { id: 'quickNotes', icon: InboxIcon, label: strings.board.quickNotes.toggle },
  { id: 'planner', icon: CalendarIcon, label: strings.board.planner.toggle },
  { id: 'myTasks', icon: ListChecksIcon, label: strings.board.myTasks.toggle },
  {
    id: 'activityFeed',
    icon: ActivityIcon,
    label: strings.board.activityFeed.toggle,
  },
  // 6. panel (2026-06-01) — Yenilikler. Sparkles ikonu hero pill ile aynı
  // dil; rail'ın en altında ek "ürün-pulse" katmanı.
  { id: 'whatsNew', icon: SparklesIcon, label: strings.board.whatsNew.toggle },
] as const;

/**
 * Sol dikey rail — 5 global panel (Gezgin / Hızlı Notlar / Planlayıcı /
 * Görevlerim / Aktivite Akışı) için tek tek toggle butonu. VSCode/Linear/Slack
 * tarzı Activity Bar: ince (48px) dikey kolon, icon-only, hover'da tooltip
 * sağda. Aktif butonun arka planı hafif vurgulu (`bg-accent/40`).
 *
 * Tek panel ilkesi (mutually exclusive): aynı anda yalnız 1 panel açık olabilir.
 * Bu yüzden eski "Tümünü kapat" butonu kaldırıldı — aktif butona tekrar basmak
 * onu zaten kapatıyor, ek olarak Esc kısayolu da çalışıyor.
 */
export function LeftRail({ activePanel, onTogglePanel, fullBleed }: LeftRailProps) {
  return (
    <nav
      aria-label={strings.common.navigationRail}
      className={cn(
        'flex w-10 shrink-0 flex-col items-center gap-1 py-1.5',
        fullBleed
          ? 'bg-board-shell text-[color:var(--board-chrome-fg)]'
          : 'bg-card lg:rounded-xl lg:border lg:shadow-card',
      )}
    >
      {PANEL_BUTTONS.map(({ id, icon: Icon, label }) => {
        const isActive = activePanel === id;
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={isActive}
                aria-label={label}
                onClick={() => onTogglePanel(id)}
                className={cn('size-8', isActive && 'bg-accent/40')}
              >
                <Icon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
