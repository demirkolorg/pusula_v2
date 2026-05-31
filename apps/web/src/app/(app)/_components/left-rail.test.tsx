import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { LeftRail } from './left-rail';

/**
 * Faz 16B (DEM-311) — LeftRail için ilk RTL test seti. 3 toggle (Gezgin /
 * Hızlı Notlar / Planlayıcı) render edilir, açık olan `aria-pressed=true`
 * olur ve tıklama parent'a yansır.
 */

function renderRail(
  overrides: Partial<React.ComponentProps<typeof LeftRail>> = {},
): {
  onNavigatorToggle: () => void;
  onQuickNotesToggle: () => void;
  onPlannerToggle: () => void;
} {
  const onNavigatorToggle = vi.fn();
  const onQuickNotesToggle = vi.fn();
  const onPlannerToggle = vi.fn();
  render(
    <LeftRail
      navigatorOpen={false}
      quickNotesOpen={false}
      plannerOpen={false}
      onNavigatorToggle={onNavigatorToggle}
      onQuickNotesToggle={onQuickNotesToggle}
      onPlannerToggle={onPlannerToggle}
      fullBleed={false}
      {...overrides}
    />,
  );
  return { onNavigatorToggle, onQuickNotesToggle, onPlannerToggle };
}

describe('<LeftRail>', () => {
  it('renders all three toggles with localized aria labels', () => {
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
  });

  it('reflects open state through aria-pressed', () => {
    renderRail({ plannerOpen: true });
    expect(
      screen.getByRole('button', { name: strings.board.planner.toggle }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: strings.board.navigator.toggle }),
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
});
