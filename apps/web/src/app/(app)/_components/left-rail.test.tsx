import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { LeftRail } from './left-rail';

/**
 * LeftRail için RTL test seti. 6 toggle (Gezgin / Hızlı Notlar / Planlayıcı /
 * Görevlerim / Aktivite Akışı / Yenilikler) render edilir, `activePanel` ile
 * aktif olanın `aria-pressed=true` olur ve tıklama parent'a yansır. Tek panel
 * ilkesi: `activePanel` aynı anda yalnız bir id taşıyabilir; aktif butona
 * tekrar tıklamak parent'ta `togglePanel` çağrılır (parent state'i `null`
 * yapar).
 */

function renderRail(
  overrides: Partial<React.ComponentProps<typeof LeftRail>> = {},
): { onTogglePanel: ReturnType<typeof vi.fn> } {
  const onTogglePanel = vi.fn();
  render(
    <LeftRail
      activePanel={null}
      onTogglePanel={onTogglePanel}
      fullBleed={false}
      {...overrides}
    />,
  );
  return { onTogglePanel };
}

describe('<LeftRail>', () => {
  it('renders all six toggles with localized aria labels', () => {
    renderRail();
    expect(
      screen.getByRole('button', { name: strings.board.navigator.toggle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.quickNotes.toggle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.myTasks.toggle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.activityFeed.toggle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.board.whatsNew.toggle }),
    ).toBeInTheDocument();
  });

  it('reflects activePanel through aria-pressed (only one button pressed at a time)', () => {
    renderRail({ activePanel: 'planner' });
    expect(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: strings.board.navigator.toggle }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: strings.board.myTasks.toggle }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: strings.board.activityFeed.toggle }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('invokes onTogglePanel with "planner" when the Planlayıcı button is clicked', async () => {
    const user = userEvent.setup();
    const { onTogglePanel } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    );
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    expect(onTogglePanel).toHaveBeenCalledWith('planner');
  });

  it('invokes onTogglePanel with "myTasks" when the Görevlerim button is clicked', async () => {
    const user = userEvent.setup();
    const { onTogglePanel } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.myTasks.toggle }),
    );
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    expect(onTogglePanel).toHaveBeenCalledWith('myTasks');
  });

  it('invokes onTogglePanel with "activityFeed" when the Aktivite Akışı button is clicked', async () => {
    const user = userEvent.setup();
    const { onTogglePanel } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.activityFeed.toggle }),
    );
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    expect(onTogglePanel).toHaveBeenCalledWith('activityFeed');
  });

  it('invokes onTogglePanel with "whatsNew" when the Yenilikler button is clicked', async () => {
    const user = userEvent.setup();
    const { onTogglePanel } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.whatsNew.toggle }),
    );
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    expect(onTogglePanel).toHaveBeenCalledWith('whatsNew');
  });

  it('invokes onTogglePanel with the active panel id when the active button is clicked again (toggle off)', async () => {
    const user = userEvent.setup();
    const { onTogglePanel } = renderRail({ activePanel: 'quickNotes' });
    await user.click(
      screen.getByRole('button', { name: strings.board.quickNotes.toggle }),
    );
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
    expect(onTogglePanel).toHaveBeenCalledWith('quickNotes');
  });
});
