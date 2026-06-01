import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { LeftRail } from './left-rail';

/**
 * Faz 16B (DEM-311) + Faz 17 — LeftRail için RTL test seti. 5 toggle (Gezgin
 * / Hızlı Notlar / Planlayıcı / Görevlerim / Aktivite Akışı) render edilir,
 * açık olan `aria-pressed=true` olur ve tıklama parent'a yansır.
 */

function renderRail(
  overrides: Partial<React.ComponentProps<typeof LeftRail>> = {},
): {
  onNavigatorToggle: () => void;
  onQuickNotesToggle: () => void;
  onPlannerToggle: () => void;
  onMyTasksToggle: () => void;
  onActivityFeedToggle: () => void;
} {
  const onNavigatorToggle = vi.fn();
  const onQuickNotesToggle = vi.fn();
  const onPlannerToggle = vi.fn();
  const onMyTasksToggle = vi.fn();
  const onActivityFeedToggle = vi.fn();
  render(
    <LeftRail
      navigatorOpen={false}
      quickNotesOpen={false}
      plannerOpen={false}
      myTasksOpen={false}
      activityFeedOpen={false}
      onNavigatorToggle={onNavigatorToggle}
      onQuickNotesToggle={onQuickNotesToggle}
      onPlannerToggle={onPlannerToggle}
      onMyTasksToggle={onMyTasksToggle}
      onActivityFeedToggle={onActivityFeedToggle}
      fullBleed={false}
      {...overrides}
    />,
  );
  return {
    onNavigatorToggle,
    onQuickNotesToggle,
    onPlannerToggle,
    onMyTasksToggle,
    onActivityFeedToggle,
  };
}

describe('<LeftRail>', () => {
  it('renders all five toggles with localized aria labels', () => {
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
  });

  it('reflects open state through aria-pressed', () => {
    renderRail({ plannerOpen: true, myTasksOpen: true });
    expect(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: strings.board.myTasks.toggle }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: strings.board.navigator.toggle }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: strings.board.activityFeed.toggle }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('invokes onPlannerToggle when the Planlayıcı button is clicked', async () => {
    const user = userEvent.setup();
    const { onPlannerToggle } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    );
    expect(onPlannerToggle).toHaveBeenCalledTimes(1);
  });

  it('invokes onMyTasksToggle when the Görevlerim button is clicked', async () => {
    const user = userEvent.setup();
    const { onMyTasksToggle } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.myTasks.toggle }),
    );
    expect(onMyTasksToggle).toHaveBeenCalledTimes(1);
  });

  it('invokes onActivityFeedToggle when the Aktivite Akışı button is clicked', async () => {
    const user = userEvent.setup();
    const { onActivityFeedToggle } = renderRail();
    await user.click(
      screen.getByRole('button', { name: strings.board.activityFeed.toggle }),
    );
    expect(onActivityFeedToggle).toHaveBeenCalledTimes(1);
  });
});
