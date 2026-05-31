'use client';

import { CalendarIcon, CompassIcon, InboxIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

type LeftRailProps = {
  navigatorOpen: boolean;
  quickNotesOpen: boolean;
  /** Faz 16B (DEM-311) — Planlayıcı paneli açık mı? */
  plannerOpen: boolean;
  onNavigatorToggle: () => void;
  onQuickNotesToggle: () => void;
  /** Faz 16B (DEM-311) — Planlayıcı toggle callback. */
  onPlannerToggle: () => void;
  /**
   * `true` ise board ekranındayız — rail kart yerine board chrome (`bg-board-shell`)
   * üzerinde dursun (yuvarlak kart efekti yok, panel/main ile aynı kabuk rengi).
   */
  fullBleed: boolean;
};

/**
 * Sol dikey rail — Gezgin + Hızlı Notlar + Planlayıcı toggle'larını barındırır.
 * VSCode/Linear/Slack tarzı Activity Bar: ince (48px) dikey kolon, icon-only,
 * hover'da tooltip label sağda görünür. Açık olan toggle hafif vurgulu
 * (`bg-accent/40`).
 *
 * `lg+`: panellerin solunda persistent kart (header altında, "windowed" gövde
 * içinde yuvarlak köşeli). `<lg` (mobil): aynı yerde, kenarsız/köşesiz —
 * mobilde panel overlay olarak rail'in üzerine açılır (rail görünür kalır).
 *
 * Faz 16B (DEM-311): 3. toggle (Planlayıcı = `CalendarIcon`) eklendi.
 * Mobil mutex (3-panel arası) `AppShell`'de yönetilir.
 */
export function LeftRail({
  navigatorOpen,
  quickNotesOpen,
  plannerOpen,
  onNavigatorToggle,
  onQuickNotesToggle,
  onPlannerToggle,
  fullBleed,
}: LeftRailProps) {
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={navigatorOpen}
            aria-label={strings.board.navigator.toggle}
            onClick={onNavigatorToggle}
            className={cn('size-8', navigatorOpen && 'bg-accent/40')}
          >
            <CompassIcon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{strings.board.navigator.toggle}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={quickNotesOpen}
            aria-label={strings.board.quickNotes.toggle}
            onClick={onQuickNotesToggle}
            className={cn('size-8', quickNotesOpen && 'bg-accent/40')}
          >
            <InboxIcon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{strings.board.quickNotes.toggle}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={plannerOpen}
            aria-label={strings.board.planner.toggle}
            onClick={onPlannerToggle}
            className={cn('size-8', plannerOpen && 'bg-accent/40')}
          >
            <CalendarIcon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{strings.board.planner.toggle}</TooltipContent>
      </Tooltip>
    </nav>
  );
}
